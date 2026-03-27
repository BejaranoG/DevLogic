/**
 * engine/periodo/festivos-mx.ts
 * Días festivos oficiales de México 2024–2031.
 * Fuente: Ley Federal del Trabajo Art. 74 + Banxico.
 * Formato: 'YYYY-MM-DD' para búsqueda O(1) con Set.
 *
 * Incluye: 1 ene, 1er lun feb, 3er lun mar, 1 may, 16 sep, 1er lun nov (si aplica),
 * 1 oct cada 6 años, 25 dic. Jueves y Viernes Santos (variables).
 */

export const FESTIVOS_MX: ReadonlySet<string> = new Set([
  // 2024
  "2024-01-01", // Año Nuevo
  "2024-02-05", // Día de la Constitución (1er lunes de feb)
  "2024-03-18", // Natalicio de Benito Juárez (3er lunes de mar)
  "2024-03-28", // Jueves Santo
  "2024-03-29", // Viernes Santo
  "2024-05-01", // Día del Trabajo
  "2024-09-16", // Día de la Independencia
  "2024-10-01", // Transmisión del Poder Ejecutivo
  "2024-11-18", // Revolución Mexicana (3er lunes de nov)
  "2024-12-25", // Navidad

  // 2025
  "2025-01-01",
  "2025-02-03", // 1er lunes de feb
  "2025-03-17", // 3er lunes de mar
  "2025-04-17", // Jueves Santo
  "2025-04-18", // Viernes Santo
  "2025-05-01",
  "2025-09-16",
  "2025-11-17", // 3er lunes de nov
  "2025-12-25",

  // 2026
  "2026-01-01",
  "2026-02-02", // 1er lunes de feb
  "2026-03-16", // 3er lunes de mar
  "2026-04-02", // Jueves Santo
  "2026-04-03", // Viernes Santo
  "2026-05-01",
  "2026-09-16",
  "2026-11-16", // 3er lunes de nov
  "2026-12-25",

  // 2027
  "2027-01-01",
  "2027-02-01", // 1er lunes de feb
  "2027-03-15", // 3er lunes de mar
  "2027-03-25", // Jueves Santo
  "2027-03-26", // Viernes Santo
  "2027-05-01",
  "2027-09-16",
  "2027-11-15", // 3er lunes de nov
  "2027-12-25",

  // 2028
  "2028-01-01",
  "2028-02-07", // 1er lunes de feb
  "2028-03-20", // 3er lunes de mar
  "2028-04-13", // Jueves Santo
  "2028-04-14", // Viernes Santo
  "2028-05-01",
  "2028-09-16",
  "2028-11-20", // 3er lunes de nov
  "2028-12-25",

  // 2029
  "2029-01-01",
  "2029-02-05", // 1er lunes de feb
  "2029-03-19", // 3er lunes de mar
  "2029-03-29", // Jueves Santo
  "2029-03-30", // Viernes Santo
  "2029-05-01",
  "2029-09-16",
  "2029-11-19", // 3er lunes de nov
  "2029-12-25",

  // 2030
  "2030-01-01",
  "2030-02-04", // 1er lunes de feb
  "2030-03-18", // 3er lunes de mar
  "2030-04-18", // Jueves Santo
  "2030-04-19", // Viernes Santo
  "2030-05-01",
  "2030-09-16",
  "2030-10-01", // Transmisión del Poder Ejecutivo
  "2030-11-18", // 3er lunes de nov
  "2030-12-25",

  // 2031
  "2031-01-01",
  "2031-02-03", // 1er lunes de feb
  "2031-03-17", // 3er lunes de mar
  "2031-04-10", // Jueves Santo
  "2031-04-11", // Viernes Santo
  "2031-05-01",
  "2031-09-16",
  "2031-11-17", // 3er lunes de nov
  "2031-12-25",
]);
