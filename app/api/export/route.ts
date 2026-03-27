/**
 * app/api/export/route.ts
 * POST /api/export — Projects all disposiciones to a target date and exports as XLSX.
 * Body: { fecha_objetivo: "YYYY-MM-DD" }
 * Returns: XLSX file download
 */

import { NextResponse } from "next/server";
import { getStore, getDisposiciones, getRawCarteraRows, type TipoCartera } from "../../../lib/store";
import { proyectarDisposicion } from "../../../engine/proyeccion/index";
import { redondear2 } from "../../../engine/shared/decimal-helpers";
import * as XLSX from "xlsx";
import type Decimal from "decimal.js";

export const dynamic = "force-dynamic";

function dec(d: Decimal): number {
  return redondear2(d).toNumber();
}

function parseFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function etapaLabel(n: number): string {
  return "ETAPA " + n;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { fecha_objetivo, cartera } = body;
  const tipoCartera: TipoCartera = cartera === "pasiva" ? "pasiva" : "activa";

  if (!fecha_objetivo) {
    return NextResponse.json({ error: "Se requiere fecha_objetivo" }, { status: 400 });
  }

  const store = getStore(tipoCartera);
  if (!store.data) {
    return NextResponse.json({ error: `Sin datos de cartera ${tipoCartera}. Sincroniza primero.` }, { status: 404 });
  }

  const rawRows = getRawCarteraRows(tipoCartera);
  if (rawRows.length === 0) {
    return NextResponse.json({ error: "Sin filas originales para exportar." }, { status: 404 });
  }

  const fechaObj = parseFecha(fecha_objetivo);
  const disps = getDisposiciones(tipoCartera);

  // Build a map folio → projected saldos
  const projMap = new Map<string, any>();
  let projected = 0;
  let errors = 0;

  for (const dnorm of disps) {
    const folio = dnorm.disposicion.folio_disposicion;
    if (!dnorm.disposicion.proyectable || !dnorm.regla_etapa) continue;

    try {
      // Check that target date is after base date
      if (fechaObj.getTime() <= dnorm.disposicion.fecha_saldo.getTime()) continue;

      const resultado = proyectarDisposicion(
        dnorm.disposicion,
        dnorm.periodos,
        dnorm.regla_etapa,
        fechaObj
      );

      const sf = resultado.saldos_finales;
      projMap.set(folio, {
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
        moratorio: dec(sf.interes_moratorio_acumulado),
        etapa: resultado.etapa_ifrs9_final,
        dias_atraso: resultado.dias_atraso_final,
      });
      projected++;
    } catch {
      errors++;
    }
  }

  // Build output rows: original columns with projected values overlaid
  const outputRows: Record<string, any>[] = [];

  for (const raw of rawRows) {
    const folio = raw["FOLIO DE DISPOSICIÓN"];
    const row: Record<string, any> = { ...raw };

    const proj = projMap.get(folio);
    if (proj) {
      // Overlay projected values
      row["FECHA DE SALDO"] = fecha_objetivo;
      row["DÍAS DE IMPAGO"] = proj.dias_atraso;
      row["IFRS9"] = etapaLabel(proj.etapa);
      row["SALDO CAPITAL VIGENTE"] = proj.cap_vigente;
      row["SALDO CAPITAL IMPAGO"] = proj.cap_impago;
      row["SALDO CAPITAL VENCIDO EXIGIBLE"] = proj.cap_ve;
      row["SALDO CAPITAL VENCIDO NO EXIGIBLE"] = proj.cap_vne;
      row["SALDO INTERES ORDINARIO VIGENTE"] = proj.int_vig;
      row["SALDO INTERES ORDINARIO IMPAGO"] = proj.int_imp;
      row["SALDO INTERES ORDINARIO VENCIDO EXIGIBLE"] = proj.int_ve;
      row["SALDO INTERES ORDINARIO VENCIDO NO EXIGIBLE"] = proj.int_vne;
      row["SALDO INTERES REFINANCIADO VIGENTE"] = proj.ref_vig;
      row["SALDO INTERES REFINANCIADO IMPAGO"] = proj.ref_imp;
      row["SALDO INTERES REFINANCIADO VENCIDO EXIGIBLE"] = proj.ref_ve;
      row["SALDO INTERES REFINANCIADO VENCIDO NO EXIGIBLE"] = proj.ref_vne;
      row["SALDO INTERES MORATORIO PROVISIONADO"] = proj.moratorio;

      // Recalculate totals
      const capTotal = proj.cap_vigente + proj.cap_impago + proj.cap_ve + proj.cap_vne;
      const intTotal = proj.int_vig + proj.int_imp + proj.int_ve + proj.int_vne
        + proj.ref_vig + proj.ref_imp + proj.ref_ve + proj.ref_vne + proj.moratorio;
      row["SALDO TOTAL"] = capTotal + intTotal;
      row["SALDO NETO"] = capTotal + intTotal;
      row["SALDO INSOLUTO CAPITAL"] = capTotal;
      row["FECHA ULTIMO SALDO PROYECTADO"] = fecha_objetivo;
    }

    outputRows.push(row);
  }

  // Generate XLSX
  const ws = XLSX.utils.json_to_sheet(outputRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cartera Activa Proyectada");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const carteraLabel = tipoCartera === "pasiva" ? "PASIVA" : "ACTIVA";
  const filename = `PROAKTIVA_CARTERA_${carteraLabel}_PROYECTADA_AL_${fecha_objetivo.replace(/-/g, "")}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"" + filename + "\"",
    },
  });
}
