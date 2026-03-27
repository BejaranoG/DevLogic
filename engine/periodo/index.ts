/**
 * engine/periodo/index.ts
 * Motor de Periodo (M1) — Re-exports públicos.
 */

export { esDiaHabil, siguienteDiaHabil, verificarCobertura } from "./calendario";
export { resolverCalendario, resolverFechaOperativa, normalizarReglaDiaHabil } from "./resolver";
export { construirPeriodos } from "./periodos";
export { FESTIVOS_MX } from "./festivos-mx";
export { FESTIVOS_US } from "./festivos-us";
