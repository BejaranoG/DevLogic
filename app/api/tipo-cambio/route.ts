/**
 * app/api/tipo-cambio/route.ts
 * GET /api/tipo-cambio?fecha=YYYY-MM-DD — Retorna el TC "Para Pagos" para esa fecha.
 * POST /api/tipo-cambio — Fuerza refresh. Body: { fecha: "YYYY-MM-DD" }
 */

import { NextResponse } from "next/server";
import { getTipoCambio, refreshTipoCambio } from "../../../lib/tipo-cambio";
import { hoyPDT } from "../../../lib/timezone";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") || hoyPDT();

  try {
    const tc = await getTipoCambio(fecha);
    return NextResponse.json(tc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error obteniendo tipo de cambio";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const fecha = body.fecha || hoyPDT();

  try {
    const tc = await refreshTipoCambio(fecha);
    return NextResponse.json(tc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error refrescando tipo de cambio";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
