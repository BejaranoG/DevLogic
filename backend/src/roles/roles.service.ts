import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditEvent } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/interfaces/jwt.interface";

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // ROLES — CRUD
  // ════════════════════════════════════════════════════════════════

  /** Lista todos los roles con sus permisos asignados */
  async findAllRoles() {
    const roles = await this.prisma.role.findMany({
      include: {
        permisos: {
          include: {
            permission: {
              select: { clave: true, nombre: true, modulo: true },
            },
          },
        },
        _count: { select: { usuarios: true } },
      },
      orderBy: { created_at: "asc" },
    });

    return roles.map((r) => ({
      id: r.id,
      clave: r.clave,
      nombre: r.nombre,
      descripcion: r.descripcion,
      es_sistema: r.es_sistema,
      total_usuarios: r._count.usuarios,
      permisos: r.permisos.map((rp) => ({
        clave: rp.permission.clave,
        nombre: rp.permission.nombre,
        modulo: rp.permission.modulo,
      })),
    }));
  }

  /** Obtiene un rol por clave con sus permisos */
  async findRoleByClave(clave: string) {
    const role = await this.prisma.role.findUnique({
      where: { clave },
      include: {
        permisos: {
          include: {
            permission: {
              select: { clave: true, nombre: true, modulo: true, descripcion: true },
            },
          },
        },
        _count: { select: { usuarios: true } },
      },
    });

    if (!role) {
      throw new NotFoundException(`Rol "${clave}" no encontrado`);
    }

    return {
      id: role.id,
      clave: role.clave,
      nombre: role.nombre,
      descripcion: role.descripcion,
      es_sistema: role.es_sistema,
      total_usuarios: role._count.usuarios,
      permisos: role.permisos.map((rp) => ({
        clave: rp.permission.clave,
        nombre: rp.permission.nombre,
        modulo: rp.permission.modulo,
        descripcion: rp.permission.descripcion,
      })),
    };
  }

  /** Crea un nuevo rol (solo roles no-sistema) */
  async createRole(data: {
    clave: string;
    nombre: string;
    descripcion?: string;
  }) {
    const existente = await this.prisma.role.findUnique({
      where: { clave: data.clave },
    });
    if (existente) {
      throw new ConflictException(`Ya existe un rol con clave "${data.clave}"`);
    }

    const role = await this.prisma.role.create({
      data: {
        clave: data.clave,
        nombre: data.nombre,
        descripcion: data.descripcion,
        es_sistema: false,
      },
    });

    this.logger.log(`Rol creado: ${role.clave}`);
    return role;
  }

  /** Actualiza nombre/descripción de un rol */
  async updateRole(
    clave: string,
    data: { nombre?: string; descripcion?: string },
  ) {
    const role = await this.prisma.role.findUnique({ where: { clave } });
    if (!role) throw new NotFoundException(`Rol "${clave}" no encontrado`);

    return this.prisma.role.update({
      where: { clave },
      data,
    });
  }

  /** Elimina un rol (solo si no es de sistema y no tiene usuarios) */
  async deleteRole(clave: string) {
    const role = await this.prisma.role.findUnique({
      where: { clave },
      include: { _count: { select: { usuarios: true } } },
    });

    if (!role) throw new NotFoundException(`Rol "${clave}" no encontrado`);

    if (role.es_sistema) {
      throw new ForbiddenException(
        `El rol "${clave}" es de sistema y no puede eliminarse`,
      );
    }

    if (role._count.usuarios > 0) {
      throw new ConflictException(
        `El rol "${clave}" tiene ${role._count.usuarios} usuarios asignados. Reasígnalos antes de eliminar.`,
      );
    }

    // Eliminar permisos asociados y luego el rol
    await this.prisma.rolePermission.deleteMany({
      where: { role_id: role.id },
    });

    await this.prisma.role.delete({ where: { clave } });

    this.logger.log(`Rol eliminado: ${clave}`);
    return { mensaje: `Rol "${clave}" eliminado` };
  }

  // ════════════════════════════════════════════════════════════════
  // PERMISOS — Catálogo
  // ════════════════════════════════════════════════════════════════

  /** Lista todos los permisos disponibles, agrupados por módulo */
  async findAllPermissions() {
    const permisos = await this.prisma.permission.findMany({
      orderBy: [{ modulo: "asc" }, { clave: "asc" }],
    });

    // Agrupar por módulo
    const porModulo: Record<string, typeof permisos> = {};
    for (const p of permisos) {
      const mod = p.modulo;
      if (!porModulo[mod]) porModulo[mod] = [];
      porModulo[mod].push(p);
    }

    return {
      total: permisos.length,
      por_modulo: porModulo,
      listado: permisos.map((p) => ({
        clave: p.clave,
        nombre: p.nombre,
        modulo: p.modulo,
        descripcion: p.descripcion,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // ASIGNACIÓN DE PERMISOS A ROLES
  // ════════════════════════════════════════════════════════════════

  /** Agrega permisos a un rol */
  async assignPermissionsToRole(
    roleClave: string,
    permissionClaves: string[],
    admin: AuthenticatedUser,
  ) {
    const role = await this.prisma.role.findUnique({
      where: { clave: roleClave },
    });
    if (!role) throw new NotFoundException(`Rol "${roleClave}" no encontrado`);

    // Validar que todos los permisos existen
    const permisos = await this.prisma.permission.findMany({
      where: { clave: { in: permissionClaves } },
    });

    const encontrados = new Set(permisos.map((p) => p.clave));
    const noEncontrados = permissionClaves.filter((c) => !encontrados.has(c));
    if (noEncontrados.length > 0) {
      throw new BadRequestException(
        `Permisos no encontrados: ${noEncontrados.join(", ")}`,
      );
    }

    // Crear asignaciones (ignorar duplicados con upsert)
    let asignados = 0;
    for (const perm of permisos) {
      await this.prisma.rolePermission.upsert({
        where: {
          role_id_permission_id: {
            role_id: role.id,
            permission_id: perm.id,
          },
        },
        update: {},
        create: {
          role_id: role.id,
          permission_id: perm.id,
          asignado_por: admin.id,
        },
      });
      asignados++;
    }

    // Auditoría
    await this.audit(admin.id, "permiso_otorgado", {
      tipo: "rol",
      rol: roleClave,
      permisos: permissionClaves,
    });

    this.logger.log(
      `${admin.email} asignó ${asignados} permisos a rol ${roleClave}`,
    );

    return {
      mensaje: `${asignados} permisos asignados a rol "${roleClave}"`,
      rol: roleClave,
      permisos_asignados: permissionClaves,
    };
  }

  /** Revoca permisos de un rol */
  async revokePermissionsFromRole(
    roleClave: string,
    permissionClaves: string[],
    admin: AuthenticatedUser,
  ) {
    const role = await this.prisma.role.findUnique({
      where: { clave: roleClave },
    });
    if (!role) throw new NotFoundException(`Rol "${roleClave}" no encontrado`);

    const permisos = await this.prisma.permission.findMany({
      where: { clave: { in: permissionClaves } },
    });

    let revocados = 0;
    for (const perm of permisos) {
      const result = await this.prisma.rolePermission.deleteMany({
        where: { role_id: role.id, permission_id: perm.id },
      });
      revocados += result.count;
    }

    await this.audit(admin.id, "permiso_revocado", {
      tipo: "rol",
      rol: roleClave,
      permisos: permissionClaves,
    });

    this.logger.log(
      `${admin.email} revocó ${revocados} permisos de rol ${roleClave}`,
    );

    return {
      mensaje: `${revocados} permisos revocados de rol "${roleClave}"`,
      rol: roleClave,
      permisos_revocados: permissionClaves,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // OVERRIDE DE PERMISOS POR USUARIO
  // ════════════════════════════════════════════════════════════════

  /**
   * Asigna o revoca un permiso a nivel de usuario individual.
   * granted=true  → otorga el permiso aunque el rol no lo tenga
   * granted=false → revoca el permiso aunque el rol sí lo tenga
   */
  async setUserPermissionOverride(
    userId: string,
    permissionClave: string,
    granted: boolean,
    admin: AuthenticatedUser,
    motivo?: string,
  ) {
    // Validar usuario
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!usuario) throw new NotFoundException("Usuario no encontrado");

    // No se puede poner override al admin_maestro
    if (usuario.role.clave === "admin_maestro") {
      throw new ForbiddenException(
        "No se pueden asignar overrides al Administrador Maestro (ya tiene acceso total)",
      );
    }

    // Validar permiso
    const permiso = await this.prisma.permission.findUnique({
      where: { clave: permissionClave },
    });
    if (!permiso) {
      throw new BadRequestException(
        `Permiso "${permissionClave}" no encontrado`,
      );
    }

    // Upsert: crear o actualizar el override
    const override = await this.prisma.userPermission.upsert({
      where: {
        user_id_permission_id: {
          user_id: userId,
          permission_id: permiso.id,
        },
      },
      update: { granted, motivo, asignado_por: admin.id },
      create: {
        user_id: userId,
        permission_id: permiso.id,
        granted,
        asignado_por: admin.id,
        motivo,
      },
    });

    const accion = granted ? "permiso_otorgado" : "permiso_revocado";
    await this.audit(admin.id, accion, {
      tipo: "usuario",
      usuario_afectado: userId,
      email_afectado: usuario.email,
      permiso: permissionClave,
      granted,
      motivo,
    });

    const verbo = granted ? "otorgado" : "revocado";
    this.logger.log(
      `${admin.email} ${verbo} permiso "${permissionClave}" a ${usuario.email}`,
    );

    return {
      mensaje: `Permiso "${permissionClave}" ${verbo} para ${usuario.email}`,
      override: {
        user_id: userId,
        permission: permissionClave,
        granted,
        motivo,
      },
    };
  }

  /** Elimina un override de usuario (vuelve a heredar del rol) */
  async removeUserPermissionOverride(
    userId: string,
    permissionClave: string,
    admin: AuthenticatedUser,
  ) {
    const permiso = await this.prisma.permission.findUnique({
      where: { clave: permissionClave },
    });
    if (!permiso) {
      throw new BadRequestException(
        `Permiso "${permissionClave}" no encontrado`,
      );
    }

    const result = await this.prisma.userPermission.deleteMany({
      where: { user_id: userId, permission_id: permiso.id },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        `No existe override de "${permissionClave}" para este usuario`,
      );
    }

    await this.audit(admin.id, "permiso_revocado", {
      tipo: "usuario_override_eliminado",
      usuario_afectado: userId,
      permiso: permissionClave,
    });

    return {
      mensaje: `Override de "${permissionClave}" eliminado. El usuario hereda del rol.`,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // PERMISOS EFECTIVOS DE UN USUARIO
  // ════════════════════════════════════════════════════════════════

  /**
   * Calcula los permisos efectivos de un usuario:
   *   base = permisos del rol
   *   + user_permissions granted=true
   *   - user_permissions granted=false
   *   admin_maestro = todos los permisos
   */
  async getEffectivePermissions(userId: string) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!usuario) throw new NotFoundException("Usuario no encontrado");

    // admin_maestro → todos los permisos
    if (usuario.role.clave === "admin_maestro") {
      const todos = await this.prisma.permission.findMany({
        select: { clave: true, nombre: true, modulo: true },
      });
      return {
        usuario: { email: usuario.email, role: usuario.role.clave },
        nota: "admin_maestro tiene acceso total",
        permisos_efectivos: todos.map((p) => p.clave),
        detalle: todos.map((p) => ({
          clave: p.clave,
          nombre: p.nombre,
          modulo: p.modulo,
          origen: "admin_maestro_bypass" as const,
        })),
      };
    }

    // Permisos del rol
    const rolPerms = await this.prisma.rolePermission.findMany({
      where: { role_id: usuario.role_id },
      include: {
        permission: { select: { clave: true, nombre: true, modulo: true } },
      },
    });

    // Overrides del usuario
    const userOverrides = await this.prisma.userPermission.findMany({
      where: { user_id: userId },
      include: {
        permission: { select: { clave: true, nombre: true, modulo: true } },
      },
    });

    // Construir mapa de permisos con origen
    type PermDetalle = {
      clave: string;
      nombre: string;
      modulo: string;
      origen: "rol" | "override_otorgado" | "override_revocado";
    };

    const mapa = new Map<string, PermDetalle>();

    // 1. Agregar permisos del rol
    for (const rp of rolPerms) {
      mapa.set(rp.permission.clave, {
        clave: rp.permission.clave,
        nombre: rp.permission.nombre,
        modulo: rp.permission.modulo,
        origen: "rol",
      });
    }

    // 2. Aplicar overrides
    const revocados: PermDetalle[] = [];
    for (const up of userOverrides) {
      if (up.granted) {
        mapa.set(up.permission.clave, {
          clave: up.permission.clave,
          nombre: up.permission.nombre,
          modulo: up.permission.modulo,
          origen: "override_otorgado",
        });
      } else {
        // Revocar: quitar del mapa y registrar
        mapa.delete(up.permission.clave);
        revocados.push({
          clave: up.permission.clave,
          nombre: up.permission.nombre,
          modulo: up.permission.modulo,
          origen: "override_revocado",
        });
      }
    }

    const detalle = Array.from(mapa.values());

    return {
      usuario: {
        email: usuario.email,
        role: usuario.role.clave,
        role_nombre: usuario.role.nombre,
      },
      permisos_efectivos: detalle.map((d) => d.clave),
      total: detalle.length,
      detalle,
      revocados_por_override: revocados,
      overrides_activos: userOverrides.map((up) => ({
        permiso: up.permission.clave,
        granted: up.granted,
        motivo: up.motivo,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════

  private async audit(
    userId: string | null,
    accion: AuditEvent,
    detalle: Record<string, unknown>,
  ) {
    await this.auditService.registrar({
      user_id: userId,
      accion,
      detalle,
    });
  }
}
