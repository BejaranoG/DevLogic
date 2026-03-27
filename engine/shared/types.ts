/**
 * engine/shared/types.ts
 * Tipos compartidos para todo el motor de cálculo.
 * CERO dependencias de framework. Solo TypeScript + decimal.js.
 */

import Decimal from "decimal.js";

// ============================================================================
// Enums normalizados
// ============================================================================

export type TipoCreditoNorm =
  | "credito_simple"
  | "refaccionario"
  | "ccc"
  | "hab_avio"
  | "factoraje"
  | "arrendamiento";

export type EsquemaInteresNorm =
  | "periodico"
  | "acumulacion"
  | "capitalizacion";

export type ReglaDiaHabilNorm =
  | "DIA_HABIL_SIGUIENTE"
  | "DIA_HABIL_ANTERIOR";

export type CalendarioPais = "MX" | "US";

export type EtapaIFRS9 = 1 | 2 | 3;

// ============================================================================
// Estado de saldos (las 13 variables)
// ============================================================================

export interface EstadoSaldos {
  // Capital (4)
  capital_vigente: Decimal;
  capital_impago: Decimal;
  capital_vencido_exigible: Decimal;
  capital_vencido_no_exigible: Decimal;

  // Interés ordinario (4)
  interes_ordinario_vigente: Decimal;
  interes_ordinario_impago: Decimal;
  interes_ordinario_ve: Decimal;
  interes_ordinario_vne: Decimal;

  // Interés refinanciado (4) — solo capitalización
  interes_refinanciado_vigente: Decimal;
  interes_refinanciado_impago: Decimal;
  interes_refinanciado_ve: Decimal;
  interes_refinanciado_vne: Decimal;

  // Moratorio (2)
  interes_moratorio_acumulado: Decimal;   // Provisionado: E1/E2 (antes de cartera vencida)
  interes_moratorio_calculado: Decimal;   // Calculado: E3 (después de cartera vencida)
}

// ============================================================================
// Disposición normalizada (entrada al motor)
// ============================================================================

export interface Disposicion {
  folio_disposicion: string;
  folio_linea: string;
  numero_contrato: string;
  cliente: string;
  tipo_credito: TipoCreditoNorm;
  esquema_interes: EsquemaInteresNorm;
  regla_dia_habil: ReglaDiaHabilNorm;
  tipo_tasa: string; // valor crudo de Sheets para resolver calendario
  tasa_base_ordinaria: Decimal; // porcentual: 18.3288 = 18.3288%
  moneda: string;
  fecha_entrega: Date;
  fecha_final_disposicion: Date;
  fecha_final_contrato: Date;
  fecha_saldo: Date; // T₀
  etapa_ifrs9_actual: EtapaIFRS9;
  dias_atraso_actual: number;
  saldos: EstadoSaldos;

  // Flags
  proyectable: boolean;
  motivo_no_proyectable?: string;
}

// ============================================================================
// Amortización (de la tabla de Sheets)
// ============================================================================

export interface Amortizacion {
  folio_disposicion: string;
  numero_amortizacion: number;
  fecha_vencimiento: Date; // fecha contractual
  monto_capital: Decimal;
  amortizacion_liquidada: boolean;
}

// ============================================================================
// Periodo operativo (salida de M1)
// ============================================================================

export interface PeriodoOperativo {
  numero_amortizacion: number;
  fecha_contractual: Date;
  fecha_corte: Date;       // Fk: último día de interés del periodo
  fecha_limite_pago: Date;  // Fp: último día hábil para pagar
  fecha_inicio_impago: Date; // Fi: primer día de atraso
  dias_periodo: number;
  monto_capital: Decimal;
  liquidada: boolean;
  es_sintetica: boolean; // true si fue generada por Logic (no viene de Sheets)
}

// ============================================================================
// Resultado de interés diario (salida de M2)
// ============================================================================

export interface InteresesDia {
  interes_ordinario_del_dia: Decimal;
  interes_moratorio_del_dia: Decimal;
}

// ============================================================================
// Regla de etapa IFRS9 (tabla core_regla_etapa)
// ============================================================================

export interface ReglaEtapa {
  id: string;
  esquema_interes: EsquemaInteresNorm;
  e1_max_dias: number;
  tiene_etapa2: boolean;
  e2_max_dias: number | null;
  e3_inicio_dias: number | null; // null = no entra a CV (arrendamiento)
}

// ============================================================================
// Fecha operativa resuelta (salida intermedia de M1)
// ============================================================================

export interface FechaOperativaResuelta {
  fecha_corte: Date;
  fecha_limite_pago: Date;
  fecha_inicio_impago: Date;
}

// ============================================================================
// Snapshot diario (salida de M4, una fila por día)
// ============================================================================

export interface SnapshotDiario {
  fecha: Date;
  dia_numero: number;
  saldos: EstadoSaldos;
  etapa_ifrs9: EtapaIFRS9;
  dias_atraso: number;
  interes_ordinario_del_dia: Decimal;
  interes_moratorio_del_dia: Decimal;
  evento: string | null; // 'vencimiento_capital', 'transicion_etapa3', etc.
}

// ============================================================================
// Resultado de proyección (salida final de M4)
// ============================================================================

export interface ResultadoProyeccion {
  folio_disposicion: string;
  fecha_base: Date;
  fecha_objetivo: Date;
  tasa_utilizada: Decimal;
  escenario: "no_pago";
  saldos_finales: EstadoSaldos;
  etapa_ifrs9_final: EtapaIFRS9;
  dias_atraso_final: number;
  interes_ordinario_total_generado: Decimal;
  interes_moratorio_total_generado: Decimal;
  interes_moratorio_provisionado_generado: Decimal;  // Generado en E1/E2
  interes_moratorio_calculado_generado: Decimal;      // Generado en E3
  saldo_total: Decimal;
  snapshots: SnapshotDiario[];
  duracion_ms: number;
}

// ============================================================================
// Resultado de validación inicial
// ============================================================================

export interface ValidacionInicial {
  proyectable: boolean;
  motivo?: string;
  regla?: ReglaEtapa;
}
