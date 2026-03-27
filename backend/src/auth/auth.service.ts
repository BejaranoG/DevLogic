import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditEvent } from "../audit/audit.service";
import { EmailService } from "../email/email.service";
import type { JwtPayload } from "./interfaces/jwt.interface";

const SALT_ROUNDS = 12;
const DOMINIO_PERMITIDO = process.env.DOMINIO_PERMITIDO || "@proaktiva.com.mx";
const MAX_INTENTOS_LOGIN = 5;
const BLOQUEO_MINUTOS = 30;
const CODIGO_RECOVERY_MINUTOS = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // REGISTRO — Simplificado (sin código de verificación)
  // ════════════════════════════════════════════════════════════════

  async register(dto: {
    email: string;
    password: string;
    nombre: string;
    apellido: string;
  }) {
    const email = dto.email.toLowerCase().trim();

    // 1. Validar dominio
    if (!email.endsWith(DOMINIO_PERMITIDO)) {
      throw new BadRequestException(
        `Solo se permiten correos con dominio ${DOMINIO_PERMITIDO}`,
      );
    }

    // 2. Validar password (mínimo 8 caracteres)
    if (dto.password.length < 8) {
      throw new BadRequestException("La contraseña debe tener al menos 8 caracteres");
    }

    // 3. Verificar que no exista
    const existente = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existente) {
      if (existente.deleted_at) {
        throw new ConflictException(
          "Este correo fue dado de baja previamente. Contacta al administrador.",
        );
      }
      throw new ConflictException("Ya existe una cuenta con este correo");
    }

    // 4. Obtener rol default
    const rolDefault = await this.prisma.role.findUnique({
      where: { clave: "staff" },
    });
    if (!rolDefault) {
      throw new Error('Rol "staff" no encontrado. Ejecuta el seed primero.');
    }

    // 5. Hash password
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    // 6. Generar número de identificación
    const count = await this.prisma.user.count();
    const numId = "LOG-" + String(count + 1).padStart(4, "0");

    // 7. Crear usuario — verificado=true, status=pendiente
    const usuario = await this.prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        nombre: dto.nombre.trim(),
        apellido: dto.apellido.trim(),
        numero_identificacion: numId,
        status: "pendiente",
        verificado: true,
        role_id: rolDefault.id,
      },
    });

    // 8. Log de auditoría
    await this.audit(null, "registro_solicitud", {
      usuario_nuevo_id: usuario.id,
      email,
      numero_identificacion: numId,
    });

    this.logger.log(`Registro: ${email} → ${numId}`);

    return {
      mensaje: "Registro exitoso. Tu cuenta está pendiente de aprobación por un administrador.",
      usuario_id: usuario.id,
      numero_identificacion: numId,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // LOGIN
  // ════════════════════════════════════════════════════════════════

  async login(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ) {
    const emailLower = email.toLowerCase().trim();

    // 1. Buscar usuario
    const usuario = await this.prisma.user.findUnique({
      where: { email: emailLower },
      include: { role: true },
    });

    if (!usuario || usuario.deleted_at) {
      await this.audit(null, "login_fallido", {
        email: emailLower,
        razon: "usuario_no_encontrado",
      }, ip, userAgent);
      throw new UnauthorizedException("Credenciales inválidas");
    }

    // 2. Auto-bloqueo temporal
    if (usuario.bloqueado_hasta && new Date() < usuario.bloqueado_hasta) {
      const minutos = Math.ceil(
        (usuario.bloqueado_hasta.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Cuenta bloqueada temporalmente. Intenta en ${minutos} minutos.`,
      );
    }

    // 3. Validar status
    if (usuario.status === "pendiente") {
      await this.audit(usuario.id, "login_fallido", { razon: "pendiente_aprobacion" }, ip, userAgent);
      throw new UnauthorizedException("Tu cuenta está pendiente de aprobación. Contacta al administrador.");
    }
    if (usuario.status === "rechazado") {
      await this.audit(usuario.id, "login_fallido", { razon: "rechazado" }, ip, userAgent);
      throw new UnauthorizedException("Tu solicitud de acceso fue rechazada. Contacta al administrador.");
    }
    if (usuario.status === "desactivado") {
      await this.audit(usuario.id, "login_fallido", { razon: "desactivado" }, ip, userAgent);
      throw new UnauthorizedException("Tu cuenta ha sido desactivada. Contacta al administrador.");
    }
    if (usuario.status === "bloqueado") {
      await this.audit(usuario.id, "login_fallido", { razon: "bloqueado" }, ip, userAgent);
      throw new UnauthorizedException("Tu cuenta ha sido bloqueada. Contacta al administrador.");
    }

    // 4. Verificar contraseña
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      const nuevosIntentos = usuario.intentos_login_fallidos + 1;
      const data: any = { intentos_login_fallidos: nuevosIntentos };

      if (nuevosIntentos >= MAX_INTENTOS_LOGIN) {
        data.bloqueado_hasta = new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000);
        this.logger.warn(`Auto-bloqueo: ${emailLower} (${nuevosIntentos} intentos)`);
      }

      await this.prisma.user.update({ where: { id: usuario.id }, data });

      await this.audit(usuario.id, "login_fallido", {
        razon: "password_incorrecta", intentos: nuevosIntentos,
      }, ip, userAgent);

      if (nuevosIntentos >= MAX_INTENTOS_LOGIN) {
        await this.audit(usuario.id, "usuario_bloqueado", {
          razon: "auto_bloqueo_intentos_fallidos", intentos: nuevosIntentos, bloqueado_minutos: BLOQUEO_MINUTOS,
        }, ip, userAgent);
      }

      throw new UnauthorizedException("Credenciales inválidas");
    }

    // 5. Login exitoso
    await this.prisma.user.update({
      where: { id: usuario.id },
      data: { intentos_login_fallidos: 0, bloqueado_hasta: null, last_login_at: new Date() },
    });

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      role: usuario.role.clave,
    };
    const accessToken = this.jwt.sign(payload);

    await this.audit(usuario.id, "login", {}, ip, userAgent);
    this.logger.log(`Login: ${emailLower} (${usuario.role.clave})`);

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: process.env.JWT_EXPIRATION || "8h",
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        numero_identificacion: usuario.numero_identificacion,
        role: usuario.role.clave,
        role_nombre: usuario.role.nombre,
        nombre_en_sheets: usuario.nombre_en_sheets,
      },
    };
  }

  // ════════════════════════════════════════════════════════════════
  // RECUPERACIÓN DE CONTRASEÑA — Paso 1: Solicitar código
  // ════════════════════════════════════════════════════════════════

  async forgotPassword(email: string) {
    const emailLower = email.toLowerCase().trim();

    const usuario = await this.prisma.user.findUnique({
      where: { email: emailLower },
    });

    // Siempre respondemos lo mismo (no revelamos si el email existe)
    const mensajeGenerico = "Si el correo está registrado, recibirás un código de recuperación.";

    if (!usuario || usuario.deleted_at) {
      return { mensaje: mensajeGenerico };
    }

    // Generar código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expira = new Date(Date.now() + CODIGO_RECOVERY_MINUTOS * 60 * 1000);

    await this.prisma.user.update({
      where: { id: usuario.id },
      data: { codigo_verificacion: codigo, codigo_expira_at: expira },
    });

    // Enviar por email
    const enviado = await this.emailService.sendRecoveryCode(
      emailLower, codigo, usuario.nombre || "usuario",
    );

    this.logger.log(`Recovery code para ${emailLower}: ${codigo} (enviado: ${enviado})`);

    return {
      mensaje: mensajeGenerico,
      // Solo en dev/debug — quitar en producción si se desea
      ...(process.env.NODE_ENV !== "production" && { _debug_code: codigo }),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // RECUPERACIÓN DE CONTRASEÑA — Paso 2: Validar código + cambiar
  // ════════════════════════════════════════════════════════════════

  async resetPassword(email: string, codigo: string, nuevaPassword: string) {
    const emailLower = email.toLowerCase().trim();

    if (nuevaPassword.length < 8) {
      throw new BadRequestException("La nueva contraseña debe tener al menos 8 caracteres");
    }

    const usuario = await this.prisma.user.findUnique({
      where: { email: emailLower },
    });

    if (!usuario || usuario.deleted_at) {
      throw new BadRequestException("Código inválido o expirado");
    }

    if (!usuario.codigo_verificacion || usuario.codigo_verificacion !== codigo) {
      throw new BadRequestException("Código inválido o expirado");
    }

    if (!usuario.codigo_expira_at || new Date() > usuario.codigo_expira_at) {
      throw new BadRequestException("El código ha expirado. Solicita uno nuevo.");
    }

    const passwordHash = await bcrypt.hash(nuevaPassword, SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: usuario.id },
      data: {
        password_hash: passwordHash,
        codigo_verificacion: null,
        codigo_expira_at: null,
        intentos_login_fallidos: 0,
        bloqueado_hasta: null,
      },
    });

    await this.audit(usuario.id, "password_cambiado", { metodo: "recovery_code" });
    this.logger.log(`Password cambiado: ${emailLower}`);

    return { mensaje: "Contraseña actualizada exitosamente. Ya puedes iniciar sesión." };
  }

  // ════════════════════════════════════════════════════════════════
  // PERFIL
  // ════════════════════════════════════════════════════════════════

  async perfil(userId: string) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permisos: { include: { permission: true } },
          },
        },
      },
    });

    if (!usuario) throw new UnauthorizedException("Usuario no encontrado");

    const permisos = usuario.role.permisos.map((rp: any) => rp.permission.clave);

    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      area: usuario.area,
      numero_identificacion: usuario.numero_identificacion,
      status: usuario.status,
      role: { clave: usuario.role.clave, nombre: usuario.role.nombre },
      nombre_en_sheets: usuario.nombre_en_sheets,
      permisos,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════

  private async audit(
    userId: string | null,
    accion: AuditEvent,
    detalle: Record<string, unknown>,
    ip?: string | null,
    userAgent?: string | null,
  ) {
    await this.auditService.registrar({
      user_id: userId,
      accion,
      detalle,
      ip_address: ip,
      user_agent: userAgent,
    });
  }
}
