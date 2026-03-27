/**
 * engine/etapas/index.ts
 * Motor de Etapas y Movimientos (M3) — Orquestador + re-exports.
 */

import type { EstadoSaldos, EtapaIFRS9, ReglaEtapa } from "../shared/types";
import { evaluarEtapa } from "./evaluador";
import { reclasificarAEtapa3 } from "./reclasificacion";

export { resolverReglaEtapa } from "./reglas";
export { evaluarEtapa, validarEtapaInicial, parsearEtapaSheets } from "./evaluador";
export { reclasificarAEtapa3 } from "./reclasificacion";

/**
 * Resultado de ejecutar M3 en un día.
 */
export interface ResultadoM3 {
  nueva_etapa: EtapaIFRS9;
  hubo_transicion: boolean;
  evento: string | null;
}

/**
 * Ejecuta M3 para un día de la proyección.
 * Evalúa si los días de atraso cruzaron un umbral y reclasifica si aplica.
 *
 * @param saldos - Estado actual (se muta si hay reclasificación)
 * @param etapaActual - Etapa IFRS9 al inicio del día
 * @param diasAtraso - Días de atraso actualizados
 * @param regla - Regla de etapa de la disposición
 * @returns Resultado con nueva etapa y si hubo transición
 */
export function ejecutarM3(
  saldos: EstadoSaldos,
  etapaActual: EtapaIFRS9,
  diasAtraso: number,
  regla: ReglaEtapa
): ResultadoM3 {
  const nuevaEtapa = evaluarEtapa(diasAtraso, regla);

  if (nuevaEtapa === etapaActual) {
    return { nueva_etapa: etapaActual, hubo_transicion: false, evento: null };
  }

  // Transición detectada
  if (nuevaEtapa === 3 && etapaActual < 3) {
    reclasificarAEtapa3(saldos);
    return {
      nueva_etapa: 3,
      hubo_transicion: true,
      evento: "transicion_etapa3",
    };
  }

  if (nuevaEtapa === 2 && etapaActual === 1) {
    // Etapa 1 → 2: solo cambia el campo, no reclasifica saldos
    return {
      nueva_etapa: 2,
      hubo_transicion: true,
      evento: "transicion_etapa2",
    };
  }

  // Caso defensivo (no debería ocurrir en no-pago)
  return { nueva_etapa: nuevaEtapa, hubo_transicion: true, evento: `transicion_e${nuevaEtapa}` };
}
