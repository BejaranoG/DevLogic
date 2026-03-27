/**
 * app/api/cobranza/route.ts
 * POST /api/cobranza — Genera reporte de cobranza para un rango de fechas.
 * Body: { fecha_desde: "YYYY-MM-DD", fecha_hasta: "YYYY-MM-DD", incluir_adeudos?: boolean }
 */

import { NextResponse } from "next/server";
import { getStore, getDisposiciones, type TipoCartera } from "../../../lib/store";
import { generarCobranza, validarParams } from "../../../engine/cobranza/index";

export const dynamic = "force-dynamic";

function parseFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

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
    return NextResponse.json({ ...resultado, cartera: tipoCartera });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error generando cobranza";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
