/**
 * sync/index.ts
 * Orquestador de sincronización.
 */

import { fetchCarteraCompleta, type SheetsConfig, PROAKTIVA_CONFIG } from "./sheets-client";
import { mapearDisposicion, extraerMetadatos } from "./mapper-cartera";
import { mapearYAgruparAmortizaciones } from "./mapper-amortizacion";
import { normalizar, type ResultadoSync, type SyncError } from "./normalizer";
import type { Disposicion } from "../engine/shared/types";

export { PROAKTIVA_CONFIG, PROAKTIVA_PASIVA_CONFIG } from "./sheets-client";
export type { ResultadoSync, SyncError, SyncWarning, SyncStats, DisposicionNormalizada } from "./normalizer";
export { buildCsvUrl, parseCsv, rowsToObjects } from "./sheets-client";
export { mapearDisposicion, normalizarTipoCredito, normalizarEsquemaInteres } from "./mapper-cartera";
export { mapearAmortizacion, mapearYAgruparAmortizaciones } from "./mapper-amortizacion";

export interface SyncResult {
  resultado: ResultadoSync;
  rawCarteraRows: Record<string, string>[];
}

export async function sincronizarDesdeSheets(
  config: SheetsConfig = PROAKTIVA_CONFIG
): Promise<SyncResult> {
  const { cartera, amortizaciones } = await fetchCarteraCompleta(config);

  const disposiciones: Disposicion[] = [];
  const metadatos = new Map<string, { ejecutivo_disposicion: string; folio_cliente: string; saldo_neto_provisionado: number; spread: number; id_fondeador: string; fuente_fondeo: string }>();
  const erroresMapeo: SyncError[] = [];

  for (const row of cartera) {
    try {
      const disp = mapearDisposicion(row);
      const meta = extraerMetadatos(row);
      disposiciones.push(disp);
      metadatos.set(disp.folio_disposicion, {
        ejecutivo_disposicion: meta.ejecutivo_disposicion,
        folio_cliente: meta.folio_cliente,
        saldo_neto_provisionado: meta.saldo_neto_provisionado,
        spread: meta.spread, id_fondeador: meta.id_fondeador, fuente_fondeo: meta.fuente_fondeo,
      });
    } catch (err) {
      erroresMapeo.push({
        folio: row["FOLIO DE DISPOSICIÓN"] ?? "desconocido",
        tipo: "mapeo",
        mensaje: `Error mapeando: ${(err as Error).message}`,
      });
    }
  }

  const amortsPorFolio = mapearYAgruparAmortizaciones(amortizaciones);
  const resultado = normalizar(disposiciones, amortsPorFolio, metadatos);
  resultado.errores.push(...erroresMapeo);
  resultado.stats.errores += erroresMapeo.length;

  return { resultado, rawCarteraRows: cartera };
}

export function sincronizarDesdeObjetos(
  carteraRows: Record<string, string>[],
  amortizacionRows: Record<string, string>[]
): ResultadoSync {
  const disposiciones: Disposicion[] = [];
  const metadatos = new Map<string, { ejecutivo_disposicion: string; folio_cliente: string; saldo_neto_provisionado: number; spread: number; id_fondeador: string; fuente_fondeo: string }>();
  const erroresMapeo: SyncError[] = [];

  for (const row of carteraRows) {
    try {
      const disp = mapearDisposicion(row);
      const meta = extraerMetadatos(row);
      disposiciones.push(disp);
      metadatos.set(disp.folio_disposicion, {
        ejecutivo_disposicion: meta.ejecutivo_disposicion,
        folio_cliente: meta.folio_cliente,
        saldo_neto_provisionado: meta.saldo_neto_provisionado,
        spread: meta.spread, id_fondeador: meta.id_fondeador, fuente_fondeo: meta.fuente_fondeo,
      });
    } catch (err) {
      erroresMapeo.push({
        folio: row["FOLIO DE DISPOSICIÓN"] ?? "desconocido",
        tipo: "mapeo",
        mensaje: `Error mapeando: ${(err as Error).message}`,
      });
    }
  }

  const amortsPorFolio = mapearYAgruparAmortizaciones(amortizacionRows);
  const resultado = normalizar(disposiciones, amortsPorFolio, metadatos);
  resultado.errores.push(...erroresMapeo);
  resultado.stats.errores += erroresMapeo.length;

  return resultado;
}
