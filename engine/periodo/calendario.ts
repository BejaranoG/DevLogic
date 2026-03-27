/**
 * engine/periodo/calendario.ts
 * Funciones de calendario: determinar días hábiles e inhábiles.
 * Funciones puras. No dependen de DB.
 */

import { isWeekend, format, addDays } from "date-fns";
import { FESTIVOS_MX } from "./festivos-mx";
import { FESTIVOS_US } from "./festivos-us";
import type { CalendarioPais } from "../shared/types";

/** Máximo de iteraciones para encontrar un día hábil (protección anti-loop infinito) */
const MAX_ITER = 15;

/**
 * Obtiene el set de festivos para un país.
 */
function getFestivos(pais: CalendarioPais): ReadonlySet<string> {
  return pais === "MX" ? FESTIVOS_MX : FESTIVOS_US;
}

/**
 * Formatea una fecha como 'YYYY-MM-DD' para búsqueda en el Set de festivos.
 */
function formatFecha(fecha: Date): string {
  return format(fecha, "yyyy-MM-dd");
}

/**
 * Determina si una fecha es día hábil.
 * Inhábil = sábado, domingo, o festivo del calendario correspondiente.
 *
 * @param fecha - Fecha a evaluar
 * @param pais - 'MX' o 'US'
 * @returns true si es hábil
 */
export function esDiaHabil(fecha: Date, pais: CalendarioPais): boolean {
  if (isWeekend(fecha)) return false;
  return !getFestivos(pais).has(formatFecha(fecha));
}

/**
 * Retorna la misma fecha si es hábil, o el próximo día hábil si no lo es.
 * Itera hacia adelante hasta encontrar un día hábil.
 *
 * @param fecha - Fecha de inicio
 * @param pais - 'MX' o 'US'
 * @returns El siguiente día hábil >= fecha
 * @throws Error si no encuentra día hábil en MAX_ITER iteraciones
 */
export function siguienteDiaHabil(
  fecha: Date,
  pais: CalendarioPais
): Date {
  let actual = fecha;
  for (let i = 0; i < MAX_ITER; i++) {
    if (esDiaHabil(actual, pais)) return actual;
    actual = addDays(actual, 1);
  }
  throw new Error(
    `No se encontró día hábil en ${MAX_ITER} días desde ${formatFecha(fecha)} para ${pais}`
  );
}

/**
 * Verifica que el calendario tenga cobertura para un rango de fechas.
 * No valida cada día; solo verifica que el año esté dentro del rango esperado.
 *
 * @param fechaInicio - Inicio del rango
 * @param fechaFin - Fin del rango
 * @param pais - 'MX' o 'US'
 * @returns true si el calendario tiene cobertura, false si no
 */
export function verificarCobertura(
  fechaInicio: Date,
  fechaFin: Date,
  pais: CalendarioPais
): boolean {
  const anioInicio = fechaInicio.getFullYear();
  const anioFin = fechaFin.getFullYear();
  const festivos = getFestivos(pais);

  // Verificar que hay al menos un festivo en cada año del rango
  for (let anio = anioInicio; anio <= anioFin; anio++) {
    const tieneAlMenosUno = [...festivos].some((f) =>
      f.startsWith(`${anio}-`)
    );
    if (!tieneAlMenosUno) return false;
  }
  return true;
}
