/**
 * app/api/sync/route.ts
 * POST /api/sync — Smart sync with cache.
 *   - If data is fresh (< 5 min), returns cached. No Sheets call.
 *   - Body { force: true } forces re-sync even if fresh.
 * GET /api/sync — Status of both carteras.
 */

import { NextResponse } from "next/server";
import { sincronizarDesdeSheets, PROAKTIVA_CONFIG, PROAKTIVA_PASIVA_CONFIG } from "../../../sync/index";
import { getStore, setStoreData, setSyncing, setError } from "../../../lib/store";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isFresh(lastSync: Date | null): boolean {
  if (!lastSync) return false;
  return Date.now() - lastSync.getTime() < CACHE_TTL_MS;
}

export async function POST(request: Request) {
  let force = false;
  try {
    const body = await request.json().catch(() => ({}));
    force = body?.force === true;
  } catch {}

  const storeActiva = getStore("activa");

  // Safety: reset stuck syncing flag after 2 minutes
  if (storeActiva.syncing && storeActiva.syncStartedAt) {
    if (Date.now() - storeActiva.syncStartedAt > 120_000) {
      setSyncing("activa", false);
      setSyncing("pasiva", false);
    }
  }

  // If data is fresh and not forced, return cached immediately
  if (!force && storeActiva.data && isFresh(storeActiva.lastSync)) {
    return NextResponse.json({
      ok: true,
      cached: true,
      age_seconds: Math.round((Date.now() - storeActiva.lastSync!.getTime()) / 1000),
      activa: { stats: storeActiva.data.stats },
      pasiva: { stats: getStore("pasiva").data?.stats ?? null },
    });
  }

  // If already syncing, return cached data if available
  if (storeActiva.syncing) {
    if (storeActiva.data) {
      return NextResponse.json({ ok: true, cached: true });
    }
    return NextResponse.json({ error: "Sincronización en curso" }, { status: 409 });
  }

  setSyncing("activa", true);

  let statsActiva = null;
  let statsPasiva = null;
  let errorPasiva: string | null = null;

  try {
    const activa = await sincronizarDesdeSheets(PROAKTIVA_CONFIG);
    setStoreData("activa", activa.resultado, activa.rawCarteraRows);
    statsActiva = activa.resultado.stats;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    setError("activa", msg);
    return NextResponse.json({ error: "Error sync activa: " + msg }, { status: 500 });
  }

  try {
    setSyncing("pasiva", true);
    const pasiva = await sincronizarDesdeSheets(PROAKTIVA_PASIVA_CONFIG);
    setStoreData("pasiva", pasiva.resultado, pasiva.rawCarteraRows);
    statsPasiva = pasiva.resultado.stats;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    setError("pasiva", msg);
    errorPasiva = msg;
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    activa: { stats: statsActiva },
    pasiva: { stats: statsPasiva, error: errorPasiva },
  });
}

export async function GET() {
  const activa = getStore("activa");
  const pasiva = getStore("pasiva");
  return NextResponse.json({
    activa: {
      hasDatos: activa.data !== null,
      lastSync: activa.lastSync?.toISOString() ?? null,
      syncing: activa.syncing,
      fresh: isFresh(activa.lastSync),
      error: activa.error,
      stats: activa.data?.stats ?? null,
    },
    pasiva: {
      hasDatos: pasiva.data !== null,
      lastSync: pasiva.lastSync?.toISOString() ?? null,
      syncing: pasiva.syncing,
      fresh: isFresh(pasiva.lastSync),
      error: pasiva.error,
      stats: pasiva.data?.stats ?? null,
    },
  });
}
