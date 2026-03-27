import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../../auth/interfaces/jwt.interface";

/**
 * Guard que verifica permisos granulares.
 *
 * Resolución de permisos efectivos:
 *   1. Obtiene todos los permisos del ROL del usuario (role_permissions)
 *   2. Obtiene overrides individuales del usuario (user_permissions)
 *   3. granted=true  → agrega el permiso aunque el rol no lo tenga
 *      granted=false → revoca el permiso aunque el rol sí lo tenga
 *   4. admin_maestro bypasea TODA verificación (acceso total)
 *
 * Uso:
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *   @RequirePermissions('ver_todos_creditos')
 *   @Get('cartera')
 *   verCartera() { ... }
 *
 *   // Requiere MÚLTIPLES permisos (AND):
 *   @RequirePermissions('admin_usuarios', 'asignar_roles')
 *   @Patch('usuarios/:id/rol')
 *   cambiarRol() { ... }
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Obtener permisos requeridos del decorador
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si no hay @RequirePermissions(), la ruta pasa (solo necesita auth)
    if (!required || required.length === 0) {
      return true;
    }

    // 2. Obtener usuario autenticado
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user?.id) {
      throw new ForbiddenException("No autenticado");
    }

    // 3. admin_maestro bypasea TODO
    if (user.role_clave === "admin_maestro") {
      return true;
    }

    // 4. Resolver permisos efectivos
    const efectivos = await this.resolverPermisosEfectivos(
      user.role_id,
      user.id,
    );

    // 5. Verificar que tenga TODOS los requeridos
    const faltantes = required.filter((p) => !efectivos.has(p));

    if (faltantes.length > 0) {
      this.logger.warn(
        `Permiso denegado a ${user.email}: faltan [${faltantes.join(", ")}]`,
      );
      throw new ForbiddenException(
        `Permisos insuficientes. Se requiere: ${faltantes.join(", ")}`,
      );
    }

    // 6. Inyectar permisos efectivos en el request para uso downstream
    request.userPermissions = efectivos;

    return true;
  }

  /**
   * Resuelve los permisos efectivos de un usuario:
   *   base = permisos del rol
   *   + user_permissions con granted=true (agregar)
   *   - user_permissions con granted=false (revocar)
   */
  async resolverPermisosEfectivos(
    roleId: string,
    userId: string,
  ): Promise<Set<string>> {
    // Permisos del rol
    const rolPerms = await this.prisma.rolePermission.findMany({
      where: { role_id: roleId },
      include: { permission: { select: { clave: true } } },
    });

    const efectivos = new Set<string>(
      rolPerms.map((rp) => rp.permission.clave),
    );

    // Overrides del usuario
    const userPerms = await this.prisma.userPermission.findMany({
      where: { user_id: userId },
      include: { permission: { select: { clave: true } } },
    });

    for (const up of userPerms) {
      if (up.granted) {
        efectivos.add(up.permission.clave);
      } else {
        efectivos.delete(up.permission.clave);
      }
    }

    return efectivos;
  }
}
