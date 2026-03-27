import { Controller, Get, UseGuards, ForbiddenException } from "@nestjs/common";
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from "../common/guards";
import { CurrentUser, Roles, RequirePermissions } from "../common/decorators";
import type { AuthenticatedUser } from "../auth/interfaces/jwt.interface";

/**
 * Controlador de demostración.
 * Muestra los 4 niveles de protección disponibles y cómo usarlos.
 *
 * Nivel 0: Público (sin guard)
 * Nivel 1: Solo autenticado (JwtAuthGuard)
 * Nivel 2: Por rol (JwtAuthGuard + RolesGuard + @Roles)
 * Nivel 3: Por permiso granular (JwtAuthGuard + PermissionsGuard + @RequirePermissions)
 *
 * Nota: En producción, este controlador se reemplaza por los controladores
 * reales de cartera, proyección, sync, etc.
 */
@Controller("examples")
export class ExamplesController {
  // ════════════════════════════════════════════════════════════════
  // NIVEL 0 — Público
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/examples/public
   * Sin guards. Cualquiera puede acceder.
   */
  @Get("public")
  publicEndpoint() {
    return {
      nivel: 0,
      proteccion: "ninguna",
      mensaje: "Este endpoint es público",
    };
  }

  // ════════════════════════════════════════════════════════════════
  // NIVEL 1 — Solo autenticado
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/examples/authenticated
   * Solo requiere un JWT válido. Cualquier usuario aprobado.
   */
  @Get("authenticated")
  @UseGuards(JwtAuthGuard)
  authenticatedEndpoint(@CurrentUser() user: AuthenticatedUser) {
    return {
      nivel: 1,
      proteccion: "JwtAuthGuard",
      mensaje: `Hola ${user.nombre}, estás autenticado como ${user.role_clave}`,
      usuario: {
        id: user.id,
        email: user.email,
        role: user.role_clave,
      },
    };
  }

  // ════════════════════════════════════════════════════════════════
  // NIVEL 2 — Por rol
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/examples/admin-only
   * Solo admin_maestro y admin pueden acceder.
   *
   * Patrón: @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(...)
   */
  @Get("admin-only")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin_maestro", "admin")
  adminOnly(@CurrentUser() user: AuthenticatedUser) {
    return {
      nivel: 2,
      proteccion: "RolesGuard + @Roles('admin_maestro', 'admin')",
      mensaje: `Acceso de admin concedido a ${user.email}`,
      tu_rol: user.role_clave,
    };
  }

  /**
   * GET /api/examples/gerencia-up
   * Gerencia, admin y admin_maestro.
   */
  @Get("gerencia-up")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin_maestro", "admin", "gerencia")
  gerenciaUp(@CurrentUser() user: AuthenticatedUser) {
    return {
      nivel: 2,
      proteccion: "RolesGuard",
      mensaje: `Acceso de gerencia+ concedido a ${user.email}`,
      tu_rol: user.role_clave,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // NIVEL 3 — Por permiso granular
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/examples/ver-cartera
   * Requiere el permiso "ver_todos_creditos".
   * Lo tienen: admin_maestro (bypass), admin, gerencia, staff (por rol).
   * Ejecutivo NO lo tiene (tiene "ver_cartera_propia").
   *
   * Patrón: @UseGuards(JwtAuthGuard, PermissionsGuard) + @RequirePermissions(...)
   */
  @Get("ver-cartera")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("ver_todos_creditos")
  verCartera(@CurrentUser() user: AuthenticatedUser) {
    return {
      nivel: 3,
      proteccion: "PermissionsGuard + @RequirePermissions('ver_todos_creditos')",
      mensaje: `${user.email} puede ver toda la cartera`,
      nota: "admin_maestro bypasea esta verificación automáticamente",
    };
  }

  /**
   * GET /api/examples/exportar
   * Requiere permiso "exportar".
   * Lo tienen por rol: admin_maestro, admin, gerencia, staff.
   * Ejecutivo NO lo tiene por rol, pero un admin podría otorgárselo vía override.
   */
  @Get("exportar")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("exportar")
  exportar(@CurrentUser() user: AuthenticatedUser) {
    return {
      nivel: 3,
      proteccion: "PermissionsGuard + @RequirePermissions('exportar')",
      mensaje: `${user.email} puede exportar`,
    };
  }

  /**
   * GET /api/examples/sync
   * Requiere permiso "sincronizar".
   * Solo admin_maestro y admin lo tienen.
   */
  @Get("sync")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("sincronizar")
  sync(@CurrentUser() user: AuthenticatedUser) {
    return {
      nivel: 3,
      proteccion: "PermissionsGuard + @RequirePermissions('sincronizar')",
      mensaje: `${user.email} puede sincronizar con Google Sheets`,
    };
  }

  /**
   * GET /api/examples/multi-permiso
   * Requiere MÚLTIPLES permisos (AND): admin_usuarios Y ver_log.
   * Solo roles que tengan ambos: admin_maestro, admin.
   */
  @Get("multi-permiso")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("admin_usuarios", "ver_log")
  multiPermiso(@CurrentUser() user: AuthenticatedUser) {
    return {
      nivel: 3,
      proteccion: "PermissionsGuard + @RequirePermissions('admin_usuarios', 'ver_log')",
      mensaje: `${user.email} tiene ambos permisos`,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // PATRÓN: FILTRO DE CARTERA PARA EJECUTIVO
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/examples/mi-cartera
   * Todos los autenticados pueden acceder, pero el contenido
   * se filtra según el perfil:
   *
   * - admin_maestro/admin/gerencia/staff → ven todo
   * - ejecutivo → solo ve su cartera asignada (nombre_en_sheets)
   *
   * Este patrón NO usa @Roles ni @RequirePermissions.
   * El filtro ocurre en la lógica de negocio, no en el guard.
   */
  @Get("mi-cartera")
  @UseGuards(JwtAuthGuard)
  miCartera(@CurrentUser() user: AuthenticatedUser) {
    // Simular disposiciones
    const todasDisposiciones = [
      { folio: "D001", ejecutivo: "JUAN PEREZ", saldo: 500000 },
      { folio: "D002", ejecutivo: "MARIA LOPEZ", saldo: 300000 },
      { folio: "D003", ejecutivo: "JUAN PEREZ", saldo: 700000 },
      { folio: "D004", ejecutivo: "ANA GARCIA", saldo: 150000 },
    ];

    // Ejecutivo → filtrar por nombre_en_sheets
    if (user.role_clave === "ejecutivo") {
      if (!user.nombre_en_sheets) {
        throw new ForbiddenException(
          "Tu cuenta de ejecutivo no tiene cartera asignada (nombre_en_sheets vacío). " +
            "Contacta al administrador.",
        );
      }

      const miCartera = todasDisposiciones.filter(
        (d) =>
          d.ejecutivo.toUpperCase() ===
          user.nombre_en_sheets!.toUpperCase(),
      );

      return {
        patron: "filtro_ejecutivo",
        usuario: user.email,
        role: user.role_clave,
        nombre_en_sheets: user.nombre_en_sheets,
        total_visible: miCartera.length,
        disposiciones: miCartera,
        nota: "Solo ves disposiciones donde EJECUTIVO LÍNEA = tu nombre_en_sheets",
      };
    }

    // Todos los demás ven todo
    return {
      patron: "acceso_total",
      usuario: user.email,
      role: user.role_clave,
      total_visible: todasDisposiciones.length,
      disposiciones: todasDisposiciones,
    };
  }
}
