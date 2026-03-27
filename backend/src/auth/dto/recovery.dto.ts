import { IsEmail, IsString, MinLength, MaxLength } from "class-validator";

export class ForgotPasswordDto {
  @IsEmail({}, { message: "Correo electrónico inválido" })
  email: string;
}

export class ResetPasswordDto {
  @IsEmail({}, { message: "Correo electrónico inválido" })
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  codigo: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  nueva_password: string;
}
