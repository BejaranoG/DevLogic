import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Guard que protege rutas requiriendo un JWT válido.
 *
 * Uso:
 *   @UseGuards(JwtAuthGuard)
 *   @Get('protegido')
 *   miRuta(@CurrentUser() user: AuthenticatedUser) { ... }
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  handleRequest<T>(err: Error | null, user: T, info: any): T {
    if (err) throw err;

    if (!user) {
      const mensaje =
        info?.name === "TokenExpiredError"
          ? "Token expirado. Inicia sesión nuevamente."
          : info?.name === "JsonWebTokenError"
            ? "Token inválido."
            : "No autenticado. Envía el header Authorization: Bearer <token>";

      throw new UnauthorizedException(mensaje);
    }

    return user;
  }
}
