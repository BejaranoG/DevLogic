import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Request } from "express";
import { UsersService } from "./users.service";
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from "../common/guards";
import { CurrentUser, Roles, RequirePermissions } from "../common/decorators";
import type { AuthenticatedUser } from "../auth/interfaces/jwt.interface";
import {
  ApproveUserDto,
  RejectUserDto,
  DeactivateUserDto,
  ReactivateUserDto,
  ChangeRoleDto,
  MapPortfolioDto,
  UpdateProfileDto,
} from "./dto";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ════════════════════════════════════════════════════════════════
  // CONSULTAS
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/users
   * Lista todos los usuarios activos.
   * Acceso: admin_maestro, admin
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles("admin_maestro", "admin")
  findAll() {
    return this.usersService.findAll();
  }

  /**
   * GET /api/users/pending
   * Lista usuarios verificados pendientes de aprobación.
   * Acceso: admin_maestro, admin
   */
  @Get("pending")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro", "admin")
  findPending() {
    return this.usersService.findPending();
  }

  /**
   * GET /api/users/unverified
   * Lista usuarios que aún no verifican su código.
   * Muestra el código para que el admin se lo comparta.
   * Acceso: admin_maestro
   */
  @Get("unverified")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro")
  findUnverified() {
    return this.usersService.findUnverified();
  }

  /**
   * GET /api/users/:id
   * Detalle completo de un usuario.
   * Acceso: admin_maestro, admin
   */
  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro", "admin")
  findOne(@Param("id") id: string) {
    return this.usersService.findById(id);
  }

  // ════════════════════════════════════════════════════════════════
  // FLUJO DE APROBACIÓN
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /api/users/:id/approve
   * Aprueba un usuario pendiente y le asigna rol.
   *
   * Body: { role_clave: "ejecutivo", motivo?: "Nuevo ejecutivo de Culiacán" }
   *
   * Acceso: admin_maestro, admin (requiere permiso 'aprobar_usuarios')
   */
  @Post(":id/approve")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("aprobar_usuarios")
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ApproveUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.approve(
      admin,
      id,
      dto.role_clave,
      dto.motivo,
      req.ip,
    );
  }

  /**
   * POST /api/users/:id/reject
   * Rechaza una solicitud de registro.
   *
   * Body: { motivo: "No pertenece a la organización" }
   *
   * Acceso: admin_maestro, admin (requiere permiso 'aprobar_usuarios')
   */
  @Post(":id/reject")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("aprobar_usuarios")
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: RejectUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.reject(admin, id, dto.motivo, req.ip);
  }

  // ════════════════════════════════════════════════════════════════
  // CAMBIO DE ESTADO
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /api/users/:id/deactivate
   * Desactiva un usuario aprobado.
   *
   * Body: { motivo: "Baja temporal por incapacidad" }
   *
   * Acceso: admin_maestro, admin
   */
  @Post(":id/deactivate")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("admin_usuarios")
  @HttpCode(HttpStatus.OK)
  deactivate(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: DeactivateUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.deactivate(admin, id, dto.motivo, req.ip);
  }

  /**
   * POST /api/users/:id/reactivate
   * Reactiva un usuario desactivado, rechazado o bloqueado.
   *
   * Body: { role_clave: "ejecutivo", motivo?: "Regresó de incapacidad" }
   *
   * Acceso: admin_maestro, admin
   */
  @Post(":id/reactivate")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("admin_usuarios")
  @HttpCode(HttpStatus.OK)
  reactivate(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ReactivateUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.reactivate(
      admin,
      id,
      dto.role_clave,
      dto.motivo,
      req.ip,
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ASIGNACIÓN DE ROL
  // ════════════════════════════════════════════════════════════════

  /**
   * PATCH /api/users/:id/role
   * Cambia el rol de un usuario aprobado.
   *
   * Body: { role_clave: "gerencia", motivo?: "Ascenso" }
   *
   * Acceso: admin_maestro, admin (requiere permiso 'asignar_roles')
   */
  @Patch(":id/role")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("asignar_roles")
  changeRole(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: Request,
  ) {
    return this.usersService.changeRole(
      admin,
      id,
      dto.role_clave,
      dto.motivo,
      req.ip,
    );
  }

  // ════════════════════════════════════════════════════════════════
  // MAPEO DE CARTERA
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /api/users/:id/portfolio
   * Asigna cartera (nombre en Sheets) a un usuario.
   *
   * Body: { nombre_ejecutivo_sheets: "JUAN PEREZ LOPEZ", motivo?: "Titular" }
   *
   * Acceso: admin_maestro, admin (requiere permiso 'asignar_cartera')
   */
  @Post(":id/portfolio")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("asignar_cartera")
  mapPortfolio(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: MapPortfolioDto,
    @Req() req: Request,
  ) {
    return this.usersService.mapPortfolio(
      admin,
      id,
      dto.nombre_ejecutivo_sheets,
      dto.motivo,
      req.ip,
    );
  }

  /**
   * DELETE /api/users/:id/portfolio/:assignmentId
   * Revoca una asignación de cartera.
   *
   * Acceso: admin_maestro, admin (requiere permiso 'asignar_cartera')
   */
  @Delete(":id/portfolio/:assignmentId")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("asignar_cartera")
  revokePortfolio(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id") id: string,
    @Param("assignmentId") assignmentId: string,
    @Req() req: Request,
  ) {
    return this.usersService.revokePortfolio(admin, id, assignmentId, req.ip);
  }

  // ════════════════════════════════════════════════════════════════
  // PERFIL PROPIO
  // ════════════════════════════════════════════════════════════════

  /**
   * PATCH /api/users/profile
   * Actualiza el perfil del propio usuario (nombre, apellido, área).
   *
   * Body: { nombre?: "Juan", apellido?: "Pérez", area?: "Crédito" }
   *
   * Acceso: cualquier autenticado
   */
  @Patch("profile")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user, dto);
  }
}
