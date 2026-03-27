import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard, PermissionsGuard } from "../common/guards";
import { RequirePermissions, CurrentUser } from "../common/decorators";
import type { AuthenticatedUser } from "../auth/interfaces/jwt.interface";

@Controller("sugerencias")
@UseGuards(JwtAuthGuard)
export class SugerenciasController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /api/sugerencias — Submit a suggestion/complaint.
   * Any authenticated user except admin roles.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() body: { tipo: string; mensaje: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.tipo || !["sugerencia", "queja"].includes(body.tipo)) {
      throw new BadRequestException("Tipo debe ser 'sugerencia' o 'queja'");
    }
    if (!body.mensaje || body.mensaje.trim().length < 5) {
      throw new BadRequestException("Mensaje debe tener al menos 5 caracteres");
    }
    if (body.mensaje.length > 1000) {
      throw new BadRequestException("Mensaje no puede exceder 1000 caracteres");
    }

    // Block admin roles from submitting
    if (["admin_maestro", "admin"].includes(user.role_clave)) {
      throw new BadRequestException("Los administradores no pueden enviar sugerencias");
    }

    const id = crypto.randomUUID();
    const nombre = `${user.nombre} ${user.apellido}`.trim();

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO sugerencias (id, user_id, user_email, user_nombre, user_role, tipo, mensaje, leido, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())`,
      id, user.id, user.email, nombre, user.role_clave, body.tipo, body.mensaje.trim(),
    );

    return { ok: true, id };
  }

  /**
   * GET /api/sugerencias — List all suggestions (admin only).
   * Query: ?leido=true|false&tipo=sugerencia|queja&limit=50&offset=0
   */
  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions("ver_log")
  async listar(
    @Query("leido") leido?: string,
    @Query("tipo") tipo?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    let where = "WHERE 1=1";
    const params: any[] = [];

    if (leido === "true" || leido === "false") {
      params.push(leido === "true");
      where += ` AND leido = $${params.length}`;
    }
    if (tipo === "sugerencia" || tipo === "queja") {
      params.push(tipo);
      where += ` AND tipo = $${params.length}`;
    }

    const lim = Math.min(parseInt(limit || "50") || 50, 100);
    const off = parseInt(offset || "0") || 0;

    const countResult: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total FROM sugerencias ${where}`, ...params,
    );
    const total = countResult[0]?.total || 0;

    params.push(lim, off);
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, user_email, user_nombre, user_role, tipo, mensaje, leido, created_at
       FROM sugerencias ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      ...params,
    );

    return { total, sugerencias: rows };
  }

  /**
   * PATCH /api/sugerencias/:id/leido — Mark as read (admin only).
   */
  @Patch(":id/leido")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("ver_log")
  async marcarLeido(@Param("id") id: string) {
    await this.prisma.$queryRawUnsafe(
      `UPDATE sugerencias SET leido = true WHERE id = $1`, id,
    );
    return { ok: true };
  }
}
