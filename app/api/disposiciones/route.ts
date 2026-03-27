/**
 * app/api/disposiciones/route.ts
 * GET /api/disposiciones — Returns all disposiciones with summary KPIs
 */

import { NextResponse } from "next/server";
import { getStore, getDisposiciones, type TipoCartera } from "../../../lib/store";
import { getTipoCambio } from "../../../lib/tipo-cambio";
import { hoyDatePDT } from "../../../lib/timezone";
import Decimal from "decimal.js";

export const dynamic = "force-dynamic";

const ZERO = new Decimal(0);

function dec(d: Decimal): number {
  return d.toDecimalPlaces(2).toNumber();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cartera = (searchParams.get("cartera") || "activa") as TipoCartera;

  const store = getStore(cartera);
  if (!store.data) {
    return NextResponse.json(
      { error: `Sin datos de cartera ${cartera}. Ejecuta sincronización primero.` },
      { status: 404 }
    );
  }

  const disps = getDisposiciones(cartera);

  let capVigTotal = ZERO, capImpTotal = ZERO, capVeTotal = ZERO, capVneTotal = ZERO;
  let intVigTotal = ZERO, intImpTotal = ZERO, intVeTotal = ZERO, intVneTotal = ZERO;
  let refVigTotal = ZERO, refImpTotal = ZERO, refVeTotal = ZERO, refVneTotal = ZERO;
  let moraTotal = ZERO, moraCalcTotal = ZERO;
  let saldoNetoProvTotal = 0;
  const clientes = new Set<string>();
  const ejecutivos = new Set<string>();
  let vigentes = 0, vencidos = 0, impago = 0, proyectables = 0, noProyectables = 0;

  const rows = disps.map((d) => {
    const disp = d.disposicion;
    const s = disp.saldos;

    capVigTotal = capVigTotal.plus(s.capital_vigente);
    capImpTotal = capImpTotal.plus(s.capital_impago);
    capVeTotal = capVeTotal.plus(s.capital_vencido_exigible);
    capVneTotal = capVneTotal.plus(s.capital_vencido_no_exigible);
    intVigTotal = intVigTotal.plus(s.interes_ordinario_vigente);
    intImpTotal = intImpTotal.plus(s.interes_ordinario_impago);
    intVeTotal = intVeTotal.plus(s.interes_ordinario_ve);
    intVneTotal = intVneTotal.plus(s.interes_ordinario_vne);
    refVigTotal = refVigTotal.plus(s.interes_refinanciado_vigente);
    refImpTotal = refImpTotal.plus(s.interes_refinanciado_impago);
    refVeTotal = refVeTotal.plus(s.interes_refinanciado_ve);
    refVneTotal = refVneTotal.plus(s.interes_refinanciado_vne);
    moraTotal = moraTotal.plus(s.interes_moratorio_acumulado);
    moraCalcTotal = moraCalcTotal.plus(s.interes_moratorio_calculado);

    const saldoNetoProv = d.saldo_neto_provisionado;
    saldoNetoProvTotal += saldoNetoProv;

    clientes.add(d.folio_cliente);
    if (d.ejecutivo_disposicion) ejecutivos.add(d.ejecutivo_disposicion);

    if (disp.etapa_ifrs9_actual === 3) vencidos++;
    else if (disp.dias_atraso_actual > 0) impago++;
    else vigentes++;

    if (disp.proyectable) proyectables++;
    else noProyectables++;

    // Build amortization table with progressive interest estimation.
    // For pending periods: progressively discount capital and accumulate refinanciado.
    // Key rule (capitalización): refinanciado accumulated between two capital payments
    // becomes exigible at the next capital payment, then resets.
    const tasaDec = disp.tasa_base_ordinaria.div(100);
    const hoy = hoyDatePDT();

    // Sort periodos for sequential processing
    const periodosOrdenados = d.periodos
      .filter((p) => p.monto_capital.greaterThan(ZERO) || !p.es_sintetica)
      .sort((a, b) => a.numero_amortizacion - b.numero_amortizacion);

    // Running balances for pending periods (start from T₀ saldos)
    let runningCapital = disp.saldos.capital_vigente.plus(disp.saldos.capital_vencido_no_exigible);
    let runningRef = disp.esquema_interes === "capitalizacion"
      ? disp.saldos.interes_refinanciado_vigente.plus(disp.saldos.interes_refinanciado_vne)
      : ZERO;
    const isCapitalizacion = disp.esquema_interes === "capitalizacion";

    const amortizaciones = periodosOrdenados.map((p) => {
      let intEst: typeof ZERO;
      let refExigible = ZERO;

      if (p.liquidada) {
        // Liquidated: estimate with T₀ saldos (informational, already paid)
        let base = disp.saldos.capital_vigente.plus(disp.saldos.capital_vencido_no_exigible);
        if (isCapitalizacion) {
          base = base.plus(disp.saldos.interes_refinanciado_vigente).plus(disp.saldos.interes_refinanciado_vne);
        }
        intEst = base.isZero() || p.dias_periodo <= 0
          ? ZERO
          : base.mul(tasaDec).div(360).mul(p.dias_periodo);
      } else {
        // Pending/Vencida: use running balance with progressive discount
        let base = runningCapital;
        if (isCapitalizacion) {
          base = base.plus(runningRef);
        }

        intEst = base.isZero() || p.dias_periodo <= 0
          ? ZERO
          : base.mul(tasaDec).div(360).mul(p.dias_periodo);

        // Update running balances
        if (isCapitalizacion && intEst.greaterThan(ZERO)) {
          // This period's interest converts to refinanciado
          runningRef = runningRef.plus(intEst);
        }

        // When capital vences: refinanciado accumulated since last capital payment
        // becomes exigible (collected), then resets for the next tranche
        if (p.monto_capital.greaterThan(ZERO)) {
          if (isCapitalizacion) {
            refExigible = runningRef; // All accumulated ref becomes exigible
            runningRef = ZERO;        // Reset: collected at this capital payment
          }
          runningCapital = runningCapital.minus(p.monto_capital);
          if (runningCapital.lessThan(ZERO)) runningCapital = ZERO;
        }
      }

      let status: string;
      if (p.liquidada) status = "liquidada";
      else if (p.fecha_inicio_impago <= hoy) status = "vencida";
      else status = "pendiente";

      const totalRow = p.monto_capital.plus(intEst).plus(refExigible);

      return {
        numero: p.numero_amortizacion,
        fecha_contractual: p.fecha_contractual.toISOString().slice(0, 10),
        fecha_limite_pago: p.fecha_limite_pago.toISOString().slice(0, 10),
        fecha_inicio_impago: p.fecha_inicio_impago.toISOString().slice(0, 10),
        dias_periodo: p.dias_periodo,
        capital: dec(p.monto_capital),
        interes_estimado: dec(intEst),
        refinanciado_exigible: dec(refExigible),
        total: dec(totalRow),
        status,
        es_sintetica: p.es_sintetica,
      };
    });

    return {
      folio: disp.folio_disposicion,
      cliente: disp.cliente,
      ejecutivo: d.ejecutivo_disposicion,
      tipo_credito: disp.tipo_credito,
      esquema: disp.esquema_interes,
      etapa: disp.etapa_ifrs9_actual,
      dias_impago: disp.dias_atraso_actual,
      tasa: dec(disp.tasa_base_ordinaria),
      tipo_tasa: disp.tipo_tasa,
      spread: d.spread,
      cap_vigente: dec(s.capital_vigente),
      saldo_neto: saldoNetoProv,
      moneda: disp.moneda,
      fecha_entrega: disp.fecha_entrega.toISOString().slice(0, 10),
      fecha_final: disp.fecha_final_disposicion.toISOString().slice(0, 10),
      proyectable: disp.proyectable,
      motivo_no_proyectable: disp.motivo_no_proyectable ?? null,
      amortizaciones,
      saldos: {
        cap_vigente: dec(s.capital_vigente),
        cap_impago: dec(s.capital_impago),
        cap_ve: dec(s.capital_vencido_exigible),
        cap_vne: dec(s.capital_vencido_no_exigible),
        int_vig: dec(s.interes_ordinario_vigente),
        int_imp: dec(s.interes_ordinario_impago),
        int_ve: dec(s.interes_ordinario_ve),
        int_vne: dec(s.interes_ordinario_vne),
        ref_vig: dec(s.interes_refinanciado_vigente),
        ref_imp: dec(s.interes_refinanciado_impago),
        ref_ve: dec(s.interes_refinanciado_ve),
        ref_vne: dec(s.interes_refinanciado_vne),
        moratorio_provisionado: dec(s.interes_moratorio_acumulado),
        moratorio_calculado: dec(s.interes_moratorio_calculado),
      },
    };
  });

  // ── CHART DATA ──

  // 1. Distribución por etapa IFRS9
  const etapaCounts: Record<string, { count: number; saldo: number }> = {};
  for (const r of rows) {
    const lbl = r.etapa === 1 ? "Etapa 1" : r.etapa === 2 ? "Etapa 2" : "Etapa 3";
    if (!etapaCounts[lbl]) etapaCounts[lbl] = { count: 0, saldo: 0 };
    etapaCounts[lbl].count++;
    etapaCounts[lbl].saldo += r.saldo_neto;
  }
  const chartEtapas = Object.entries(etapaCounts).map(([name, v]) => ({
    name, count: v.count, saldo: Math.round(v.saldo),
  }));

  // 2. Cartera por tipo de producto
  const prodCounts: Record<string, { count: number; saldo: number }> = {};
  const prodLabels: Record<string, string> = {
    credito_simple: "Crédito Simple", refaccionario: "Refaccionario",
    ccc: "CCC", habilitacion_avio: "Hab/Avío", factoraje: "Factoraje", arrendamiento: "Arrend.",
  };
  for (const r of rows) {
    const lbl = prodLabels[r.tipo_credito] || r.tipo_credito;
    if (!prodCounts[lbl]) prodCounts[lbl] = { count: 0, saldo: 0 };
    prodCounts[lbl].count++;
    prodCounts[lbl].saldo += r.cap_vigente;
  }
  const chartProductos = Object.entries(prodCounts)
    .map(([name, v]) => ({ name, count: v.count, saldo: Math.round(v.saldo) }))
    .sort((a, b) => b.saldo - a.saldo);

  // 3. Top 10 clientes por exposición
  const clienteSaldos: Record<string, number> = {};
  for (const r of rows) {
    const cl = r.cliente || "Desconocido";
    clienteSaldos[cl] = (clienteSaldos[cl] || 0) + r.saldo_neto;
  }
  const chartTopClientes = Object.entries(clienteSaldos)
    .map(([name, saldo]) => ({ name: name.length > 30 ? name.slice(0, 28) + "…" : name, saldo: Math.round(saldo) }))
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 10);

  // 4. Vencimientos próximos 30 días (agrupados por semana)
  const hoyVenc = hoyDatePDT();
  const en30 = new Date(hoyVenc.getFullYear(), hoyVenc.getMonth(), hoyVenc.getDate() + 30);
  const semanas: Record<string, { capital: number; interes: number; count: number }> = {};

  for (const d of disps) {
    for (const p of d.periodos) {
      if (p.liquidada) continue;
      const fp = p.fecha_limite_pago;
      if (fp < hoyVenc || fp > en30) continue;

      // Semana label: "Abr 7-13"
      const dayOfWeek = fp.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(fp.getFullYear(), fp.getMonth(), fp.getDate() + mondayOffset);
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const label = meses[monday.getMonth()] + " " + monday.getDate() + "-" + sunday.getDate();
      const sortKey = monday.toISOString().slice(0, 10);

      if (!semanas[sortKey]) semanas[sortKey] = { capital: 0, interes: 0, count: 0 };
      semanas[sortKey].capital += p.monto_capital.toNumber();
      semanas[sortKey].count++;
      // Rough interest estimate
      const base = d.disposicion.saldos.capital_vigente.plus(d.disposicion.saldos.capital_vencido_no_exigible);
      const tasaDec = d.disposicion.tasa_base_ordinaria.div(100);
      const intEst = base.mul(tasaDec).div(360).mul(p.dias_periodo).toNumber();
      semanas[sortKey].interes += p.monto_capital.isZero() ? intEst : intEst;
    }
  }

  const chartVencimientos = Object.entries(semanas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sortKey, v]) => {
      const dt = new Date(sortKey + "T00:00:00");
      const sun = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 6);
      const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      return {
        name: meses[dt.getMonth()] + " " + dt.getDate() + "-" + sun.getDate(),
        capital: Math.round(v.capital),
        interes: Math.round(v.interes),
        pagos: v.count,
      };
    });

  // Tipo de cambio vinculado a la fecha de la cartera (no bloquea si falla)
  const fechaSaldo = disps[0]?.disposicion.fecha_saldo.toISOString().slice(0, 10) ?? null;
  let tipo_cambio: any = null;
  if (fechaSaldo) {
    try {
      tipo_cambio = await getTipoCambio(fechaSaldo);
    } catch {
      tipo_cambio = null;
    }
  }

  return NextResponse.json({
    kpis: {
      saldo_neto: Math.round(saldoNetoProvTotal * 100) / 100,
      cap_vigente: dec(capVigTotal),
      cap_impago: dec(capImpTotal),
      cap_vencido: dec(capVeTotal.plus(capVneTotal)),
      int_vigente: dec(intVigTotal),
      int_impago: dec(intImpTotal),
      int_vencido: dec(intVeTotal.plus(intVneTotal).plus(refVeTotal).plus(refVneTotal)),
      moratorio_provisionado: dec(moraTotal),
      moratorio_calculado: dec(moraCalcTotal),
    },
    stats: {
      total: disps.length,
      vigentes,
      vencidos,
      impago,
      clientes: clientes.size,
      ejecutivos: ejecutivos.size,
      proyectables,
      no_proyectables: noProyectables,
    },
    disposiciones: rows,
    charts: { chartEtapas, chartProductos, chartTopClientes, chartVencimientos },
    fecha_saldo: fechaSaldo,
    tipo_cambio,
    cartera,
  });
}
