/**
 * engine/shared/decimal-helpers.ts
 * Wrappers de Decimal para operaciones financieras.
 * Configura precisión global y provee funciones de conveniencia.
 */

import Decimal from "decimal.js";

// Configuración global: 20 dígitos de precisión, redondeo half-up
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Cero constante */
export const ZERO = new Decimal(0);

/** 360 constante (base de cálculo de interés) */
export const BASE_360 = new Decimal(360);

/** 100 constante (para convertir porcentaje a decimal) */
export const CIEN = new Decimal(100);

/** 2 constante (multiplicador de tasa moratoria) */
export const DOS = new Decimal(2);

/**
 * Convierte un valor string/number a Decimal.
 * Si el valor es '--', null, undefined o vacío, retorna ZERO.
 */
export function toDecimal(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === "" || value === "--") {
    return ZERO;
  }
  try {
    return new Decimal(value);
  } catch {
    return ZERO;
  }
}

/**
 * Redondea a 2 decimales (solo para salida final).
 * NUNCA usar en cálculos intermedios.
 */
export function redondear2(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Redondea a 6 decimales (para interés diario granular).
 */
export function redondear6(d: Decimal): Decimal {
  return d.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

/**
 * Convierte tasa porcentual a decimal: 18.3288 → 0.183288
 */
export function tasaADecimal(tasaPorcentual: Decimal): Decimal {
  return tasaPorcentual.div(CIEN);
}

/**
 * Crea un EstadoSaldos vacío (todos en cero).
 */
export function estadoSaldosVacio() {
  return {
    capital_vigente: ZERO,
    capital_impago: ZERO,
    capital_vencido_exigible: ZERO,
    capital_vencido_no_exigible: ZERO,
    interes_ordinario_vigente: ZERO,
    interes_ordinario_impago: ZERO,
    interes_ordinario_ve: ZERO,
    interes_ordinario_vne: ZERO,
    interes_refinanciado_vigente: ZERO,
    interes_refinanciado_impago: ZERO,
    interes_refinanciado_ve: ZERO,
    interes_refinanciado_vne: ZERO,
    interes_moratorio_acumulado: ZERO,
    interes_moratorio_calculado: ZERO,
  };
}

/**
 * Clona profundo un EstadoSaldos (cada Decimal es inmutable, pero el objeto no).
 */
export function clonarEstado(
  estado: import("./types").EstadoSaldos
): import("./types").EstadoSaldos {
  return { ...estado };
}

/**
 * Suma total de capital: vigente + impago + VE + VNE.
 * Debe ser constante (invariante de conservación).
 */
export function capitalTotal(
  estado: import("./types").EstadoSaldos
): Decimal {
  return estado.capital_vigente
    .plus(estado.capital_impago)
    .plus(estado.capital_vencido_exigible)
    .plus(estado.capital_vencido_no_exigible);
}
