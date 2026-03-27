/**
 * engine/etapas/reclasificacion.ts
 * Reclasificación masiva de saldos al cruzar umbral de Etapa 3.
 * Muta el estado in-place para eficiencia.
 */

import { ZERO } from "../shared/decimal-helpers";
import type { EstadoSaldos } from "../shared/types";

/**
 * Reclasifica todos los saldos al entrar a Etapa 3 (Cartera Vencida).
 *
 * Movimientos:
 *   capital_vigente       → capital_vencido_no_exigible
 *   capital_impago        → capital_vencido_exigible
 *   interes_ord_vigente   → interes_ord_vne
 *   interes_ord_impago    → interes_ord_ve
 *   refinanciado_vigente  → refinanciado_vne
 *   refinanciado_impago   → refinanciado_ve
 *   moratorio             → sin cambio (sigue acumulando)
 *
 * @param saldos - Estado actual (se muta in-place)
 */
export function reclasificarAEtapa3(saldos: EstadoSaldos): void {
  // Capital
  saldos.capital_vencido_no_exigible = saldos.capital_vencido_no_exigible.plus(
    saldos.capital_vigente
  );
  saldos.capital_vigente = ZERO;

  saldos.capital_vencido_exigible = saldos.capital_vencido_exigible.plus(
    saldos.capital_impago
  );
  saldos.capital_impago = ZERO;

  // Interés ordinario
  saldos.interes_ordinario_vne = saldos.interes_ordinario_vne.plus(
    saldos.interes_ordinario_vigente
  );
  saldos.interes_ordinario_vigente = ZERO;

  saldos.interes_ordinario_ve = saldos.interes_ordinario_ve.plus(
    saldos.interes_ordinario_impago
  );
  saldos.interes_ordinario_impago = ZERO;

  // Interés refinanciado (solo tiene valor en capitalización)
  saldos.interes_refinanciado_vne = saldos.interes_refinanciado_vne.plus(
    saldos.interes_refinanciado_vigente
  );
  saldos.interes_refinanciado_vigente = ZERO;

  saldos.interes_refinanciado_ve = saldos.interes_refinanciado_ve.plus(
    saldos.interes_refinanciado_impago
  );
  saldos.interes_refinanciado_impago = ZERO;

  // Moratorio: NO se reclasifica, sigue acumulando
}
