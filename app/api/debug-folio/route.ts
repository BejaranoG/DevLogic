/**
 * app/api/debug-folio/route.ts
 * GET /api/debug-folio?folio=13079
 * Returns raw periods, amortization data, and key dates for debugging.
 * TEMPORARY — remove after debugging.
 */

import { NextResponse } from "next/server";
import { getDisposicionByFolio } from "../../../lib/store";
import { redondear2 } from "../../../engine/shared/decimal-helpers";
import type Decimal from "decimal.js";

export const dynamic = "force-dynamic";
function dec(d: Decimal): number { return redondear2(d).toNumber(); }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const folio = url.searchParams.get("folio");

  if (!folio) {
    return NextResponse.json({ error: "Se requiere ?folio=XXXXX" }, { status: 400 });
  }

  const dnorm = getDisposicionByFolio(folio);
  if (!dnorm) {
    return NextResponse.json({ error: `Folio ${folio} no encontrado. ¿Ya sincronizaste?` }, { status: 404 });
  }

  const d = dnorm.disposicion;

  return NextResponse.json({
    folio: d.folio_disposicion,
    tipo_credito: d.tipo_credito,
    esquema_interes: d.esquema_interes,
    regla_dia_habil: d.regla_dia_habil,
    tipo_tasa: d.tipo_tasa,
    tasa: dec(d.tasa_base_ordinaria),
    fecha_entrega: d.fecha_entrega.toISOString().slice(0, 10),
    fecha_final_disposicion: d.fecha_final_disposicion.toISOString().slice(0, 10),
    fecha_final_contrato: d.fecha_final_contrato.toISOString().slice(0, 10),
    fecha_saldo: d.fecha_saldo.toISOString().slice(0, 10),
    etapa: d.etapa_ifrs9_actual,
    dias_atraso: d.dias_atraso_actual,
    proyectable: d.proyectable,
    motivo_no_proyectable: d.motivo_no_proyectable,
    capital: {
      vigente: dec(d.saldos.capital_vigente),
      impago: dec(d.saldos.capital_impago),
      ve: dec(d.saldos.capital_vencido_exigible),
      vne: dec(d.saldos.capital_vencido_no_exigible),
    },
    periodos_total: dnorm.periodos.length,
    periodos: dnorm.periodos.map(p => ({
      num: p.numero_amortizacion,
      fecha_contractual: p.fecha_contractual.toISOString().slice(0, 10),
      fecha_corte: p.fecha_corte.toISOString().slice(0, 10),
      fecha_limite_pago: p.fecha_limite_pago.toISOString().slice(0, 10),
      fecha_inicio_impago: p.fecha_inicio_impago.toISOString().slice(0, 10),
      dias_periodo: p.dias_periodo,
      monto_capital: dec(p.monto_capital),
      liquidada: p.liquidada,
      es_sintetica: p.es_sintetica,
    })),
  });
}
