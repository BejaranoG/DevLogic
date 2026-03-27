/**
 * lib/store.ts
 * In-memory store for synced cartera data.
 * Supports both "activa" and "pasiva" carteras independently.
 * Uses globalThis singleton across all Next.js API routes.
 */

import type { ResultadoSync, DisposicionNormalizada } from "../sync/normalizer";

export type TipoCartera = "activa" | "pasiva";

interface SyncState {
  data: ResultadoSync | null;
  rawCarteraRows: Record<string, string>[] | null;
  lastSync: Date | null;
  syncing: boolean;
  syncStartedAt: number | null;
  error: string | null;
}

interface DualStore {
  activa: SyncState;
  pasiva: SyncState;
}

const globalRef = globalThis as unknown as { __logicStore?: DualStore };

function emptyState(): SyncState {
  return { data: null, rawCarteraRows: null, lastSync: null, syncing: false, syncStartedAt: null, error: null };
}

if (!globalRef.__logicStore) {
  globalRef.__logicStore = {
    activa: emptyState(),
    pasiva: emptyState(),
  };
}

const store: DualStore = globalRef.__logicStore;

// ── Accessors con tipo de cartera ──

export function getStore(tipo: TipoCartera = "activa"): SyncState {
  return store[tipo];
}

export function setStoreData(tipo: TipoCartera, data: ResultadoSync, rawRows?: Record<string, string>[]) {
  store[tipo].data = data;
  store[tipo].rawCarteraRows = rawRows ?? null;
  store[tipo].lastSync = new Date();
  store[tipo].error = null;
  store[tipo].syncing = false;
}

export function setSyncing(tipo: TipoCartera, v: boolean) {
  store[tipo].syncing = v;
  store[tipo].syncStartedAt = v ? Date.now() : null;
}

export function setError(tipo: TipoCartera, e: string) {
  store[tipo].error = e;
  store[tipo].syncing = false;
}

export function getDisposiciones(tipo: TipoCartera = "activa"): DisposicionNormalizada[] {
  return store[tipo].data?.disposiciones ?? [];
}

export function getDisposicionByFolio(folio: string, tipo?: TipoCartera): DisposicionNormalizada | undefined {
  // If tipo is specified, search only that cartera
  if (tipo) {
    return store[tipo].data?.disposiciones.find(
      (d) => d.disposicion.folio_disposicion === folio
    );
  }
  // Otherwise search activa first, then pasiva
  return store.activa.data?.disposiciones.find(
    (d) => d.disposicion.folio_disposicion === folio
  ) ?? store.pasiva.data?.disposiciones.find(
    (d) => d.disposicion.folio_disposicion === folio
  );
}

/**
 * Finds a disposicion by folio and returns which cartera it belongs to.
 */
export function findDisposicionConTipo(folio: string): { dnorm: DisposicionNormalizada; tipo: TipoCartera } | undefined {
  const enActiva = store.activa.data?.disposiciones.find(
    (d) => d.disposicion.folio_disposicion === folio
  );
  if (enActiva) return { dnorm: enActiva, tipo: "activa" };

  const enPasiva = store.pasiva.data?.disposiciones.find(
    (d) => d.disposicion.folio_disposicion === folio
  );
  if (enPasiva) return { dnorm: enPasiva, tipo: "pasiva" };

  return undefined;
}

export function getRawCarteraRows(tipo: TipoCartera = "activa"): Record<string, string>[] {
  return store[tipo].rawCarteraRows ?? [];
}
