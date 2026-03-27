import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";
import type { JwtPayload, AuthenticatedUser } from "../interfaces/jwt.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "logic-dev-secret-CAMBIAR-EN-PRODUCCION",
    });
  }

  /**
   * Passport llama a validate() después de verificar la firma del JWT.
   * Aquí cargamos el usuario de la DB y verificamos que siga activo.
   *
   * Lo que retorne este método se inyecta en request.user
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    // Usuario no existe
    if (!user) {
      this.logger.warn(`JWT válido pero usuario no encontrado: ${payload.sub}`);
      throw new UnauthorizedException("Usuario no encontrado");
    }

    // Soft deleted
    if (user.deleted_at) {
      throw new UnauthorizedException("Tu cuenta ha sido eliminada");
    }

    // Solo usuarios aprobados pueden operar
    if (user.status !== "aprobado") {
      throw new UnauthorizedException(
        `Tu cuenta está en estado "${user.status}". Contacta al administrador.`,
      );
    }

    // Auto-bloqueo temporal por intentos fallidos
    if (user.bloqueado_hasta && new Date() < user.bloqueado_hasta) {
      const minutos = Math.ceil(
        (user.bloqueado_hasta.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Cuenta bloqueada temporalmente. Intenta en ${minutos} minutos.`,
      );
    }

    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      role_id: user.role_id,
      role_clave: user.role.clave,
      numero_identificacion: user.numero_identificacion,
      nombre_en_sheets: user.nombre_en_sheets,
      status: user.status,
    };
  }
}
