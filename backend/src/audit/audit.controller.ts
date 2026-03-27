import { Controller, Get, Param, Query, UseGuards, HttpCode, HttpStatus } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from "../common/guards";
import { Roles, RequirePermissions, CurrentUser } from "../common/decorators";
import type { AuthenticatedUser } from "../auth/interfaces/jwt.interface";

@Controller("audit")
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /api/audit
   * Consulta logs con filtros.
   * Query: ?user_id=&target_user_id=&accion=&email=&desde=&hasta=&limit=&offset=
   */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions("ver_log")
  consultar(
    @Query("user_id") user_id?: string,
    @Query("target_user_id") target_user_id?: string,
    @Query("accion") accion?: string,
    @Query("email") email?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @CurrentUser() admin?: AuthenticatedUser,
  ) {
    // Registrar que alguien consultó el log
    if (admin) {
      this.auditService.registrarDesdeUsuario(admin, "consulta_audit_log", {
        filtros: { user_id, target_user_id, accion, email, desde, hasta },
      });
    }

    return this.auditService.consultar({
      user_id, target_user_id, accion, email, desde, hasta,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  /**
   * GET /api/audit/dashboard
   * Estadísticas para el panel admin.
   * Query: ?dias=7 (default 7)
   */
  @Get("dashboard")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("ver_log")
  dashboard(@Query("dias") dias?: string) {
    return this.auditService.dashboard(dias ? parseInt(dias) : 7);
  }

  /**
   * GET /api/audit/recent
   * Actividad reciente global.
   * Query: ?limit=20
   */
  @Get("recent")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("ver_log")
  recent(@Query("limit") limit?: string) {
    return this.auditService.actividadReciente(limit ? parseInt(limit) : 20);
  }

  /**
   * GET /api/audit/user/:userId/timeline
   * Timeline unificado de un usuario (hizo + le hicieron).
   */
  @Get("user/:userId/timeline")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("ver_log")
  timeline(@Param("userId") userId: string, @Query("limit") limit?: string) {
    return this.auditService.timelineDeUsuario(userId, limit ? parseInt(limit) : 100);
  }

  /**
   * GET /api/audit/logins
   * Logins (exitosos y fallidos) con filtros de fecha.
   */
  @Get("logins")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("ver_log")
  logins(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("limit") limit?: string,
  ) {
    return this.auditService.consultar({
      acciones: ["login", "login_fallido"],
      desde, hasta, limit: limit ? parseInt(limit) : 50,
    });
  }

  /**
   * GET /api/audit/admin-actions
   * Solo acciones administrativas (aprobaciones, rechazos, cambios de rol, etc).
   */
  @Get("admin-actions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("ver_log")
  adminActions(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("limit") limit?: string,
  ) {
    return this.auditService.consultar({
      acciones: [
        "usuario_aprobado", "usuario_rechazado", "usuario_desactivado",
        "usuario_bloqueado", "usuario_reactivado", "rol_asignado",
        "permiso_otorgado", "permiso_revocado", "ejecutivo_mapeado",
        "cartera_asignada", "cartera_revocada",
      ],
      desde, hasta, limit: limit ? parseInt(limit) : 50,
    });
  }

  /**
   * GET /api/audit/me
   * Mi propio timeline (cualquier autenticado puede ver su historial).
   */
  @Get("me")
  myTimeline(@CurrentUser() user: AuthenticatedUser, @Query("limit") limit?: string) {
    return this.auditService.timelineDeUsuario(user.id, limit ? parseInt(limit) : 50);
  }
}
