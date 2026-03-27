/**
 * engine/interes/ordinario.ts
 * Cálculo de interés ordinario diario.
 * Función pura. No depende de DB ni de M1.
 */

import Decimal from "decimal.js";
import { ZERO, BASE_360, tasaADecimal } from "../shared/decimal-helpers";
import type { EstadoSaldos, EsquemaInteresNorm } from "../shared/types";

/**
 * Calcula el interés ordinario generado en un solo día.
 *
 * Esquema estándar (periódico / acumulación):
 *   Base = Capital Vigente + Capital Vencido No Exigible
 *
 * Esquema capitalización:
 *   Base = Capital Vigente + Capital VNE + Refinanciado Vigente + Refinanciado VNE
 *
 * Fórmula: Base × TasaBaseOrdinaria / 360
 *
 * @param saldos - Estado actual de saldos
 * @param tasaPorcentual - Tasa base ordinaria como porcentaje (ej: 18.3288)
 * @param esquema - Esquema de interés normalizado
 * @returns Monto de interés ordinario del día (siempre >= 0)
 */
export function calcularInteresOrdinarioDiario(
  saldos: EstadoSaldos,
  tasaPorcentual: Decimal,
  esquema: EsquemaInteresNorm
): Decimal {
  // Construir la base de cálculo
  let base = saldos.capital_vigente.plus(saldos.capital_vencido_no_exigible);

  if (esquema === "capitalizacion") {
    base = base
      .plus(saldos.interes_refinanciado_vigente)
      .plus(saldos.interes_refinanciado_vne);
  }

  // Si la base es cero, no hay interés
  if (base.isZero()) return ZERO;

  // Interés = Base × (Tasa / 100) / 360
  const tasaDecimal = tasaADecimal(tasaPorcentual);
  return base.mul(tasaDecimal).div(BASE_360);
}
