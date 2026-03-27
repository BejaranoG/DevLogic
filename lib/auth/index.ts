/**
 * lib/auth/index.ts
 * Módulo de Autenticación y Permisos — Re-exports públicos.
 */

// Tipos
export type {
  PerfilClave,
  Perfil,
  Area,
  Usuario,
  SesionUsuario,
  SolicitudRegistro,
  AccionLog,
  EntradaLog,
} from "./types";

export { PERFILES, AREAS_PREDEFINIDAS } from "./types";

// Permisos
export {
  obtenerPerfil,
  puedeVerTodosCreditos,
  puedeProyectar,
  puedeAdminUsuarios,
  puedeVerLog,
  puedeSincronizar,
  recibeCodigosVerificacion,
  puedeVerDisposicion,
  filtroCartera,
  validarDominioEmail,
  generarCodigoVerificacion,
  generarNumeroIdentificacion,
  requireAuth,
  requirePermiso,
  PermisoError,
} from "./permissions";

// Logger
export {
  type AuditLogger,
  type LogEntry,
  type LogFiltros,
  MemoryLogger,
  ConsoleLogger,
  setLogger,
  getLogger,
  registrarAccion,
  crearEntradaLog,
} from "./logger";

// Servicio
export { AuthService, type AuthStore } from "./service";
