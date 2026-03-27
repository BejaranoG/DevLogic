import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  IsArray,
  ArrayMinSize,
  IsUUID,
} from "class-validator";

// ═══════════════════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════════════════

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  clave: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombre: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  descripcion?: string;
}

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  descripcion?: string;
}

// ═══════════════════════════════════════════════════════
// ASIGNACIÓN DE PERMISOS A ROLES
// ═══════════════════════════════════════════════════════

/** Asigna uno o varios permisos a un rol */
export class AssignPermissionsToRoleDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Debes incluir al menos un permiso" })
  @IsString({ each: true })
  permission_claves: string[];
}

/** Revoca uno o varios permisos de un rol */
export class RevokePermissionsFromRoleDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  permission_claves: string[];
}

// ═══════════════════════════════════════════════════════
// OVERRIDE DE PERMISOS POR USUARIO
// ═══════════════════════════════════════════════════════

/** Asigna o revoca un permiso a nivel de usuario individual */
export class UserPermissionOverrideDto {
  @IsString()
  permission_clave: string;

  @IsBoolean({ message: "granted debe ser true (otorgar) o false (revocar)" })
  granted: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  motivo?: string;
}

/** Elimina un override de permiso de usuario (vuelve a heredar del rol) */
export class RemoveUserPermissionDto {
  @IsString()
  permission_clave: string;
}
