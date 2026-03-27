/**
 * Estructura del payload dentro del JWT.
 * Se firma en login y se valida en cada request protegida.
 */
export interface JwtPayload {
  /** User ID (UUID) */
  sub: string;
  /** Email del usuario */
  email: string;
  /** Clave del rol: admin_maestro, admin, gerencia, ejecutivo, staff */
  role: string;
  /** Timestamp de emisión (automático de JWT) */
  iat?: number;
  /** Timestamp de expiración (automático de JWT) */
  exp?: number;
}

/**
 * Datos del usuario que se inyectan en request.user
 * después de que el JwtStrategy valida el token.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  role_id: string;
  role_clave: string;
  numero_identificacion: string;
  nombre_en_sheets: string | null;
  status: string;
}
