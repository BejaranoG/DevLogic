/**
 * engine/interes/refinanciado.ts
 * Conversión de interés ordinario a refinanciado (solo capitalización).
 * Función pura. Modifica y retorna nuevo estado.
 */

import { ZERO } from "../shared/decimal-helpers";
import type { EstadoSaldos } from "../shared/types";

/**
 * Reclasifica el interés ordinario vigente como interés refinanciado.
 * Solo se invoca en esquema de capitalización, al cierre de un periodo.
 *
 * Efecto:
 *   refinanciado_vigente += interes_ordinario_vigente
 *   interes_ordinario_vigente = 0
 *
 * @param saldos - Estado actual (se muta in-place para eficiencia)
 */
export function convertirARefinanciado(saldos: EstadoSaldos): void {
  saldos.interes_refinanciado_vigente =
    saldos.interes_refinanciado_vigente.plus(
      saldos.interes_ordinario_vigente
    );
  saldos.interes_ordinario_vigente = ZERO;
}
