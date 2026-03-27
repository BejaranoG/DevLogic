/**
 * lib/timezone.ts
 * Utilidad de zona horaria para Logic.
 * La operación se rige por PDT (Pacific Daylight Time, UTC-7).
 */

/**
 * Retorna la fecha de "hoy" en zona horaria PDT como string YYYY-MM-DD.
 */
export function hoyPDT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/**
 * Retorna un objeto Date representando el inicio de "hoy" en PDT.
 */
export function hoyDatePDT(): Date {
  const str = hoyPDT(); // "YYYY-MM-DD"
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
