/**
 * sync/mapper-amortizacion.ts
 * Mapea columnas de la pestaña "Cartera Activa Amortizaciones" → tipo Amortizacion.
 *
 * Solo 5 columnas necesarias de 79 disponibles.
 */

import Decimal from "decimal.js";
import { toDecimal } from "../engine/shared/decimal-helpers";
import { parsearFecha, parsearNumero } from "./mapper-cartera";
import type { Amortizacion } from "../engine/shared/types";

/** Columnas exactas de la pestaña de amortización */
export const COLUMNAS_AMORTIZACION = {
  folio_disposicion: "Folio de disposición",
  numero_amortizacion: "N° de amortizacion",
  fecha_vencimiento: "Fecha vencimiento amortizacion",
  capital_amortizacion: "Capital amortizacion",
  amortizacion_liquidada: "Amortizacion liquidada",
} as const;

/**
 * Mapea una fila cruda de Sheets → Amortizacion del motor.
 */
export function mapearAmortizacion(
  row: Record<string, string>
): Amortizacion {
  const C = COLUMNAS_AMORTIZACION;

  const folio = row[C.folio_disposicion];
  if (!folio) {
    throw new Error("Fila de amortización sin folio de disposición");
  }

  return {
    folio_disposicion: folio.trim(),
    numero_amortizacion: parseInt(row[C.numero_amortizacion]) || 0,
    fecha_vencimiento: parsearFecha(row[C.fecha_vencimiento]),
    monto_capital: parsearNumero(row[C.capital_amortizacion]),
    amortizacion_liquidada: row[C.amortizacion_liquidada]?.trim() === "1",
  };
}

/**
 * Mapea todas las filas de amortización y las agrupa por folio.
 *
 * @param rows - Filas crudas de Sheets
 * @returns Mapa de folio → lista de amortizaciones ordenadas por número
 */
export function mapearYAgruparAmortizaciones(
  rows: Record<string, string>[]
): Map<string, Amortizacion[]> {
  const mapa = new Map<string, Amortizacion[]>();

  for (const row of rows) {
    try {
      const amort = mapearAmortizacion(row);

      const existing = mapa.get(amort.folio_disposicion);
      if (existing) {
        existing.push(amort);
      } else {
        mapa.set(amort.folio_disposicion, [amort]);
      }
    } catch (err) {
      // Fila inválida: skip con warning
      console.warn(
        `Amortización inválida, se omite:`,
        (err as Error).message,
        row
      );
    }
  }

  // Ordenar cada lista por número de amortización
  for (const [_folio, amorts] of mapa) {
    amorts.sort((a, b) => a.numero_amortizacion - b.numero_amortizacion);
  }

  return mapa;
}
