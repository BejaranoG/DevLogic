/**
 * app/api/search/route.ts
 * GET /api/search?q=...&full=true — Search across both carteras.
 *   - Default: max 8 results, minimal fields (for dropdown).
 *   - full=true: all results with detailed fields (for search page).
 */

import { NextResponse } from "next/server";
import { getDisposiciones } from "../../../lib/store";
import { redondear2 } from "../../../engine/shared/decimal-helpers";
import type Decimal from "decimal.js";

export const dynamic = "force-dynamic";

function dec(d: Decimal): number {
  return redondear2(d).toNumber();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const full = searchParams.get("full") === "true";

  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const allDisps = [...getDisposiciones("activa"), ...getDisposiciones("pasiva")];

  const matched = allDisps.filter((d) => {
    const disp = d.disposicion;
    return (
      disp.folio_disposicion.toLowerCase().includes(q) ||
      disp.cliente.toLowerCase().includes(q) ||
      d.ejecutivo_disposicion.toLowerCase().includes(q) ||
      d.folio_cliente.toLowerCase().includes(q)
    );
  });

  if (!full) {
    // Quick mode for dropdown (max 8, minimal fields)
    const results = matched.slice(0, 8).map((d) => {
      const disp = d.disposicion;
      return {
        folio: disp.folio_disposicion,
        cliente: disp.cliente,
        ejecutivo: d.ejecutivo_disposicion,
        etapa: disp.etapa_ifrs9_actual,
        dias_impago: disp.dias_atraso_actual,
        cap_vigente: dec(disp.saldos.capital_vigente),
        tasa: dec(disp.tasa_base_ordinaria),
        moneda: disp.moneda,
      };
    });
    return NextResponse.json({ results, total: matched.length });
  }

  // Full mode for search page (all results, detailed fields)
  const results = matched.map((d) => {
    const disp = d.disposicion;
    const s = disp.saldos;
    const capTotal = dec(s.capital_vigente) + dec(s.capital_impago) +
      dec(s.capital_vencido_exigible) + dec(s.capital_vencido_no_exigible);

    return {
      folio: disp.folio_disposicion,
      folio_linea: disp.folio_linea || "",
      folio_cliente: d.folio_cliente,
      cliente: disp.cliente,
      ejecutivo: d.ejecutivo_disposicion,
      tipo_credito: disp.tipo_credito,
      esquema_interes: disp.esquema_interes,
      moneda: disp.moneda,
      tasa: dec(disp.tasa_base_ordinaria),
      etapa: disp.etapa_ifrs9_actual,
      dias_impago: disp.dias_atraso_actual,
      cap_vigente: dec(s.capital_vigente),
      cap_impago: dec(s.capital_impago),
      cap_ve: dec(s.capital_vencido_exigible),
      cap_vne: dec(s.capital_vencido_no_exigible),
      cap_total: Math.round(capTotal * 100) / 100,
      int_vigente: dec(s.interes_ordinario_vigente),
      int_impago: dec(s.interes_ordinario_impago),
      moratorio: dec(s.interes_moratorio_acumulado),
      fecha_entrega: disp.fecha_entrega.toISOString().slice(0, 10),
      fecha_vencimiento: disp.fecha_final_disposicion.toISOString().slice(0, 10),
      proyectable: disp.proyectable,
    };
  });

  return NextResponse.json({ results, total: matched.length });
}
