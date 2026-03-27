/**
 * app/api/proyeccion/route.ts
 * POST /api/proyeccion — Runs M4 projection for a single disposition
 */

import { NextResponse } from "next/server";
import { findDisposicionConTipo } from "../../../lib/store";
import { proyectarDisposicion } from "../../../engine/proyeccion/index";
import { redondear2, tasaADecimal, BASE_360, ZERO } from "../../../engine/shared/decimal-helpers";
import type Decimal from "decimal.js";
import type { PeriodoOperativo, Disposicion } from "../../../engine/shared/types";

export const dynamic = "force-dynamic";

function dec(d: Decimal): number {
  return redondear2(d).toNumber();
}

function parseFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Calcula los vencimientos (pagos) que caen dentro del rango de proyección.
 * Para cada periodo pendiente con fecha_limite_pago en [base+1, objetivo],
 * calcula el interés estimado del periodo.
 */
function calcularVencimientos(
  disp: Disposicion,
  periodos: PeriodoOperativo[],
  fechaBase: Date,
  fechaObjetivo: Date
) {
  const tsBase = fechaBase.getTime();
  const tsObj = new Date(
    fechaObjetivo.getFullYear(),
    fechaObjetivo.getMonth(),
    fechaObjetivo.getDate(),
    23, 59, 59, 999
  ).getTime();

  const tasa = tasaADecimal(disp.tasa_base_ordinaria);
  let baseCapital = disp.saldos.capital_vigente.plus(disp.saldos.capital_vencido_no_exigible);

  // Descontar periodos anteriores al rango (su capital ya habría vencido)
  const periodosAntes = periodos
    .filter((p) => !p.liquidada && p.fecha_limite_pago.getTime() <= tsBase && p.monto_capital.greaterThan(ZERO))
    .sort((a, b) => a.fecha_limite_pago.getTime() - b.fecha_limite_pago.getTime());

  for (const p of periodosAntes) {
    baseCapital = baseCapital.minus(p.monto_capital);
    if (baseCapital.lessThan(ZERO)) baseCapital = ZERO;
  }

  // Solo periodos cuya fecha_limite_pago coincide exactamente con la fecha objetivo
  const tsObjDate = new Date(
    fechaObjetivo.getFullYear(),
    fechaObjetivo.getMonth(),
    fechaObjetivo.getDate()
  ).getTime();

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

  const vencimientos: any[] = [];

  for (const p of enFecha) {
    let base = baseCapital;
    if (disp.esquema_interes === "capitalizacion") {
      base = base.plus(disp.saldos.interes_refinanciado_vigente).plus(disp.saldos.interes_refinanciado_vne);
    }

    const interesPeriodo = base.isZero() || p.dias_periodo <= 0
      ? ZERO
      : base.mul(tasa).div(BASE_360).mul(p.dias_periodo);

    const capitalPeriodo = p.monto_capital;
    const totalPeriodo = interesPeriodo.plus(capitalPeriodo);

    vencimientos.push({
      numero_amortizacion: p.numero_amortizacion,
      fecha_limite_pago: p.fecha_limite_pago.toISOString().slice(0, 10),
      dias_periodo: p.dias_periodo,
      capital: dec(capitalPeriodo),
      interes_estimado: dec(interesPeriodo),
      total: dec(totalPeriodo),
    });

    // Reducir base para siguientes periodos
    if (capitalPeriodo.greaterThan(ZERO)) {
      baseCapital = baseCapital.minus(capitalPeriodo);
      if (baseCapital.lessThan(ZERO)) baseCapital = ZERO;
    }
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

    // Calcular vencimientos en el rango de proyección
    const vencimientos = calcularVencimientos(
      dnorm.disposicion,
      dnorm.periodos,
      dnorm.disposicion.fecha_saldo,
      fechaObj
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
