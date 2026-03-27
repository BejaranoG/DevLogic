/**
 * lib/auth/logger.ts
 * Logger de auditoría para Logic.
 *
 * Registra toda acción en core_log_actividad.
 * Append-only: nunca se modifica ni borra.
 *
 * En el MVP sin DB, exporta una interfaz que será implementada
 * por el adaptador de Prisma cuando se conecte la base de datos.
 * Por ahora incluye un logger en memoria para tests y un
 * logger a consola para desarrollo.
 */

import type { AccionLog, SesionUsuario } from "./types";

// ============================================================================
// Interfaz del logger (independiente de implementación)
// ============================================================================

export interface LogEntry {
  id: string;
  id_usuario: string | null;
  email: string | null;
  accion: AccionLog;
  detalle: Record<string, unknown>;
  ip_address: string | null;
  created_at: Date;
}

export interface AuditLogger {
  registrar(entry: Omit<LogEntry, "id" | "created_at">): Promise<void>;
  consultar(filtros: LogFiltros): Promise<LogEntry[]>;
}

export interface LogFiltros {
  id_usuario?: string;
  accion?: AccionLog;
  desde?: Date;
  hasta?: Date;
  limit?: number;
}

// ============================================================================
// Helper: construir entrada de log desde sesión
// ============================================================================

/**
 * Crea una entrada de log pre-llenada con datos de la sesión.
 * El caller solo necesita agregar accion y detalle.
 */
export function crearEntradaLog(
  sesion: SesionUsuario | null,
  accion: AccionLog,
  detalle: Record<string, unknown>,
  ip: string | null = null
): Omit<LogEntry, "id" | "created_at"> {
  return {
    id_usuario: sesion?.id ?? null,
    email: sesion?.email ?? null,
    accion,
    detalle,
    ip_address: ip,
  };
}

// ============================================================================
// Implementación: Logger en memoria (para tests)
// ============================================================================

export class MemoryLogger implements AuditLogger {
  public entries: LogEntry[] = [];
  private counter = 0;

  async registrar(entry: Omit<LogEntry, "id" | "created_at">): Promise<void> {
    this.counter++;
    this.entries.push({
      ...entry,
      id: `log-${this.counter}`,
      created_at: new Date(),
    });
  }

  async consultar(filtros: LogFiltros): Promise<LogEntry[]> {
    let result = [...this.entries];

    if (filtros.id_usuario) {
      result = result.filter((e) => e.id_usuario === filtros.id_usuario);
    }
    if (filtros.accion) {
      result = result.filter((e) => e.accion === filtros.accion);
    }
    if (filtros.desde) {
      result = result.filter((e) => e.created_at >= filtros.desde!);
    }
    if (filtros.hasta) {
      result = result.filter((e) => e.created_at <= filtros.hasta!);
    }

    // Más reciente primero
    result.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    if (filtros.limit) {
      result = result.slice(0, filtros.limit);
    }

    return result;
  }

  clear(): void {
    this.entries = [];
    this.counter = 0;
  }
}

// ============================================================================
// Implementación: Logger a consola (para desarrollo)
// ============================================================================

export class ConsoleLogger implements AuditLogger {
  async registrar(entry: Omit<LogEntry, "id" | "created_at">): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(
      `[AUDIT ${timestamp}] ${entry.accion} | user=${entry.email ?? "anon"} | ${JSON.stringify(entry.detalle)}`
    );
  }

  async consultar(_filtros: LogFiltros): Promise<LogEntry[]> {
    console.warn("ConsoleLogger.consultar: no soportado, retorna []");
    return [];
  }
}

// ============================================================================
// Singleton global (se reemplaza por PrismaLogger en producción)
// ============================================================================

let _logger: AuditLogger = new ConsoleLogger();

export function setLogger(logger: AuditLogger): void {
  _logger = logger;
}

export function getLogger(): AuditLogger {
  return _logger;
}

/**
 * Shortcut: registrar una acción directamente.
 */
export async function registrarAccion(
  sesion: SesionUsuario | null,
  accion: AccionLog,
  detalle: Record<string, unknown>,
  ip?: string | null
): Promise<void> {
  const entry = crearEntradaLog(sesion, accion, detalle, ip ?? null);
  await _logger.registrar(entry);
}
