/**
 * app/api/cobranza/export/route.ts
 * POST /api/cobranza/export — Genera y descarga XLSX del reporte de cobranza.
 * Body: { fecha_desde: "YYYY-MM-DD", fecha_hasta: "YYYY-MM-DD", incluir_adeudos?: boolean }
 */

import { NextResponse } from "next/server";
import { getStore, getDisposiciones, type TipoCartera } from "../../../../lib/store";
import { generarCobranza, validarParams } from "../../../../engine/cobranza/index";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

function parseFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const TIPO_LABELS: Record<string, string> = {
  credito_simple: "Crédito Simple",
  refaccionario: "Refaccionario",
  ccc: "CCC",
  habilitacion_avio: "Hab/Avío",
  factoraje: "Factoraje",
  arrendamiento: "Arrendamiento",
};

const ESQUEMA_LABELS: Record<string, string> = {
  periodico: "Cobro Periódico",
  acumulacion: "Acumulación",
  capitalizacion: "Capitalización",
};

export async function POST(request: Request) {
  const body = await request.json();
  const { fecha_desde, fecha_hasta, incluir_adeudos, cartera } = body;
  const tipoCartera: TipoCartera = cartera === "pasiva" ? "pasiva" : "activa";

  if (!fecha_desde || !fecha_hasta) {
    return NextResponse.json(
      { error: "Se requiere fecha_desde y fecha_hasta" },
      { status: 400 }
    );
  }

  const store = getStore(tipoCartera);
  if (!store.data) {
    return NextResponse.json(
      { error: `Sin datos de cartera ${tipoCartera}. Sincroniza primero.` },
      { status: 404 }
    );
  }

  const params = {
    fechaDesde: parseFecha(fecha_desde),
    fechaHasta: parseFecha(fecha_hasta),
    incluirAdeudos: incluir_adeudos !== false,
  };

  const errorValidacion = validarParams(params);
  if (errorValidacion) {
    return NextResponse.json({ error: errorValidacion }, { status: 400 });
  }

  try {
    const disposiciones = getDisposiciones(tipoCartera);
    const resultado = generarCobranza(disposiciones, params);

    // Build XLSX rows
    const rows = resultado.lineas.map((l) => {
      const row: Record<string, any> = {
        "Folio Disposición": l.folio_disposicion,
        "Folio Cliente": l.folio_cliente,
        "Cliente": l.cliente,
        "Ejecutivo": l.ejecutivo,
      };

      if (tipoCartera === "pasiva") {
        row["Identificador de Fondeo"] = l.id_fondeador;
        row["Fuente de Fondeo"] = l.fuente_fondeo;
      }

      row["Tipo Crédito"] = TIPO_LABELS[l.tipo_credito] || l.tipo_credito;
      row["Esquema Interés"] = ESQUEMA_LABELS[l.esquema_interes] || l.esquema_interes;
      row["No. Amortización"] = l.numero_amortizacion;
      row["Fecha Límite Pago"] = l.fecha_limite_pago;
      row["Capital Periodo"] = fmtMoney(l.capital_periodo);
      row["Interés Periodo"] = fmtMoney(l.interes_periodo);
      row["Total Periodo"] = fmtMoney(l.total_periodo);

      if (params.incluirAdeudos) {
        row["Adeudo Capital"] = fmtMoney(l.adeudo_capital);
        row["Adeudo Interés"] = fmtMoney(l.adeudo_interes);
        row["Adeudo Moratorio"] = fmtMoney(l.adeudo_moratorio);
        row["Total Adeudo"] = fmtMoney(l.adeudo_total);
      }

      row["Total a Pagar"] = fmtMoney(l.total_a_pagar);
      return row;
    });

    // Add summary row
    rows.push({});
    rows.push({
      "Folio Disposición": "RESUMEN",
      "Folio Cliente": `${resultado.resumen.disposiciones_unicas} disposiciones`,
      "Cliente": `${resultado.resumen.total_lineas} líneas`,
      "Capital Periodo": fmtMoney(resultado.resumen.total_capital),
      "Interés Periodo": fmtMoney(resultado.resumen.total_interes),
      ...(params.incluirAdeudos
        ? { "Total Adeudo": fmtMoney(resultado.resumen.total_adeudo) }
        : {}),
      "Total a Pagar": fmtMoney(resultado.resumen.gran_total),
    });

    // Generate XLSX
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 16 }, // Folio
      { wch: 14 }, // Folio Cliente
      { wch: 30 }, // Cliente
      { wch: 22 }, // Ejecutivo
      ...(tipoCartera === "pasiva"
        ? [{ wch: 18 }, { wch: 22 }] // ID Fondeo, Fuente Fondeo
        : []),
      { wch: 16 }, // Tipo
      { wch: 18 }, // Esquema
      { wch: 8 },  // No. Amort
      { wch: 16 }, // Fecha
      { wch: 16 }, // Capital
      { wch: 16 }, // Interés
      { wch: 16 }, // Total Periodo
      ...(params.incluirAdeudos
        ? [{ wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
        : []),
      { wch: 18 }, // Total a Pagar
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cobranza");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const carteraLabel = tipoCartera === "pasiva" ? "PASIVA" : "ACTIVA";
    const filename = `PROAKTIVA_COBRANZA_${carteraLabel}_${fecha_desde.replace(/-/g, "")}_${fecha_hasta.replace(/-/g, "")}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error generando export";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
