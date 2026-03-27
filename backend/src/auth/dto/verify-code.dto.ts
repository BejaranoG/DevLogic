import { IsEmail, IsString, Length } from "class-validator";

export class VerifyCodeDto {
  @IsEmail({}, { message: "Formato de email inválido" })
  email: string;

  @IsString()
  @Length(6, 6, { message: "El código debe ser exactamente 6 dígitos" })
  codigo: string;
}
