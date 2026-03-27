import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { RolesService } from "./roles.service";
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from "../common/guards";
import { CurrentUser, Roles, RequirePermissions } from "../common/decorators";
import type { AuthenticatedUser } from "../auth/interfaces/jwt.interface";
import {
  CreateRoleDto,
  UpdateRoleDto,
  AssignPermissionsToRoleDto,
  RevokePermissionsFromRoleDto,
  UserPermissionOverrideDto,
  RemoveUserPermissionDto,
} from "./dto";

@Controller("roles")
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // ════════════════════════════════════════════════════════════════
  // ROLES CRUD
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/roles
   * Lista todos los roles con sus permisos y conteo de usuarios.
   * Acceso: admin_maestro, admin
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles("admin_maestro", "admin")
  findAll() {
    return this.rolesService.findAllRoles();
  }

  /**
   * GET /api/roles/:clave
   * Detalle de un rol por clave.
   * Acceso: admin_maestro, admin
   */
  @Get(":clave")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro", "admin")
  findOne(@Param("clave") clave: string) {
    return this.rolesService.findRoleByClave(clave);
  }

  /**
   * POST /api/roles
   * Crea un nuevo rol.
   * Acceso: solo admin_maestro
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles("admin_maestro")
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  /**
   * PATCH /api/roles/:clave
   * Actualiza nombre/descripción de un rol.
   * Acceso: solo admin_maestro
   */
  @Patch(":clave")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro")
  update(@Param("clave") clave: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(clave, dto);
  }

  /**
   * DELETE /api/roles/:clave
   * Elimina un rol (solo si no es de sistema y no tiene usuarios).
   * Acceso: solo admin_maestro
   */
  @Delete(":clave")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro")
  remove(@Param("clave") clave: string) {
    return this.rolesService.deleteRole(clave);
  }

  // ════════════════════════════════════════════════════════════════
  // PERMISOS — Catálogo
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/roles/permissions/catalog
   * Lista todos los permisos disponibles agrupados por módulo.
   * Acceso: admin_maestro, admin
   */
  @Get("permissions/catalog")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro", "admin")
  permissionsCatalog() {
    return this.rolesService.findAllPermissions();
  }

  // ════════════════════════════════════════════════════════════════
  // ASIGNACIÓN DE PERMISOS A ROLES
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /api/roles/:clave/permissions
   * Asigna permisos a un rol.
   * Body: { permission_claves: ["ver_todos_creditos", "proyectar"] }
   * Acceso: admin_maestro, admin (requiere permiso 'asignar_roles')
   */
  @Post(":clave/permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("asignar_roles")
  assignPermissions(
    @Param("clave") clave: string,
    @Body() dto: AssignPermissionsToRoleDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.rolesService.assignPermissionsToRole(
      clave,
      dto.permission_claves,
      admin,
    );
  }

  /**
   * DELETE /api/roles/:clave/permissions
   * Revoca permisos de un rol.
   * Body: { permission_claves: ["sincronizar"] }
   * Acceso: admin_maestro, admin (requiere permiso 'asignar_roles')
   */
  @Delete(":clave/permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("asignar_roles")
  revokePermissions(
    @Param("clave") clave: string,
    @Body() dto: RevokePermissionsFromRoleDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.rolesService.revokePermissionsFromRole(
      clave,
      dto.permission_claves,
      admin,
    );
  }

  // ════════════════════════════════════════════════════════════════
  // OVERRIDE DE PERMISOS POR USUARIO
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /api/roles/users/:userId/permissions
   * Asigna o revoca un permiso a nivel individual.
   * Body: { permission_clave: "exportar", granted: true, motivo: "Necesita reportes" }
   * Acceso: admin_maestro, admin
   */
  @Post("users/:userId/permissions")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro", "admin")
  setUserOverride(
    @Param("userId") userId: string,
    @Body() dto: UserPermissionOverrideDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.rolesService.setUserPermissionOverride(
      userId,
      dto.permission_clave,
      dto.granted,
      admin,
      dto.motivo,
    );
  }

  /**
   * DELETE /api/roles/users/:userId/permissions
   * Elimina un override (el usuario vuelve a heredar del rol).
   * Body: { permission_clave: "exportar" }
   * Acceso: admin_maestro, admin
   */
  @Delete("users/:userId/permissions")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro", "admin")
  removeUserOverride(
    @Param("userId") userId: string,
    @Body() dto: RemoveUserPermissionDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.rolesService.removeUserPermissionOverride(
      userId,
      dto.permission_clave,
      admin,
    );
  }

  // ════════════════════════════════════════════════════════════════
  // PERMISOS EFECTIVOS
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/roles/users/:userId/effective-permissions
   * Retorna los permisos efectivos de un usuario (rol + overrides).
   * Acceso: admin_maestro, admin
   */
  @Get("users/:userId/effective-permissions")
  @UseGuards(RolesGuard)
  @Roles("admin_maestro", "admin")
  effectivePermissions(@Param("userId") userId: string) {
    return this.rolesService.getEffectivePermissions(userId);
  }

  /**
   * GET /api/roles/me/permissions
   * El usuario autenticado consulta sus propios permisos efectivos.
   * Acceso: cualquier autenticado
   */
  @Get("me/permissions")
  myPermissions(@CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.getEffectivePermissions(user.id);
  }
}
