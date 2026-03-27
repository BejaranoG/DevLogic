/**
 * lib/auth/permissions.ts
 * Sistema de permisos de Logic.
 *
 * Todas las funciones son puras: reciben la sesión del usuario
 * y retornan boolean o lanzan error. No acceden a DB.
 */

import { PERFILES, type SesionUsuario, type PerfilClave, type Perfil } from "./types";

// ============================================================================
// Obtener perfil completo
// ============================================================================

export function obtenerPerfil(clave: PerfilClave): Perfil {
  const perfil = PERFILES[clave];
  if (!perfil) throw new Error(`Perfil no reconocido: ${clave}`);
  return perfil;
}

// ============================================================================
// Verificaciones de permisos (funciones puras)
// ============================================================================

/** ¿Puede ver todas las disposiciones? (false para Ejecutivo) */
export function puedeVerTodosCreditos(sesion: SesionUsuario): boolean {
  return obtenerPerfil(sesion.perfil).puede_ver_todos_creditos;
}

/** ¿Puede ejecutar proyecciones? (todos los autenticados) */
export function puedeProyectar(sesion: SesionUsuario): boolean {
  return obtenerPerfil(sesion.perfil).puede_proyectar;
}

/** ¿Puede administrar usuarios? (solo admin_maestro y admin) */
export function puedeAdminUsuarios(sesion: SesionUsuario): boolean {
  return obtenerPerfil(sesion.perfil).puede_admin_usuarios;
}

/** ¿Puede ver el log de actividad? */
export function puedeVerLog(sesion: SesionUsuario): boolean {
  return obtenerPerfil(sesion.perfil).puede_ver_log;
}

/** ¿Puede disparar sincronización con Sheets? */
export function puedeSincronizar(sesion: SesionUsuario): boolean {
  return obtenerPerfil(sesion.perfil).puede_sincronizar;
}

/** ¿Recibe códigos de verificación de registro? */
export function recibeCodigosVerificacion(sesion: SesionUsuario): boolean {
  return obtenerPerfil(sesion.perfil).recibe_codigos_verificacion;
}

// ============================================================================
// Filtro de cartera para Ejecutivo
// ============================================================================

/**
 * Determina si un Ejecutivo puede ver una disposición específica.
 *
 * @param sesion - Sesión del usuario
 * @param ejecutivoDisposicionEnSheets - Valor del campo EJECUTIVO DISPOSICIÓN de la disposición
 * @returns true si puede ver la disposición
 *
 * Regla:
 * - Si el perfil NO es ejecutivo → siempre true (ve todo)
 * - Si ES ejecutivo → solo si su nombre_en_sheets coincide con el ejecutivo de la disposición
 */
export function puedeVerDisposicion(
  sesion: SesionUsuario,
  ejecutivoDisposicionEnSheets: string
): boolean {
  // No-ejecutivos ven todo
  if (sesion.perfil !== "ejecutivo") return true;

  // Ejecutivo sin mapeo: no puede ver nada (error de configuración)
  if (!sesion.nombre_en_sheets) return false;

  // Comparación case-insensitive y trimmed
  const nombreUsuario = sesion.nombre_en_sheets.toUpperCase().trim();
  const nombreSheets = ejecutivoDisposicionEnSheets.toUpperCase().trim();

  return nombreUsuario === nombreSheets;
}

/**
 * Genera la cláusula WHERE para filtrar disposiciones por ejecutivo.
 * Se usa en queries de listado.
 *
 * @param sesion - Sesión del usuario
 * @returns null si ve todo, o el nombre para filtrar
 */
export function filtroCartera(sesion: SesionUsuario): string | null {
  if (sesion.perfil !== "ejecutivo") return null;
  return sesion.nombre_en_sheets;
}

// ============================================================================
// Validaciones de registro
// ============================================================================

const DOMINIO_PERMITIDO = "@proaktiva.com.mx";

/**
 * Valida que un email tenga dominio @proaktiva.com.mx
 */
export function validarDominioEmail(email: string): {
  valido: boolean;
  error?: string;
} {
  const emailLower = email.toLowerCase().trim();

  if (!emailLower.includes("@")) {
    return { valido: false, error: "Email inválido" };
  }

  if (!emailLower.endsWith(DOMINIO_PERMITIDO)) {
    return {
      valido: false,
      error: `Solo se permiten correos con dominio ${DOMINIO_PERMITIDO}`,
    };
  }

  // Validación básica de formato
  const regex = /^[a-z0-9._%+-]+@proaktiva\.com\.mx$/;
  if (!regex.test(emailLower)) {
    return { valido: false, error: "Formato de email inválido" };
  }

  return { valido: true };
}

/**
 * Genera un código de verificación de 6 dígitos.
 */
export function generarCodigoVerificacion(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Genera el siguiente número de identificación.
 * Formato: LOG-XXXX donde XXXX es secuencial.
 *
 * @param ultimoNumero - Último número asignado (ej: 5)
 * @returns "LOG-0006"
 */
export function generarNumeroIdentificacion(ultimoNumero: number): string {
  const siguiente = ultimoNumero + 1;
  return `LOG-${String(siguiente).padStart(4, "0")}`;
}

// ============================================================================
// Middleware helper: verificar permiso o lanzar error
// ============================================================================

export class PermisoError extends Error {
  public readonly statusCode: number;

  constructor(mensaje: string, statusCode: number = 403) {
    super(mensaje);
    this.name = "PermisoError";
    this.statusCode = statusCode;
  }
}

/**
 * Verifica que la sesión exista (usuario autenticado).
 * @throws PermisoError si no hay sesión
 */
export function requireAuth(
  sesion: SesionUsuario | null | undefined
): asserts sesion is SesionUsuario {
  if (!sesion) {
    throw new PermisoError("No autenticado. Inicia sesión.", 401);
  }
}

/**
 * Verifica un permiso específico.
 * @throws PermisoError si no tiene permiso
 */
export function requirePermiso(
  sesion: SesionUsuario,
  verificador: (s: SesionUsuario) => boolean,
  accion: string
): void {
  if (!verificador(sesion)) {
    throw new PermisoError(
      `No tienes permiso para: ${accion}. Tu perfil: ${sesion.perfil}`
    );
  }
}
