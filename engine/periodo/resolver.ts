/**
 * engine/periodo/resolver.ts
 * Resolución de calendario por tipo de tasa y de fechas operativas.
 * Función central del Motor de Periodo (M1).
 */

import { addDays, subDays } from "date-fns";
import { siguienteDiaHabil, esDiaHabil } from "./calendario";
import type {
  CalendarioPais,
  ReglaDiaHabilNorm,
  FechaOperativaResuelta,
} from "../shared/types";

/**
 * Dado un tipo de tasa de Sheets, determina qué calendario de festivos usar.
 *
 * Regla:
 * - Cualquier variante de TIIE o TASA FIJA → México
 * - Cualquier variante de SOFR → Estados Unidos
 *
 * @param tipoTasa - Valor crudo de col 40 de Sheets
 * @returns 'MX' o 'US'
 * @throws Error si el tipo de tasa no es reconocido
 */
export function resolverCalendario(tipoTasa: string): CalendarioPais {
  const upper = tipoTasa.toUpperCase().trim();

  if (upper.includes("TIIE") || upper === "TASA FIJA") {
    return "MX";
  }

  if (upper.includes("SOFR")) {
    return "US";
  }

  throw new Error(`Tipo de tasa no reconocido: '${tipoTasa}'`);
}

/**
 * Normaliza la regla de día hábil de Sheets al enum interno.
 *
 * @param valorSheets - 'CON DIA HABIL POSTERIOR' o 'SIN DIA HABIL POSTERIOR'
 * @returns 'DIA_HABIL_SIGUIENTE' o 'DIA_HABIL_ANTERIOR'
 * @throws Error si el valor no es reconocido
 */
export function normalizarReglaDiaHabil(
  valorSheets: string
): ReglaDiaHabilNorm {
  const upper = valorSheets.toUpperCase().trim();

  if (upper === "CON DIA HABIL POSTERIOR") {
    return "DIA_HABIL_SIGUIENTE";
  }

  if (upper === "SIN DIA HABIL POSTERIOR") {
    return "DIA_HABIL_ANTERIOR";
  }

  throw new Error(`Regla de día hábil no reconocida: '${valorSheets}'`);
}

/**
 * Transforma una fecha contractual en las tres fechas operativas.
 *
 * Día Hábil Anterior (SIN DIA HABIL POSTERIOR):
 *   Fk = Fc (siempre, sea o no hábil)
 *   Fp = siguiente_dia_habil(Fc)
 *   Fi = Fp + 1 día calendario
 *
 * Día Hábil Siguiente (CON DIA HABIL POSTERIOR):
 *   Fp = siguiente_dia_habil(Fc)
 *   Si Fc es hábil: Fk = Fc
 *   Si Fc es inhábil: Fk = Fp - 1 día calendario
 *   Fi = Fp + 1 día calendario
 *
 * @param fechaContractual - Fecha de vencimiento de la tabla de amortización
 * @param regla - Regla de día hábil normalizada
 * @param pais - Calendario de festivos a usar
 * @returns Objeto con fecha_corte, fecha_limite_pago, fecha_inicio_impago
 */
export function resolverFechaOperativa(
  fechaContractual: Date,
  regla: ReglaDiaHabilNorm,
  pais: CalendarioPais
): FechaOperativaResuelta {
  const Fc = fechaContractual;
  const Fp = siguienteDiaHabil(Fc, pais);

  let Fk: Date;

  if (regla === "DIA_HABIL_ANTERIOR") {
    // DHA: la fecha de corte es siempre la contractual
    Fk = Fc;
  } else {
    // DHS: si Fc ya es hábil, Fk = Fc; si no, Fk = Fp - 1
    if (esDiaHabil(Fc, pais)) {
      Fk = Fc;
    } else {
      Fk = subDays(Fp, 1);
    }
  }

  const Fi = addDays(Fp, 1);

  return {
    fecha_corte: Fk,
    fecha_limite_pago: Fp,
    fecha_inicio_impago: Fi,
  };
}
