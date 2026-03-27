import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";

/**
 * Guard que restringe acceso por rol.
 * Se usa junto con el decorador @Roles().
 *
 * Uso:
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles('admin_maestro', 'admin')
 *   @Get('solo-admins')
 *   miRuta() { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Obtener roles requeridos del decorador @Roles()
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si no hay decorador @Roles(), la ruta es libre (solo requiere auth)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.role_clave) {
      throw new ForbiddenException("Sin rol asignado en la sesión");
    }

    if (!requiredRoles.includes(user.role_clave)) {
      throw new ForbiddenException(
        `Acceso denegado. Roles permitidos: ${requiredRoles.join(", ")}. ` +
          `Tu rol: ${user.role_clave}`,
      );
    }

    return true;
  }
}
