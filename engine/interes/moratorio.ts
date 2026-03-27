/**
 * engine/interes/moratorio.ts
 * Cálculo de interés moratorio diario.
 * Función pura. Solo se genera cuando hay capital exigible impago.
 */

import Decimal from "decimal.js";
import { ZERO, BASE_360, DOS, tasaADecimal } from "../shared/decimal-helpers";
import type { EstadoSaldos, EsquemaInteresNorm } from "../shared/types";

/**
 * Calcula el interés moratorio generado en un solo día.
 *
 * Esquema estándar:
 *   Base = Capital Impago + Capital Vencido Exigible
 *
 * Esquema capitalización:
 *   Base = Capital Impago + Capital VE + Refinanciado Impago + Refinanciado VE
 *
 * Tasa moratoria = TasaBaseOrdinaria × 2
 *
 * Fórmula: Base × TasaMoratoria / 360
 *
 * @param saldos - Estado actual de saldos
 * @param tasaPorcentual - Tasa base ordinaria como porcentaje
 * @param esquema - Esquema de interés normalizado
 * @returns Monto de interés moratorio del día (0 si no hay capital exigible)
 */
export function calcularInteresMoratorioDiario(
  saldos: EstadoSaldos,
  tasaPorcentual: Decimal,
  esquema: EsquemaInteresNorm
): Decimal {
  // Construir la base de cálculo
  let base = saldos.capital_impago.plus(saldos.capital_vencido_exigible);

  if (esquema === "capitalizacion") {
    base = base
      .plus(saldos.interes_refinanciado_impago)
      .plus(saldos.interes_refinanciado_ve);
  }

  // Si la base es cero, no hay moratorio
  if (base.isZero()) return ZERO;

  // Tasa moratoria = ordinaria × 2
  const tasaMoratoria = tasaADecimal(tasaPorcentual).mul(DOS);

  return base.mul(tasaMoratoria).div(BASE_360);
}
