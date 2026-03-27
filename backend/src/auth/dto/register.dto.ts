import { IsEmail, IsString, MinLength, MaxLength, Matches } from "class-validator";

export class RegisterDto {
  @IsEmail({}, { message: "Formato de email inválido" })
  email: string;

  @IsString({ message: "La contraseña debe ser texto" })
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(72, { message: "La contraseña no puede exceder 72 caracteres" }) // Límite de bcrypt
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: "La contraseña debe incluir al menos una mayúscula, una minúscula y un número",
  })
  password: string;

  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  @MaxLength(100)
  nombre: string;

  @IsString()
  @MinLength(2, { message: "El apellido debe tener al menos 2 caracteres" })
  @MaxLength(100)
  apellido: string;
}
