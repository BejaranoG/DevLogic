/**
 * lib/auth/types.ts
 * Tipos del sistema de autenticación y permisos de Logic.
 *
 * DISEÑO:
 *
 * 1. MODELO DE USUARIOS Y ROLES
 *    - 5 perfiles: admin_maestro, admin, gerencia, ejecutivo, staff
 *    - Cada usuario tiene exactamente 1 perfil
 *    - Ejecutivo tiene campo adicional: nombre_en_sheets (para mapear a EJECUTIVO DISPOSICIÓN)
 *    - Cada usuario recibe un numero_identificacion único autogenerado (ej: "LOG-0001")
 *
 * 2. FLUJO DE REGISTRO
 *    a) Usuario ingresa email @proaktiva.com.mx + contraseña
 *    b) Sistema genera código de verificación de 6 dígitos y lo almacena
 *    c) Se notifica al Admin Maestro (en su panel de Logic aparece solicitud pendiente)
 *    d) Admin Maestro ve la solicitud y comparte el código con el usuario
 *    e) Usuario ingresa el código → cuenta se activa
 *    f) Usuario completa: nombre, apellido, área
 *    g) Admin Maestro o Admin asigna el perfil (rol)
 *    h) Si es Ejecutivo, Admin mapea su nombre_en_sheets al nombre de Sheets
 *
 * 3. PERMISOS
 *    - Ver todos los créditos: todos excepto Ejecutivo
 *    - Ejecutivo: solo ve disposiciones donde EJECUTIVO DISPOSICIÓN = su nombre_en_sheets
 *    - Proyectar: todos los autenticados
 *    - Admin usuarios: solo admin_maestro y admin
 *    - Ver log: solo admin_maestro y admin
 *    - Sincronizar Sheets: solo admin_maestro y admin
 *    - Recibir códigos de verificación: solo admin_maestro
 *
 * 4. CONEXIÓN CON GOOGLE SHEETS
 *    - La autenticación de usuarios NO tiene relación con Sheets
 *    - Sheets se conecta via Service Account (separado)
 *    - El campo nombre_en_sheets del Ejecutivo es el puente:
 *      se compara contra la columna EJECUTIVO DISPOSICIÓN de la cartera
 */

// ============================================================================
// Perfiles (roles)
// ============================================================================

export type PerfilClave =
  | "admin_maestro"
  | "admin"
  | "gerencia"
  | "ejecutivo"
  | "staff";

export interface Perfil {
  clave: PerfilClave;
  nombre: string;
  puede_ver_todos_creditos: boolean;
  puede_proyectar: boolean;
  puede_admin_usuarios: boolean;
  puede_ver_log: boolean;
  puede_sincronizar: boolean;
  recibe_codigos_verificacion: boolean;
}

// ============================================================================
// Catálogo de perfiles (inmutable)
// ============================================================================

export const PERFILES: Record<PerfilClave, Perfil> = {
  admin_maestro: {
    clave: "admin_maestro",
    nombre: "Administrador Maestro",
    puede_ver_todos_creditos: true,
    puede_proyectar: true,
    puede_admin_usuarios: true,
    puede_ver_log: true,
    puede_sincronizar: true,
    recibe_codigos_verificacion: true,
  },
  admin: {
    clave: "admin",
    nombre: "Administrador",
    puede_ver_todos_creditos: true,
    puede_proyectar: true,
    puede_admin_usuarios: true,
    puede_ver_log: true,
    puede_sincronizar: true,
    recibe_codigos_verificacion: false,
  },
  gerencia: {
    clave: "gerencia",
    nombre: "Gerencia",
    puede_ver_todos_creditos: true,
    puede_proyectar: true,
    puede_admin_usuarios: false,
    puede_ver_log: false,
    puede_sincronizar: false,
    recibe_codigos_verificacion: false,
  },
  ejecutivo: {
    clave: "ejecutivo",
    nombre: "Ejecutivo",
    puede_ver_todos_creditos: false, // ← solo su cartera
    puede_proyectar: true,
    puede_admin_usuarios: false,
    puede_ver_log: false,
    puede_sincronizar: false,
    recibe_codigos_verificacion: false,
  },
  staff: {
    clave: "staff",
    nombre: "Staff",
    puede_ver_todos_creditos: true,
    puede_proyectar: true,
    puede_admin_usuarios: false,
    puede_ver_log: false,
    puede_sincronizar: false,
    recibe_codigos_verificacion: false,
  },
};

// ============================================================================
// Áreas predefinidas
// ============================================================================

export const AREAS_PREDEFINIDAS = [
  "Dirección General",
  "Crédito",
  "Cobranza",
  "Operaciones",
  "Legal",
  "Contabilidad",
  "Sistemas",
  "Recursos Humanos",
] as const;

export type Area = (typeof AREAS_PREDEFINIDAS)[number];

// ============================================================================
// Usuario
// ============================================================================

export interface Usuario {
  id: string; // UUID
  email: string; // @proaktiva.com.mx
  nombre: string;
  apellido: string;
  area: Area;
  perfil: PerfilClave;
  numero_identificacion: string; // "LOG-0001"
  verificado: boolean;
  activo: boolean;
  nombre_en_sheets: string | null; // Solo para ejecutivos: "MARIA ISABEL SUAREZ CASTILLO"
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Sesión (lo que viaja en el JWT)
// ============================================================================

export interface SesionUsuario {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  perfil: PerfilClave;
  numero_identificacion: string;
  nombre_en_sheets: string | null;
}

// ============================================================================
// Solicitud de registro
// ============================================================================

export interface SolicitudRegistro {
  id: string;
  email: string;
  codigo_verificacion: string; // 6 dígitos
  password_hash: string;
  status: "pendiente" | "verificada" | "expirada";
  created_at: Date;
  expires_at: Date; // 24 horas después de creada
}

// ============================================================================
// Log de actividad
// ============================================================================

export type AccionLog =
  | "login"
  | "login_fallido"
  | "registro_solicitud"
  | "registro_verificado"
  | "consulta_disposiciones"
  | "consulta_disposicion"
  | "proyeccion"
  | "sincronizacion"
  | "admin_crear_usuario"
  | "admin_cambiar_perfil"
  | "admin_desactivar_usuario"
  | "admin_mapear_ejecutivo";

export interface EntradaLog {
  id_usuario: string | null; // null para login_fallido
  accion: AccionLog;
  detalle: Record<string, unknown>;
  ip_address: string | null;
  created_at: Date;
}
