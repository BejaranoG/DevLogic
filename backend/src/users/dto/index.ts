import {
  IsString,
  IsOptional,
  IsIn,
  MaxLength,
  MinLength,
  IsBoolean,
} from "class-validator";

// ═══════════════════════════════════════════════════════
// APROBACIÓN / RECHAZO
// ═══════════════════════════════════════════════════════

/**
 * Aprobar un usuario pendiente.
 * Opcionalmente se le asigna rol al momento de aprobar.
 */
export class ApproveUserDto {
  @IsString()
  @IsIn(
    ["admin", "gerencia", "cartera", "ejecutivo", "staff"],
    { message: "Rol debe ser: admin, gerencia, cartera, ejecutivo o staff" },
  )
  role_clave: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  motivo?: string;
}

/**
 * Rechazar un usuario pendiente.
 */
export class RejectUserDto {
  @IsString()
  @MinLength(5, { message: "Indica un motivo de al menos 5 caracteres" })
  @MaxLength(255)
  motivo: string;
}

// ═══════════════════════════════════════════════════════
// CAMBIO DE ESTADO
// ═══════════════════════════════════════════════════════

/**
 * Desactivar un usuario aprobado.
 */
export class DeactivateUserDto {
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  motivo: string;
}

/**
 * Reactivar un usuario desactivado o rechazado.
 */
export class ReactivateUserDto {
  @IsString()
  @IsIn(
    ["admin", "gerencia", "cartera", "ejecutivo", "staff"],
    { message: "Rol debe ser: admin, gerencia, cartera, ejecutivo o staff" },
  )
  role_clave: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  motivo?: string;
}

// ═══════════════════════════════════════════════════════
// ASIGNACIÓN DE ROL
// ═══════════════════════════════════════════════════════

export class ChangeRoleDto {
  @IsString()
  @IsIn(
    ["admin", "gerencia", "cartera", "ejecutivo", "staff"],
    { message: "Rol debe ser: admin, gerencia, cartera, ejecutivo o staff" },
  )
  role_clave: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  motivo?: string;
}

// ═══════════════════════════════════════════════════════
// MAPEO DE CARTERA (ejecutivos)
// ═══════════════════════════════════════════════════════

export class MapPortfolioDto {
  @IsString()
  @MinLength(3, { message: "El nombre del ejecutivo en Sheets debe tener al menos 3 caracteres" })
  @MaxLength(200)
  nombre_ejecutivo_sheets: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  motivo?: string; // "Titular", "Cobertura vacacional", etc.
}

// ═══════════════════════════════════════════════════════
// ACTUALIZACIÓN DE PERFIL (por el propio usuario)
// ═══════════════════════════════════════════════════════

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  nombre?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  apellido?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  area?: string;
}
