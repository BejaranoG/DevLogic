/**
 * app/api/proyeccion/route.ts
 * POST /api/proyeccion — Runs M4 projection for a single disposition
 */

import { NextResponse } from "next/server";
import { findDisposicionConTipo } from "../../../lib/store";
import { proyectarDisposicion } from "../../../engine/proyeccion/index";
import { redondear2, tasaADecimal, BASE_360, ZERO } from "../../../engine/shared/decimal-helpers";
import type Decimal from "decimal.js";
import type { PeriodoOperativo, Disposicion, SnapshotDiario } from "../../../engine/shared/types";

export const dynamic = "force-dynamic";

function dec(d: Decimal): number {
  return redondear2(d).toNumber();
}

function parseFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Calcula los vencimientos (pagos) que caen en la fecha objetivo.
 * Usa los snapshots de M4 para obtener saldos reales proyectados
 * (incluye refinanciado compuesto en capitalización).
 */
function calcularVencimientos(
  disp: Disposicion,
  periodos: PeriodoOperativo[],
  fechaObjetivo: Date,
  snapshots: SnapshotDiario[]
) {
  const tsObjDate = new Date(
    fechaObjetivo.getFullYear(),
    fechaObjetivo.getMonth(),
    fechaObjetivo.getDate()
  ).getTime();

  // Only periodos with fecha_limite_pago on the exact target date
  const enFecha = periodos
    .filter((p) => {
      if (p.liquidada) return false;
      const tsPago = new Date(
        p.fecha_limite_pago.getFullYear(),
        p.fecha_limite_pago.getMonth(),
        p.fecha_limite_pago.getDate()
      ).getTime();
      return tsPago === tsObjDate;
    })
    .sort((a, b) => a.fecha_limite_pago.getTime() - b.fecha_limite_pago.getTime());

  if (enFecha.length === 0) return [];

  // Find snapshot from the day BEFORE the vencimiento to get pre-movement saldos.
  // The snapshot on the vencimiento day already moved saldos to impago (step 1 of loop),
  // so we need the day before to see what was vigente.
  const dayBeforeTs = tsObjDate - 86400000; // 1 day before
  let preSnapshot = snapshots.find((s) => {
    const sTs = new Date(s.fecha.getFullYear(), s.fecha.getMonth(), s.fecha.getDate()).getTime();
    return sTs === dayBeforeTs;
  });

  // Fallback: if no snapshot the day before (e.g. first day of projection), use T₀ saldos
  if (!preSnapshot && snapshots.length > 0) {
    // Try the snapshot on the target date itself
    preSnapshot = snapshots.find((s) => {
      const sTs = new Date(s.fecha.getFullYear(), s.fecha.getMonth(), s.fecha.getDate()).getTime();
      return sTs === tsObjDate;
    });
  }

  const tasa = tasaADecimal(disp.tasa_base_ordinaria);
  const vencimientos: any[] = [];

  for (const p of enFecha) {
    // Calculate interest for this period using projected base
    let baseInteres: Decimal;
    if (preSnapshot) {
      const ps = preSnapshot.saldos;
      baseInteres = ps.capital_vigente.plus(ps.capital_vencido_no_exigible);
      if (disp.esquema_interes === "capitalizacion") {
        baseInteres = baseInteres
          .plus(ps.interes_refinanciado_vigente)
          .plus(ps.interes_refinanciado_vne);
      }
    } else {
      // Fallback to T₀ saldos
      baseInteres = disp.saldos.capital_vigente.plus(disp.saldos.capital_vencido_no_exigible);
      if (disp.esquema_interes === "capitalizacion") {
        baseInteres = baseInteres
          .plus(disp.saldos.interes_refinanciado_vigente)
          .plus(disp.saldos.interes_refinanciado_vne);
      }
    }

    const interesPeriodo = baseInteres.isZero() || p.dias_periodo <= 0
      ? ZERO
      : baseInteres.mul(tasa).div(BASE_360).mul(p.dias_periodo);

    const capitalPeriodo = p.monto_capital;

    // For capitalización: refinanciado acumulado becomes exigible when capital vences
    let refinanciadoExigible = ZERO;
    if (disp.esquema_interes === "capitalizacion" && preSnapshot) {
      refinanciadoExigible = preSnapshot.saldos.interes_refinanciado_vigente
        .plus(preSnapshot.saldos.interes_refinanciado_vne);
    } else if (disp.esquema_interes === "capitalizacion") {
      // Fallback to T₀
      refinanciadoExigible = disp.saldos.interes_refinanciado_vigente
        .plus(disp.saldos.interes_refinanciado_vne);
    }

    const totalPeriodo = capitalPeriodo.plus(interesPeriodo).plus(refinanciadoExigible);

    vencimientos.push({
      numero_amortizacion: p.numero_amortizacion,
      fecha_limite_pago: p.fecha_limite_pago.toISOString().slice(0, 10),
      dias_periodo: p.dias_periodo,
      capital: dec(capitalPeriodo),
      interes_estimado: dec(interesPeriodo),
      refinanciado_exigible: dec(refinanciadoExigible),
      total: dec(totalPeriodo),
    });
  }

  return vencimientos;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { folio, fecha_objetivo } = body;

  if (!folio || !fecha_objetivo) {
    return NextResponse.json(
      { error: "Se requiere folio y fecha_objetivo" },
      { status: 400 }
    );
  }

  const found = findDisposicionConTipo(String(folio));
  if (!found) {
    return NextResponse.json(
      { error: `Disposición ${folio} no encontrada. ¿Ya sincronizaste?` },
      { status: 404 }
    );
  }

  const dnorm = found.dnorm;

  if (!dnorm.disposicion.proyectable) {
    return NextResponse.json(
      {
        error: `Disposición ${folio} no es proyectable`,
        motivo: dnorm.disposicion.motivo_no_proyectable,
      },
      { status: 422 }
    );
  }

  if (!dnorm.regla_etapa) {
    return NextResponse.json(
      { error: "Sin regla de etapa para esta disposición" },
      { status: 422 }
    );
  }

  try {
    const fechaObj = parseFecha(fecha_objetivo);
    const resultado = proyectarDisposicion(
      dnorm.disposicion,
      dnorm.periodos,
      dnorm.regla_etapa,
      fechaObj
    );

    // Calcular vencimientos using M4 snapshots for accurate refinanciado
    const vencimientos = calcularVencimientos(
      dnorm.disposicion,
      dnorm.periodos,
      fechaObj,
      resultado.snapshots
    );

    const sf = resultado.saldos_finales;

    return NextResponse.json({
      folio: resultado.folio_disposicion,
      fecha_base: resultado.fecha_base.toISOString().slice(0, 10),
      fecha_objetivo: resultado.fecha_objetivo.toISOString().slice(0, 10),
      tasa: dec(resultado.tasa_utilizada),
      escenario: resultado.escenario,
      dias_proyectados: resultado.snapshots.length,
      etapa_final: resultado.etapa_ifrs9_final,
      dias_atraso_final: resultado.dias_atraso_final,
      duracion_ms: resultado.duracion_ms,
      interes_ordinario_generado: dec(resultado.interes_ordinario_total_generado),
      interes_moratorio_generado: dec(resultado.interes_moratorio_total_generado),
      interes_moratorio_provisionado_generado: dec(resultado.interes_moratorio_provisionado_generado),
      interes_moratorio_calculado_generado: dec(resultado.interes_moratorio_calculado_generado),
      saldo_total: dec(resultado.saldo_total),
      saldos: {
        cap_vigente: dec(sf.capital_vigente),
        cap_impago: dec(sf.capital_impago),
        cap_ve: dec(sf.capital_vencido_exigible),
        cap_vne: dec(sf.capital_vencido_no_exigible),
        int_vig: dec(sf.interes_ordinario_vigente),
        int_imp: dec(sf.interes_ordinario_impago),
        int_ve: dec(sf.interes_ordinario_ve),
        int_vne: dec(sf.interes_ordinario_vne),
        ref_vig: dec(sf.interes_refinanciado_vigente),
        ref_imp: dec(sf.interes_refinanciado_impago),
        ref_ve: dec(sf.interes_refinanciado_ve),
        ref_vne: dec(sf.interes_refinanciado_vne),
        moratorio_provisionado: dec(sf.interes_moratorio_acumulado),
        moratorio_calculado: dec(sf.interes_moratorio_calculado),
      },
      eventos: resultado.snapshots
        .filter((s) => s.evento !== null)
        .map((s) => ({
          dia: s.dia_numero,
          fecha: s.fecha.toISOString().slice(0, 10),
          evento: s.evento,
          etapa: s.etapa_ifrs9,
          dias_atraso: s.dias_atraso,
        })),
      vencimientos,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de proyección";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
