/**
 * sync/sheets-client.ts
 * Cliente para leer Google Sheets públicos.
 *
 * Usa la URL de exportación CSV que funciona para hojas públicas
 * sin necesidad de API key ni Service Account.
 *
 * URL pattern:
 * https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&sheet={TAB}
 */

export interface SheetsConfig {
  spreadsheetId: string;
  tabCartera: string;
  tabAmortizacion: string;
}

/**
 * Configuración por defecto de Proaktiva.
 */
export const PROAKTIVA_CONFIG: SheetsConfig = {
  spreadsheetId: "1bpNfE9UN_L0rSVN4wCgCwKM8Ui2HNSdw6wMcBDGYwvw",
  tabCartera: "Cartera Activa",
  tabAmortizacion: "Cartera Activa Amortizaciones",
};

export const PROAKTIVA_PASIVA_CONFIG: SheetsConfig = {
  spreadsheetId: "1bpNfE9UN_L0rSVN4wCgCwKM8Ui2HNSdw6wMcBDGYwvw",
  tabCartera: "Cartera Pasiva",
  tabAmortizacion: "Cartera Pasiva Amortizaciones",
};

/**
 * Construye la URL de exportación CSV para una pestaña.
 */
export function buildCsvUrl(spreadsheetId: string, sheetName: string): string {
  const encodedSheet = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodedSheet}`;
}

/**
 * Parsea CSV simple (maneja comillas y comas dentro de campos).
 * No usa librerías externas para minimizar dependencias.
 */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current);
        current = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(current);
        current = "";
        if (row.length > 1 || row[0] !== "") {
          rows.push(row);
        }
        row = [];
        if (ch === "\r") i++; // skip \n after \r
      } else {
        current += ch;
      }
    }
  }

  // Last field/row
  if (current || row.length > 0) {
    row.push(current);
    if (row.length > 1 || row[0] !== "") {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Convierte un array 2D (headers + data) en array de objetos.
 * Primera fila = headers.
 */
export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const objects: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = rows[i][j]?.trim() ?? "";
    }
    objects.push(obj);
  }

  return objects;
}

/**
 * Descarga y parsea una pestaña de Google Sheets.
 *
 * @param spreadsheetId - ID del spreadsheet
 * @param sheetName - Nombre exacto de la pestaña
 * @returns Array de objetos con headers como keys
 * @throws Error si la descarga falla
 */
export async function fetchSheetTab(
  spreadsheetId: string,
  sheetName: string
): Promise<Record<string, string>[]> {
  const url = buildCsvUrl(spreadsheetId, sheetName);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Error al leer Google Sheets: ${response.status} ${response.statusText}\n` +
      `URL: ${url}\n` +
      `¿El Sheet es público? Verifica que tenga acceso "Cualquier persona con el enlace".`
    );
  }

  const csvText = await response.text();

  // Google a veces retorna HTML de error en lugar de CSV
  if (csvText.startsWith("<!DOCTYPE") || csvText.startsWith("<html")) {
    throw new Error(
      `Google Sheets retornó HTML en lugar de CSV. Posibles causas:\n` +
      `1. El Sheet no es público\n` +
      `2. El nombre de la pestaña es incorrecto: "${sheetName}"\n` +
      `3. El Spreadsheet ID es incorrecto: "${spreadsheetId}"`
    );
  }

  const rows = parseCsv(csvText);
  return rowsToObjects(rows);
}

/**
 * Descarga ambas pestañas de la cartera de Proaktiva.
 */
export async function fetchCarteraCompleta(
  config: SheetsConfig = PROAKTIVA_CONFIG
): Promise<{
  cartera: Record<string, string>[];
  amortizaciones: Record<string, string>[];
  metadata: {
    spreadsheet_id: string;
    tabs: string[];
    filas_cartera: number;
    filas_amortizacion: number;
    timestamp: Date;
  };
}> {
  const cartera = await fetchSheetTab(config.spreadsheetId, config.tabCartera);
  const amortizaciones = await fetchSheetTab(
    config.spreadsheetId,
    config.tabAmortizacion
  );

  return {
    cartera,
    amortizaciones,
    metadata: {
      spreadsheet_id: config.spreadsheetId,
      tabs: [config.tabCartera, config.tabAmortizacion],
      filas_cartera: cartera.length,
      filas_amortizacion: amortizaciones.length,
      timestamp: new Date(),
    },
  };
}
