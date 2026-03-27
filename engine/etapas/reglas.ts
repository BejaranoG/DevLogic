/**
 * engine/etapas/reglas.ts
 * Tabla de reglas de etapa IFRS9 por producto y esquema.
 * Fuente documental de Proaktiva — reglas confirmadas.
 */

import type {
  TipoCreditoNorm,
  EsquemaInteresNorm,
  ReglaEtapa,
} from "../shared/types";

/**
 * Reglas estáticas definidas según documentación de Proaktiva.
 *
 * Solo Crédito Simple y Refaccionario con cobro periódico tienen Etapa 2 (31-89 días).
 * Todos los demás: Etapa 1 → Etapa 3 directa.
 */
const REGLAS: ReglaEtapa[] = [
  // R1: Crédito Simple / Refaccionario + periódico → tiene Etapa 2
  {
    id: "R1",
    esquema_interes: "periodico",
    e1_max_dias: 30,
    tiene_etapa2: true,
    e2_max_dias: 89,
    e3_inicio_dias: 90,
  },
  // R2: acumulación → sin Etapa 2
  {
    id: "R2",
    esquema_interes: "acumulacion",
    e1_max_dias: 29,
    tiene_etapa2: false,
    e2_max_dias: null,
    e3_inicio_dias: 30,
  },
  // R3: capitalización → sin Etapa 2
  {
    id: "R3",
    esquema_interes: "capitalizacion",
    e1_max_dias: 29,
    tiene_etapa2: false,
    e2_max_dias: null,
    e3_inicio_dias: 30,
  },
];

/** Productos que usan R1 (con Etapa 2) solo con cobro periódico */
const PRODUCTOS_CON_ETAPA2: ReadonlySet<TipoCreditoNorm> = new Set([
  "credito_simple",
  "refaccionario",
]);

/**
 * Resuelve la regla de etapa IFRS9 para una combinación producto + esquema.
 *
 * @param tipoCred - Tipo de crédito normalizado
 * @param esquema - Esquema de interés normalizado
 * @returns ReglaEtapa o null si no hay regla (disposición no proyectable)
 */
export function resolverReglaEtapa(
  tipoCred: TipoCreditoNorm,
  esquema: EsquemaInteresNorm
): ReglaEtapa | null {
  // Arrendamiento: no entra a cartera vencida
  if (tipoCred === "arrendamiento") {
    return {
      id: "R_ARR",
      esquema_interes: esquema,
      e1_max_dias: Infinity,
      tiene_etapa2: false,
      e2_max_dias: null,
      e3_inicio_dias: null, // nunca entra a E3
    };
  }

  // Crédito Simple / Refaccionario con periódico: TIENE Etapa 2
  if (PRODUCTOS_CON_ETAPA2.has(tipoCred) && esquema === "periodico") {
    return REGLAS[0]; // R1
  }

  // Todos los demás productos/esquemas: sin Etapa 2, E1 max 29, E3 a 30 días
  // Esto incluye CCC, Hab/Avío, Factoraje con cualquier esquema,
  // y Crédito Simple/Refaccionario con acumulación o capitalización.
  return {
    id: `R_${tipoCred}_${esquema}`,
    esquema_interes: esquema,
    e1_max_dias: 29,
    tiene_etapa2: false,
    e2_max_dias: null,
    e3_inicio_dias: 30,
  };
}
