import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/interfaces/jwt.interface";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // CONSULTAS
  // ════════════════════════════════════════════════════════════════

  /** Lista todos los usuarios (excluye soft-deleted) */
  async findAll() {
    const usuarios = await this.prisma.user.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        area: true,
        numero_identificacion: true,
        status: true,
        verificado: true,
        nombre_en_sheets: true,
        created_at: true,
        last_login_at: true,
        role: { select: { clave: true, nombre: true } },
      },
      orderBy: { created_at: "desc" },
    });

    return {
      total: usuarios.length,
      usuarios,
    };
  }

  /** Lista solo usuarios pendientes de aprobación (verificados pero no aprobados) */
  async findPending() {
    const pendientes = await this.prisma.user.findMany({
      where: {
        status: "pendiente",
        verificado: true,
        deleted_at: null,
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        area: true,
        numero_identificacion: true,
        created_at: true,
        role: { select: { clave: true, nombre: true } },
      },
      orderBy: { created_at: "asc" }, // Más antiguo primero
    });

    return {
      total: pendientes.length,
      pendientes,
    };
  }

  /** Lista usuarios pendientes que AÚN no han verificado su código */
  async findUnverified() {
    return this.prisma.user.findMany({
      where: {
        status: "pendiente",
        verificado: false,
        deleted_at: null,
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellido: true,
        numero_identificacion: true,
        codigo_verificacion: true,
        codigo_expira_at: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  /** Obtiene detalle completo de un usuario por ID */
  async findById(userId: string) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { select: { clave: true, nombre: true } },
        asignaciones_cartera: {
          where: { activo: true },
          select: {
            id: true,
            nombre_ejecutivo_sheets: true,
            motivo: true,
            created_at: true,
          },
        },
        permisos_extra: {
          include: {
            permission: { select: { clave: true, nombre: true } },
          },
        },
      },
    });

    if (!usuario || usuario.deleted_at) {
      throw new NotFoundException("Usuario no encontrado");
    }

    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      area: usuario.area,
      numero_identificacion: usuario.numero_identificacion,
      status: usuario.status,
      verificado: usuario.verificado,
      role: usuario.role,
      nombre_en_sheets: usuario.nombre_en_sheets,
      created_at: usuario.created_at,
      last_login_at: usuario.last_login_at,
      asignaciones_cartera: usuario.asignaciones_cartera,
      overrides_permisos: usuario.permisos_extra.map((up) => ({
        permiso: up.permission.clave,
        nombre: up.permission.nombre,
        granted: up.granted,
        motivo: up.motivo,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // APROBAR USUARIO
  // ════════════════════════════════════════════════════════════════

  /**
   * Aprueba un usuario pendiente y le asigna un rol.
   *
   * Pre-condiciones:
   *   - El usuario debe estar en status="pendiente"
   *   - El usuario debe estar verificado
   *   - El rol asignado debe existir
   *
   * Post-condiciones:
   *   - status → "aprobado"
   *   - Se asigna el rol indicado
   *   - Se registra en auditoría quién aprobó y cuándo
   */
  async approve(
    admin: AuthenticatedUser,
    userId: string,
    roleClave: string,
    motivo?: string,
    ip?: string,
  ) {
    const usuario = await this.getActiveUser(userId);

    // Validar estado
    if (usuario.status !== "pendiente") {
      throw new BadRequestException(
        `No se puede aprobar un usuario en estado "${usuario.status}". ` +
          `Solo se pueden aprobar usuarios pendientes.`,
      );
    }

    if (!usuario.verificado) {
      throw new BadRequestException(
        "El usuario aún no ha verificado su código de registro. " +
          "Debe verificar primero antes de poder ser aprobado.",
      );
    }

    // Obtener rol
    const role = await this.getRoleByClaveOrFail(roleClave);

    // No se puede aprobar como admin_maestro (solo el seed lo crea)
    if (roleClave === "admin_maestro") {
      throw new ForbiddenException(
        "No se puede asignar el rol de Administrador Maestro manualmente",
      );
    }

    // Actualizar
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: "aprobado", role_id: role.id },
      include: { role: { select: { clave: true, nombre: true } } },
    });

    // Auditoría
    await this.audit.registrarAccionAdmin(admin, userId, "usuario_aprobado", {
      email_afectado: usuario.email,
      rol_asignado: roleClave,
      motivo: motivo || "Sin motivo especificado",
    }, ip);

    this.logger.log(
      `${admin.email} aprobó a ${usuario.email} como ${roleClave}`,
    );

    return {
      mensaje: `Usuario ${usuario.email} aprobado como ${role.nombre}`,
      usuario: {
        id: updated.id,
        email: updated.email,
        nombre: updated.nombre,
        apellido: updated.apellido,
        status: updated.status,
        role: updated.role,
      },
    };
  }

  // ════════════════════════════════════════════════════════════════
  // RECHAZAR USUARIO
  // ════════════════════════════════════════════════════════════════

  /**
   * Rechaza una solicitud de registro.
   * El usuario queda en status="rechazado" y no puede hacer login.
   */
  async reject(
    admin: AuthenticatedUser,
    userId: string,
    motivo: string,
    ip?: string,
  ) {
    const usuario = await this.getActiveUser(userId);

    if (usuario.status !== "pendiente") {
      throw new BadRequestException(
        `Solo se pueden rechazar usuarios pendientes. Estado actual: "${usuario.status}"`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: "rechazado" },
    });

    await this.audit.registrarAccionAdmin(admin, userId, "usuario_rechazado", {
      email_afectado: usuario.email,
      motivo,
    }, ip);

    this.logger.log(`${admin.email} rechazó a ${usuario.email}: ${motivo}`);

    return {
      mensaje: `Solicitud de ${usuario.email} rechazada`,
      motivo,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // DESACTIVAR USUARIO
  // ════════════════════════════════════════════════════════════════

  /**
   * Desactiva un usuario que estaba aprobado.
   * Puede ser una baja temporal, cambio de área, etc.
   */
  async deactivate(
    admin: AuthenticatedUser,
    userId: string,
    motivo: string,
    ip?: string,
  ) {
    const usuario = await this.getActiveUser(userId);

    // No se puede desactivar al admin_maestro
    const userRole = await this.prisma.role.findUnique({
      where: { id: usuario.role_id },
    });
    if (userRole?.clave === "admin_maestro") {
      throw new ForbiddenException(
        "No se puede desactivar al Administrador Maestro",
      );
    }

    // No se puede desactivar a sí mismo
    if (userId === admin.id) {
      throw new ForbiddenException("No puedes desactivarte a ti mismo");
    }

    if (usuario.status === "desactivado") {
      throw new BadRequestException("El usuario ya está desactivado");
    }

    const statusAnterior = usuario.status;

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: "desactivado" },
    });

    await this.audit.registrarAccionAdmin(admin, userId, "usuario_desactivado", {
      email_afectado: usuario.email,
      status_anterior: statusAnterior,
      motivo,
    }, ip);

    this.logger.log(`${admin.email} desactivó a ${usuario.email}: ${motivo}`);

    return {
      mensaje: `Usuario ${usuario.email} desactivado`,
      motivo,
      status_anterior: statusAnterior,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // REACTIVAR USUARIO
  // ════════════════════════════════════════════════════════════════

  /**
   * Reactiva un usuario desactivado, rechazado o bloqueado.
   * Lo pone en status="aprobado" con el rol indicado.
   */
  async reactivate(
    admin: AuthenticatedUser,
    userId: string,
    roleClave: string,
    motivo?: string,
    ip?: string,
  ) {
    const usuario = await this.getActiveUser(userId);

    const estadosReactivables = ["desactivado", "rechazado", "bloqueado"];
    if (!estadosReactivables.includes(usuario.status)) {
      throw new BadRequestException(
        `Solo se pueden reactivar usuarios en estado: ${estadosReactivables.join(", ")}. ` +
          `Estado actual: "${usuario.status}"`,
      );
    }

    const role = await this.getRoleByClaveOrFail(roleClave);

    if (roleClave === "admin_maestro") {
      throw new ForbiddenException(
        "No se puede asignar el rol de Administrador Maestro manualmente",
      );
    }

    const statusAnterior = usuario.status;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: "aprobado",
        role_id: role.id,
        intentos_login_fallidos: 0,
        bloqueado_hasta: null,
      },
    });

    await this.audit.registrarAccionAdmin(admin, userId, "usuario_reactivado", {
      email_afectado: usuario.email,
      status_anterior: statusAnterior,
      rol_asignado: roleClave,
      motivo: motivo || "Sin motivo especificado",
    }, ip);

    this.logger.log(
      `${admin.email} reactivó a ${usuario.email} (${statusAnterior} → aprobado como ${roleClave})`,
    );

    return {
      mensaje: `Usuario ${usuario.email} reactivado como ${role.nombre}`,
      status_anterior: statusAnterior,
      role_nuevo: roleClave,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // CAMBIAR ROL
  // ════════════════════════════════════════════════════════════════

  /**
   * Cambia el rol de un usuario ya aprobado.
   */
  async changeRole(
    admin: AuthenticatedUser,
    userId: string,
    roleClave: string,
    motivo?: string,
    ip?: string,
  ) {
    const usuario = await this.getActiveUser(userId);

    if (usuario.status !== "aprobado") {
      throw new BadRequestException(
        "Solo se puede cambiar el rol de usuarios aprobados",
      );
    }

    const userRole = await this.prisma.role.findUnique({
      where: { id: usuario.role_id },
    });
    if (userRole?.clave === "admin_maestro") {
      throw new ForbiddenException(
        "No se puede cambiar el rol del Administrador Maestro",
      );
    }

    if (roleClave === "admin_maestro") {
      throw new ForbiddenException(
        "No se puede asignar el rol de Administrador Maestro manualmente",
      );
    }

    const roleNuevo = await this.getRoleByClaveOrFail(roleClave);
    const rolAnterior = userRole?.clave || "sin_rol";

    if (rolAnterior === roleClave) {
      throw new BadRequestException(
        `El usuario ya tiene el rol "${roleClave}"`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role_id: roleNuevo.id },
    });

    await this.audit.registrarAccionAdmin(admin, userId, "rol_asignado", {
      email_afectado: usuario.email,
      rol_anterior: rolAnterior,
      rol_nuevo: roleClave,
      motivo: motivo || "Sin motivo especificado",
    }, ip);

    this.logger.log(
      `${admin.email} cambió rol de ${usuario.email}: ${rolAnterior} → ${roleClave}`,
    );

    return {
      mensaje: `Rol de ${usuario.email} cambiado a ${roleNuevo.nombre}`,
      rol_anterior: rolAnterior,
      rol_nuevo: roleClave,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // MAPEO DE CARTERA (ejecutivos)
  // ════════════════════════════════════════════════════════════════

  /**
   * Asigna un nombre de ejecutivo en Sheets a un usuario.
   * Permite que el ejecutivo vea las disposiciones de esa cartera.
   * Un usuario puede tener múltiples asignaciones (cobertura, etc).
   */
  async mapPortfolio(
    admin: AuthenticatedUser,
    userId: string,
    nombreSheets: string,
    motivo?: string,
    ip?: string,
  ) {
    const usuario = await this.getActiveUser(userId);
    const nombreUpper = nombreSheets.toUpperCase().trim();

    // Actualizar campo directo en user
    await this.prisma.user.update({
      where: { id: userId },
      data: { nombre_en_sheets: nombreUpper },
    });

    // Crear registro en portfolio_assignments (histórico)
    await this.prisma.portfolioAssignment.create({
      data: {
        user_id: userId,
        nombre_ejecutivo_sheets: nombreUpper,
        asignado_por: admin.id,
        activo: true,
        motivo: motivo || "Titular",
      },
    });

    await this.audit.registrarAccionAdmin(admin, userId, "ejecutivo_mapeado", {
      email_afectado: usuario.email,
      nombre_en_sheets: nombreUpper,
      motivo,
    }, ip);

    await this.audit.registrarAccionAdmin(admin, userId, "cartera_asignada", {
      email_afectado: usuario.email,
      nombre_ejecutivo_sheets: nombreUpper,
      motivo: motivo || "Titular",
    }, ip);

    this.logger.log(
      `${admin.email} mapeó cartera de ${usuario.email} → "${nombreUpper}"`,
    );

    return {
      mensaje: `Cartera "${nombreUpper}" asignada a ${usuario.email}`,
      nombre_en_sheets: nombreUpper,
    };
  }

  /**
   * Revoca una asignación de cartera.
   */
  async revokePortfolio(
    admin: AuthenticatedUser,
    userId: string,
    assignmentId: string,
    ip?: string,
  ) {
    const assignment = await this.prisma.portfolioAssignment.findFirst({
      where: { id: assignmentId, user_id: userId, activo: true },
    });

    if (!assignment) {
      throw new NotFoundException("Asignación de cartera no encontrada");
    }

    await this.prisma.portfolioAssignment.update({
      where: { id: assignmentId },
      data: { activo: false, revocado_at: new Date() },
    });

    await this.audit.registrarAccionAdmin(admin, userId, "cartera_revocada", {
      nombre_en_sheets: assignment.nombre_ejecutivo_sheets,
      assignment_id: assignmentId,
    }, ip);

    return {
      mensaje: `Asignación de cartera "${assignment.nombre_ejecutivo_sheets}" revocada`,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // ACTUALIZACIÓN DE PERFIL (por el propio usuario)
  // ════════════════════════════════════════════════════════════════

  async updateProfile(
    user: AuthenticatedUser,
    data: { nombre?: string; apellido?: string; area?: string },
  ) {
    const updateData: any = {};
    if (data.nombre !== undefined) updateData.nombre = data.nombre.trim();
    if (data.apellido !== undefined) updateData.apellido = data.apellido.trim();
    if (data.area !== undefined) updateData.area = data.area.trim();

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException("No se enviaron datos para actualizar");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    await this.audit.registrar({
      user_id: user.id,
      accion: "perfil_actualizado",
      detalle: { campos: Object.keys(updateData) },
    });

    return { mensaje: "Perfil actualizado", campos: Object.keys(updateData) };
  }

  // ════════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ════════════════════════════════════════════════════════════════

  /** Obtiene un usuario no soft-deleted o lanza 404 */
  private async getActiveUser(userId: string) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!usuario || usuario.deleted_at) {
      throw new NotFoundException("Usuario no encontrado");
    }

    return usuario;
  }

  /** Obtiene un rol por clave o lanza 400 */
  private async getRoleByClaveOrFail(clave: string) {
    const role = await this.prisma.role.findUnique({
      where: { clave },
    });

    if (!role) {
      throw new BadRequestException(
        `Rol "${clave}" no encontrado. Roles válidos: admin, gerencia, cartera, ejecutivo, staff`,
      );
    }

    return role;
  }
}
