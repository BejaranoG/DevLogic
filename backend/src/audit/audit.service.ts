import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/interfaces/jwt.interface";

// ═══════════════════════════════════════════════════════
// TIPOS DE EVENTO (mirror del enum AuditAction en schema)
// ═══════════════════════════════════════════════════════

export type AuditEvent =
  | "login" | "login_fallido" | "logout"
  | "registro_solicitud" | "registro_verificado" | "password_cambiado"
  | "usuario_aprobado" | "usuario_rechazado" | "usuario_desactivado"
  | "usuario_bloqueado" | "usuario_reactivado" | "perfil_actualizado"
  | "rol_asignado" | "permiso_otorgado" | "permiso_revocado"
  | "cartera_asignada" | "cartera_revocada" | "ejecutivo_mapeado"
  | "sincronizacion" | "proyeccion_individual" | "proyeccion_masiva" | "exportacion"
  | "consulta_disposiciones" | "consulta_disposicion" | "consulta_audit_log" | "consulta_usuarios";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ════════════════════════════════════════════════════════
  // REGISTRO DE EVENTOS
  // ════════════════════════════════════════════════════════

  /** Registro base. NUNCA lanza excepciones. */
  async registrar(data: {
    user_id?: string | null;
    target_user_id?: string | null;
    accion: AuditEvent;
    detalle?: Record<string, unknown>;
    ip_address?: string | null;
    user_agent?: string | null;
    endpoint?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          user_id: data.user_id ?? null,
          target_user_id: data.target_user_id ?? null,
          accion: data.accion as any,
          detalle: (data.detalle ?? {}) as any,
          ip_address: data.ip_address ?? null,
          user_agent: data.user_agent ?? null,
          endpoint: data.endpoint ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Audit error [${data.accion}]: ${err}`);
    }
  }

  /** Evento de usuario autenticado (login, proyección, etc). */
  async registrarDesdeUsuario(
    user: AuthenticatedUser, accion: AuditEvent,
    detalle: Record<string, unknown>,
    ip?: string | null, userAgent?: string | null,
  ): Promise<void> {
    await this.registrar({
      user_id: user.id, accion,
      detalle: { ...detalle, actor_email: user.email, actor_role: user.role_clave },
      ip_address: ip, user_agent: userAgent,
    });
  }

  /** Acción de admin SOBRE otro usuario. Registra ambas FK. */
  async registrarAccionAdmin(
    admin: AuthenticatedUser, targetUserId: string,
    accion: AuditEvent, detalle: Record<string, unknown>,
    ip?: string | null,
  ): Promise<void> {
    await this.registrar({
      user_id: admin.id, target_user_id: targetUserId, accion,
      detalle: { ...detalle, admin_email: admin.email, admin_role: admin.role_clave },
      ip_address: ip,
    });
  }

  /** Evento sin usuario autenticado (login_fallido, registro). */
  async registrarAnonimo(
    accion: AuditEvent, detalle: Record<string, unknown>,
    ip?: string | null, userAgent?: string | null,
  ): Promise<void> {
    await this.registrar({ accion, detalle, ip_address: ip, user_agent: userAgent });
  }

  // ════════════════════════════════════════════════════════
  // CONSULTAS
  // ════════════════════════════════════════════════════════

  /** Consulta general con filtros combinables. */
  async consultar(filtros: {
    user_id?: string; target_user_id?: string;
    accion?: string; acciones?: string[];
    email?: string; desde?: string; hasta?: string;
    limit?: number; offset?: number;
  }) {
    const where: any = {};
    if (filtros.user_id) where.user_id = filtros.user_id;
    if (filtros.target_user_id) where.target_user_id = filtros.target_user_id;
    if (filtros.accion) where.accion = filtros.accion;
    if (filtros.acciones?.length) where.accion = { in: filtros.acciones };
    if (filtros.email) {
      where.OR = [
        { user: { email: { contains: filtros.email, mode: "insensitive" } } },
        { target_user: { email: { contains: filtros.email, mode: "insensitive" } } },
      ];
    }
    if (filtros.desde || filtros.hasta) {
      where.created_at = {};
      if (filtros.desde) where.created_at.gte = new Date(filtros.desde);
      if (filtros.hasta) where.created_at.lte = new Date(filtros.hasta);
    }

    const take = Math.min(filtros.limit || 50, 200);
    const skip = filtros.offset || 0;
    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where, orderBy: { created_at: "desc" }, take, skip,
        include: {
          user: { select: { email: true, nombre: true, apellido: true, numero_identificacion: true } },
          target_user: { select: { email: true, nombre: true, apellido: true, numero_identificacion: true } },
        },
      }),
    ]);

    return { total, limit: take, offset: skip, logs };
  }

  /** Timeline de un usuario (acciones realizadas + recibidas, cronológico). */
  async timelineDeUsuario(userId: string, limit = 100) {
    const logs = await this.prisma.auditLog.findMany({
      where: { OR: [{ user_id: userId }, { target_user_id: userId }] },
      orderBy: { created_at: "desc" },
      take: limit,
      include: {
        user: { select: { email: true, nombre: true } },
        target_user: { select: { email: true, nombre: true } },
      },
    });

    return logs.map((l) => ({
      id: l.id,
      fecha: l.created_at,
      accion: l.accion,
      direccion: l.user_id === userId ? "realizada" : "recibida",
      actor: l.user ? { email: l.user.email, nombre: l.user.nombre } : null,
      objetivo: l.target_user ? { email: l.target_user.email, nombre: l.target_user.nombre } : null,
      detalle: l.detalle,
      ip: l.ip_address,
    }));
  }

  // ════════════════════════════════════════════════════════
  // DASHBOARD / ESTADÍSTICAS
  // ════════════════════════════════════════════════════════

  async dashboard(diasAtras = 7) {
    const desde = new Date();
    desde.setDate(desde.getDate() - diasAtras);
    desde.setHours(0, 0, 0, 0);

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const [porAccion, loginsHoy, fallidosHoy, usuariosActivos, ultimasAdmin, ipsSospechosas, totalHistorico] =
      await Promise.all([
        this.prisma.auditLog.groupBy({
          by: ["accion"], where: { created_at: { gte: desde } },
          _count: { id: true }, orderBy: { _count: { id: "desc" } },
        }),
        this.prisma.auditLog.count({ where: { accion: "login", created_at: { gte: hoy } } }),
        this.prisma.auditLog.count({ where: { accion: "login_fallido", created_at: { gte: hoy } } }),
        this.prisma.auditLog.findMany({
          where: { accion: "login", created_at: { gte: desde } },
          distinct: ["user_id"], select: { user_id: true },
        }),
        this.prisma.auditLog.findMany({
          where: {
            accion: { in: [
              "usuario_aprobado", "usuario_rechazado", "usuario_desactivado",
              "usuario_reactivado", "rol_asignado", "permiso_otorgado",
              "permiso_revocado", "ejecutivo_mapeado", "cartera_asignada", "cartera_revocada",
            ] as any[] },
          },
          orderBy: { created_at: "desc" }, take: 15,
          include: {
            user: { select: { email: true } },
            target_user: { select: { email: true } },
          },
        }),
        this.prisma.auditLog.groupBy({
          by: ["ip_address"],
          where: { accion: "login_fallido", created_at: { gte: desde }, ip_address: { not: null } },
          _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 5,
        }),
        this.prisma.auditLog.count(),
      ]);

    return {
      periodo: { desde: desde.toISOString(), dias: diasAtras },
      hoy: { logins_exitosos: loginsHoy, logins_fallidos: fallidosHoy },
      periodo_completo: {
        eventos_por_tipo: porAccion.map((p) => ({ accion: p.accion, total: p._count.id })),
        usuarios_activos: usuariosActivos.length,
        total_eventos_periodo: porAccion.reduce((s, p) => s + p._count.id, 0),
      },
      total_historico: totalHistorico,
      ultimas_acciones_admin: ultimasAdmin.map((l) => ({
        fecha: l.created_at, accion: l.accion,
        admin: l.user?.email || "sistema",
        objetivo: l.target_user?.email || null,
        detalle: l.detalle,
      })),
      seguridad: {
        ips_con_mas_fallos: ipsSospechosas.map((ip) => ({
          ip: ip.ip_address, intentos_fallidos: ip._count.id,
        })),
      },
    };
  }

  /** Actividad reciente global. */
  async actividadReciente(limit = 20) {
    return this.prisma.auditLog.findMany({
      orderBy: { created_at: "desc" }, take: limit,
      include: {
        user: { select: { email: true, nombre: true } },
        target_user: { select: { email: true, nombre: true } },
      },
    });
  }
}
