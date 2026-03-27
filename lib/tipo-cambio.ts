/**
 * lib/tipo-cambio.ts
 * Servicio de tipo de cambio USD/MXN desde Banxico SIE.
 * Serie SF60653: "Para Pagos" (fecha de liquidación).
 *
 * Consulta el TC correspondiente a una fecha específica (fecha_saldo de la cartera).
 * Si la fecha cae en fin de semana o inhábil, Banxico retorna N/E;
 * en ese caso se busca en un rango de 5 días hacia atrás para obtener el último disponible.
 *
 * Cachea por fecha: si ya se consultó la misma fecha, no vuelve a llamar a Banxico.
 */

const SERIE_PARA_PAGOS = "SF60653";
const BANXICO_API_BASE = "https://www.banxico.org.mx/SieAPIRest/service/v1/series";

export interface TipoCambio {
  valor: number;         // Pesos por dólar
  fecha: string;         // YYYY-MM-DD (fecha real del dato de Banxico)
  fecha_solicitada: string; // YYYY-MM-DD (fecha de la cartera)
  fuente: string;        // "Banxico SIE — SF60653 Para Pagos"
  consultado_at: string; // ISO timestamp de cuando se consultó
}

// Caché por fecha: { "2026-03-24": TipoCambio, ... }
const globalRef = globalThis as unknown as { __tipoCambioCache?: Map<string, TipoCambio> };

if (!globalRef.__tipoCambioCache) {
  globalRef.__tipoCambioCache = new Map();
}

const cache: Map<string, TipoCambio> = globalRef.__tipoCambioCache;

/**
 * Parsea la fecha de Banxico "DD/MM/YYYY" a "YYYY-MM-DD".
 */
function parseFechaBanxico(fechaBmx: string): string {
  const [dd, mm, yyyy] = fechaBmx.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Consulta el TC "Para Pagos" para una fecha específica.
 * Busca en un rango [fecha-5días, fecha] para cubrir fines de semana e inhábiles.
 */
async function fetchFromBanxico(fecha: string): Promise<TipoCambio> {
  const token = process.env.BANXICO_TOKEN;
  if (!token) {
    throw new Error("BANXICO_TOKEN no configurado. Agrega la variable de entorno.");
  }

  // Rango: 5 días antes de la fecha solicitada hasta la fecha
  const [y, m, d] = fecha.split("-").map(Number);
  const fechaObj = new Date(y, m - 1, d);
  const desde = new Date(fechaObj);
  desde.setDate(desde.getDate() - 5);

  const fechaDesde = desde.toISOString().slice(0, 10);
  const fechaHasta = fecha;

  const url = `${BANXICO_API_BASE}/${SERIE_PARA_PAGOS}/datos/${fechaDesde}/${fechaHasta}`;

  const response = await fetch(url, {
    headers: {
      "Bmx-Token": token,
      "Accept": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Banxico API respondió ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = await response.json();

  const series = json?.bmx?.series;
  if (!series || !series.length) {
    throw new Error("Respuesta de Banxico sin series");
  }

  const datos = series[0]?.datos;
  if (!datos || !datos.length) {
    throw new Error("Respuesta de Banxico sin datos para el rango " + fechaDesde + " a " + fechaHasta);
  }

  // Buscar el último dato válido (no N/E), empezando del más reciente
  for (let i = datos.length - 1; i >= 0; i--) {
    const item = datos[i];
    if (item.dato && item.dato !== "N/E") {
      const valor = parseFloat(item.dato);
      if (!isNaN(valor) && valor > 0) {
        return {
          valor,
          fecha: parseFechaBanxico(item.fecha),
          fecha_solicitada: fecha,
          fuente: "Banxico SIE — SF60653 Para Pagos",
          consultado_at: new Date().toISOString(),
        };
      }
    }
  }

  throw new Error("No hay tipo de cambio válido en el rango " + fechaDesde + " a " + fechaHasta);
}

/**
 * Obtiene el tipo de cambio "Para Pagos" para una fecha específica.
 * Usa caché por fecha: si ya se consultó esa fecha, retorna del caché.
 *
 * @param fecha - YYYY-MM-DD (típicamente la fecha_saldo de la cartera)
 */
export async function getTipoCambio(fecha: string): Promise<TipoCambio> {
  const cached = cache.get(fecha);
  if (cached) {
    return cached;
  }

  try {
    const tc = await fetchFromBanxico(fecha);
    cache.set(fecha, tc);
    return tc;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    throw new Error(`No se pudo obtener el tipo de cambio para ${fecha}: ${msg}`);
  }
}

/**
 * Retorna el caché para una fecha sin hacer fetch.
 */
export function getTipoCambioCached(fecha: string): TipoCambio | null {
  return cache.get(fecha) ?? null;
}

/**
 * Fuerza un refresh del tipo de cambio para una fecha.
 */
export async function refreshTipoCambio(fecha: string): Promise<TipoCambio> {
  cache.delete(fecha);
  return getTipoCambio(fecha);
}
