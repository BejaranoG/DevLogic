import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "logic_roles";

/**
 * Marca qué roles pueden acceder a una ruta.
 * Se usa junto con RolesGuard.
 *
 * Uso:
 *   @Roles('admin_maestro', 'admin')
 *   @Get('usuarios')
 *   listar() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
