/**
 * sync/mapper-cartera.ts
 * Mapea columnas exactas de Google Sheets → tipo Disposicion del motor.
 *
 * Columnas confirmadas contra el archivo real al 2026-03-22.
 * Solo se mapean las 35 columnas necesarias; las 72 restantes se ignoran.
 */

import Decimal from "decimal.js";
import { toDecimal, estadoSaldosVacio } from "../engine/shared/decimal-helpers";
import { normalizarReglaDiaHabil } from "../engine/periodo/resolver";
import { parsearEtapaSheets } from "../engine/etapas/evaluador";
import type {
  Disposicion,
  TipoCreditoNorm,
  EsquemaInteresNorm,
  EstadoSaldos,
} from "../engine/shared/types";

// ============================================================================
// Normalización de valores de Sheets
// ============================================================================

/**
 * Normaliza el tipo de crédito de Sheets al enum interno.
 */
export function normalizarTipoCredito(valor: string): TipoCreditoNorm {
  const upper = valor.toUpperCase().trim();

  if (upper === "CRÉDITOS SIMPLES" || upper === "CREDITOS SIMPLES" || upper === "SIMPLE") {
    return "credito_simple";
  }
  if (upper === "REFACCIONARIO") return "refaccionario";
  if (upper.includes("CUENTA CORRIENTE") || upper === "CCC") return "ccc";
  if (upper.includes("HABILITACIÓN") || upper.includes("HABILITACION") || upper === "AVÍO") {
    return "hab_avio";
  }
  if (upper === "FACTORAJE") return "factoraje";
  if (upper === "ARRENDAMIENTO") return "arrendamiento";

  throw new Error(`Tipo de crédito no reconocido: '${valor}'`);
}

/**
 * Normaliza el esquema de interés de Sheets al enum interno.
 */
export function normalizarEsquemaInteres(valor: string): EsquemaInteresNorm {
  const upper = valor.toUpperCase().trim();

  if (upper === "COBRO PERIÓDICO" || upper === "COBRO PERIODICO") return "periodico";
  if (upper.includes("ACUMULACIÓN") || upper.includes("ACUMULACION")) return "acumulacion";
  if (upper.includes("CAPITALIZACIÓN") || upper.includes("CAPITALIZACION")) return "capitalizacion";

  throw new Error(`Esquema de interés no reconocido: '${valor}'`);
}

/**
 * Parsea una fecha de Sheets (formato 'YYYY-MM-DD' o 'YYYY-MM-DD HH:mm:ss').
 */
export function parsearFecha(valor: string): Date {
  if (!valor || valor === "--" || valor === "") {
    throw new Error(`Fecha vacía o inválida: '${valor}'`);
  }

  // Tomar solo la parte de fecha (antes del espacio si tiene hora)
  const dateStr = valor.trim().split(" ")[0].split("T")[0];
  const [y, m, d] = dateStr.split("-").map(Number);

  if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) {
    throw new Error(`Formato de fecha inválido: '${valor}'`);
  }

  return new Date(y, m - 1, d);
}

/**
 * Parsea un valor numérico de Sheets.
 * Maneja: números, strings con comas, '--', vacíos.
 */
export function parsearNumero(valor: string): Decimal {
  if (!valor || valor === "--" || valor === "") return toDecimal(0);

  // Remover comas de miles y espacios
  const clean = valor.replace(/,/g, "").replace(/\s/g, "").trim();
  return toDecimal(clean);
}

// ============================================================================
// Mapper principal
// ============================================================================

/** Columnas exactas de Sheets que se mapean */
export const COLUMNAS_CARTERA = {
  folio_disposicion: "FOLIO DE DISPOSICIÓN",
  folio_linea: "FOLIO LINEA DE CRÉDITO",
  numero_contrato: "NÚMERO DEL CONTRATO",
  cliente: "CLIENTE",
  folio_cliente: "FOLIO CLIENTE",
  ejecutivo_disposicion: "EJECUTIVO LÍNEA",
  tipo_credito: "TIPO DE CRÉDITO",
  tratamiento_interes: "TRATAMIENTO INTERES",
  dia_habil: "DIA HABIL POSTERIOR",
  tipo_tasa: "TASA RECURSOS PROPIOS TASA BASE",
  spread: "TASA RECURSOS PROPIOS SOBRE TASA",
  tasa_base_ordinaria: "TASA BASE ORDINARIO",
  tasa_base_moratoria: "TASA BASE MORATORIO",
  moneda: "MONEDA",
  fecha_entrega: "FECHA DE ENTREGA",
  fecha_final: "FECHA FINAL",
  fecha_final_contrato: "FECHA FINAL DEL CONTRATO",
  fecha_saldo: "FECHA DE SALDO",
  ifrs9: "IFRS9",
  dias_impago: "DÍAS DE IMPAGO",
  num_amortizaciones: "Nª DE AMORTIZACIONES",
  // Saldos de capital
  cap_vigente: "SALDO CAPITAL VIGENTE",
  cap_impago: "SALDO CAPITAL IMPAGO",
  cap_ve: "SALDO CAPITAL VENCIDO EXIGIBLE",
  cap_vne: "SALDO CAPITAL VENCIDO NO EXIGIBLE",
  // Saldos de interés ordinario
  int_vig: "SALDO INTERES ORDINARIO VIGENTE",
  int_imp: "SALDO INTERES ORDINARIO IMPAGO",
  int_ve: "SALDO INTERES ORDINARIO VENCIDO EXIGIBLE",
  int_vne: "SALDO INTERES ORDINARIO VENCIDO NO EXIGIBLE",
  // Saldos de interés refinanciado
  ref_vig: "SALDO INTERES REFINANCIADO VIGENTE",
  ref_imp: "SALDO INTERES REFINANCIADO IMPAGO",
  ref_ve: "SALDO INTERES REFINANCIADO VENCIDO EXIGIBLE",
  ref_vne: "SALDO INTERES REFINANCIADO VENCIDO NO EXIGIBLE",
  // Moratorio
  moratorio: "SALDO INTERES MORATORIO PROVISIONADO",
  moratorio_calculado: "SALDO INTERES MORATORIO CALCULADO",
  // Saldo neto
  saldo_neto_provisionado: "SALDO NETO CON IVA",
  // Fondeo
  id_fondeador: "IDENTIFICADOR DE FONDEO",
  fuente_fondeo: "FUENTE DE FONDEO",
} as const;

/**
 * Mapea una fila cruda de Sheets a una Disposicion del motor.
 *
 * @param row - Objeto con headers como keys (de rowsToObjects)
 * @returns Disposicion normalizada
 * @throws Error si hay datos faltantes o inválidos
 */
export function mapearDisposicion(
  row: Record<string, string>
): Disposicion {
  const C = COLUMNAS_CARTERA;

  // Verificar columnas críticas
  const folio = row[C.folio_disposicion];
  if (!folio) {
    throw new Error("Fila sin FOLIO DE DISPOSICIÓN");
  }

  // Parsear tasa (puede ser '--' en 8 disposiciones)
  const tasaRaw = row[C.tasa_base_ordinaria];
  let tasaOrdinaria: Decimal;
  if (!tasaRaw || tasaRaw === "--") {
    // Intentar calcular: spread + referencia
    // Por ahora, marcar como 0 (disposición se marcará como no proyectable después)
    tasaOrdinaria = new Decimal(0);
  } else {
    tasaOrdinaria = parsearNumero(tasaRaw);
  }

  // Parsear saldos
  const saldos: EstadoSaldos = {
    capital_vigente: parsearNumero(row[C.cap_vigente]),
    capital_impago: parsearNumero(row[C.cap_impago]),
    capital_vencido_exigible: parsearNumero(row[C.cap_ve]),
    capital_vencido_no_exigible: parsearNumero(row[C.cap_vne]),
    interes_ordinario_vigente: parsearNumero(row[C.int_vig]),
    interes_ordinario_impago: parsearNumero(row[C.int_imp]),
    interes_ordinario_ve: parsearNumero(row[C.int_ve]),
    interes_ordinario_vne: parsearNumero(row[C.int_vne]),
    interes_refinanciado_vigente: parsearNumero(row[C.ref_vig]),
    interes_refinanciado_impago: parsearNumero(row[C.ref_imp]),
    interes_refinanciado_ve: parsearNumero(row[C.ref_ve]),
    interes_refinanciado_vne: parsearNumero(row[C.ref_vne]),
    interes_moratorio_acumulado: parsearNumero(row[C.moratorio]),
    interes_moratorio_calculado: parsearNumero(row[C.moratorio_calculado]),
  };

  const disposicion: Disposicion = {
    folio_disposicion: folio.trim(),
    folio_linea: row[C.folio_linea]?.trim() ?? "",
    numero_contrato: row[C.numero_contrato]?.trim() ?? "",
    cliente: row[C.cliente]?.trim() ?? "",
    tipo_credito: normalizarTipoCredito(row[C.tipo_credito]),
    esquema_interes: normalizarEsquemaInteres(row[C.tratamiento_interes]),
    regla_dia_habil: normalizarReglaDiaHabil(row[C.dia_habil]),
    tipo_tasa: row[C.tipo_tasa]?.trim() ?? "",
    tasa_base_ordinaria: tasaOrdinaria,
    moneda: row[C.moneda]?.trim() ?? "MEXICAN PESO",
    fecha_entrega: parsearFecha(row[C.fecha_entrega]),
    fecha_final_disposicion: parsearFecha(row[C.fecha_final]),
    fecha_final_contrato: parsearFecha(row[C.fecha_final_contrato]),
    fecha_saldo: parsearFecha(row[C.fecha_saldo]),
    etapa_ifrs9_actual: parsearEtapaSheets(row[C.ifrs9]),
    dias_atraso_actual: parseInt(row[C.dias_impago]) || 0,
    saldos,
    proyectable: true, // Se valida después con M3
  };

  // Marcar como no proyectable si no tiene tasa
  if (tasaOrdinaria.isZero() && disposicion.tipo_credito !== "factoraje") {
    disposicion.proyectable = false;
    disposicion.motivo_no_proyectable = `Tasa base ordinaria = '${tasaRaw}' (no calculable)`;
  }

  return disposicion;
}

/**
 * Dato extra que se extrae para el mapper pero no va al motor.
 */
export interface MetadatosDisposicion {
  folio_disposicion: string;
  ejecutivo_disposicion: string;
  folio_cliente: string;
  num_amortizaciones: number;
  saldo_neto_provisionado: number;
  spread: number;
  id_fondeador: string;
  fuente_fondeo: string;
  sucursal?: string;
}

/**
 * Extrae metadatos adicionales de una fila (para filtros y UI).
 */
export function extraerMetadatos(
  row: Record<string, string>
): MetadatosDisposicion {
  return {
    folio_disposicion: row[COLUMNAS_CARTERA.folio_disposicion]?.trim() ?? "",
    ejecutivo_disposicion: row[COLUMNAS_CARTERA.ejecutivo_disposicion]?.trim() ?? "",
    folio_cliente: row[COLUMNAS_CARTERA.folio_cliente]?.trim() ?? "",
    num_amortizaciones: parseInt(row[COLUMNAS_CARTERA.num_amortizaciones]) || 0,
    saldo_neto_provisionado: parsearNumero(row[COLUMNAS_CARTERA.saldo_neto_provisionado]).toNumber(),
    spread: parsearNumero(row[COLUMNAS_CARTERA.spread]).toNumber(),
    id_fondeador: row[COLUMNAS_CARTERA.id_fondeador]?.trim() ?? "",
    fuente_fondeo: row[COLUMNAS_CARTERA.fuente_fondeo]?.trim() ?? "",
  };
}
