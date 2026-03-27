/**
 * engine/interes/index.ts
 * Motor de Intereses (M2) — Orquestador + re-exports.
 */

import Decimal from "decimal.js";
import { ZERO } from "../shared/decimal-helpers";
import { calcularInteresOrdinarioDiario } from "./ordinario";
import { calcularInteresMoratorioDiario } from "./moratorio";
import type {
  EstadoSaldos,
  EsquemaInteresNorm,
  TipoCreditoNorm,
  InteresesDia,
} from "../shared/types";

export { calcularInteresOrdinarioDiario } from "./ordinario";
export { calcularInteresMoratorioDiario } from "./moratorio";
export { convertirARefinanciado } from "./refinanciado";

/** Productos que no generan interés diario */
const SIN_INTERES_DIARIO: ReadonlySet<TipoCreditoNorm> = new Set([
  "factoraje",
  "arrendamiento",
]);

/**
 * Calcula todos los intereses generados en un día para una disposición.
 * Función orquestadora invocada por M4 en cada iteración diaria.
 *
 * @param tipoCred - Tipo de crédito normalizado
 * @param esquema - Esquema de interés
 * @param saldos - Estado actual de saldos
 * @param tasaPorcentual - Tasa base ordinaria (ej: 18.3288)
 * @returns Intereses del día (ordinario + moratorio)
 */
export function calcularInteresesDia(
  tipoCred: TipoCreditoNorm,
  esquema: EsquemaInteresNorm,
  saldos: EstadoSaldos,
  tasaPorcentual: Decimal
): InteresesDia {
  // Cortocircuito: productos sin interés diario
  if (SIN_INTERES_DIARIO.has(tipoCred)) {
    return {
      interes_ordinario_del_dia: ZERO,
      interes_moratorio_del_dia: ZERO,
    };
  }

  const ordinario = calcularInteresOrdinarioDiario(
    saldos,
    tasaPorcentual,
    esquema
  );

  const moratorio = calcularInteresMoratorioDiario(
    saldos,
    tasaPorcentual,
    esquema
  );

  return {
    interes_ordinario_del_dia: ordinario,
    interes_moratorio_del_dia: moratorio,
  };
}
