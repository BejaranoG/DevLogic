import { SetMetadata } from "@nestjs/common";

export const PERMISSIONS_KEY = "logic_permissions";

/**
 * Marca qué permisos se requieren para acceder a una ruta.
 * Se usa junto con PermissionsGuard.
 *
 * Resuelve permisos efectivos: (permisos_del_rol + user_granted) - user_revoked
 * admin_maestro bypasea todas las verificaciones.
 *
 * Uso:
 *   @RequirePermissions('ver_todos_creditos')
 *   @RequirePermissions('admin_usuarios', 'ver_log')  // requiere TODOS
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
