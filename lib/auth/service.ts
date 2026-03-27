/**
 * lib/auth/service.ts
 * Servicio de autenticación de Logic.
 *
 * Contiene la lógica de registro, verificación y login.
 * Usa una interfaz de almacenamiento para ser independiente de Prisma
 * (facilita testing y permite cambiar la DB sin tocar lógica).
 */

import bcrypt from "bcryptjs";
import {
  validarDominioEmail,
  generarCodigoVerificacion,
  generarNumeroIdentificacion,
} from "./permissions";
import { registrarAccion } from "./logger";
import type {
  Usuario,
  SesionUsuario,
  SolicitudRegistro,
  PerfilClave,
  Area,
} from "./types";

const SALT_ROUNDS = 12;
const CODIGO_EXPIRACION_HORAS = 24;

// ============================================================================
// Interfaz de almacenamiento (implementada por Prisma en producción)
// ============================================================================

export interface AuthStore {
  // Usuarios
  buscarUsuarioPorEmail(email: string): Promise<Usuario | null>;
  buscarUsuarioPorId(id: string): Promise<Usuario | null>;
  crearUsuario(data: Omit<Usuario, "id" | "created_at" | "updated_at">): Promise<Usuario>;
  actualizarUsuario(id: string, data: Partial<Usuario>): Promise<Usuario>;
  listarUsuarios(): Promise<Usuario[]>;
  contarUsuarios(): Promise<number>;
  obtenerPasswordHash(email: string): Promise<string | null>;

  // Solicitudes de registro
  crearSolicitud(data: Omit<SolicitudRegistro, "id">): Promise<SolicitudRegistro>;
  buscarSolicitudPorEmail(email: string): Promise<SolicitudRegistro | null>;
  actualizarSolicitud(id: string, data: Partial<SolicitudRegistro>): Promise<void>;
  listarSolicitudesPendientes(): Promise<SolicitudRegistro[]>;
}

// ============================================================================
// Servicio de autenticación
// ============================================================================

export class AuthService {
  constructor(private store: AuthStore) {}

  // ── REGISTRO PASO 1: Solicitar registro ──

  async solicitarRegistro(
    email: string,
    password: string
  ): Promise<{ codigo: string; solicitud_id: string }> {
    // Validar dominio
    const validacion = validarDominioEmail(email);
    if (!validacion.valido) {
      throw new Error(validacion.error);
    }

    const emailLower = email.toLowerCase().trim();

    // Verificar que no exista ya un usuario
    const existente = await this.store.buscarUsuarioPorEmail(emailLower);
    if (existente) {
      throw new Error("Ya existe un usuario registrado con este correo");
    }

    // Verificar que no haya una solicitud pendiente
    const solicitudPrevia = await this.store.buscarSolicitudPorEmail(emailLower);
    if (solicitudPrevia && solicitudPrevia.status === "pendiente") {
      const ahoraMs = Date.now();
      const expirationMs = solicitudPrevia.expires_at.getTime();
      if (ahoraMs < expirationMs) {
        throw new Error(
          "Ya existe una solicitud de registro pendiente para este correo. " +
          "Solicita el código de verificación al Administrador Maestro."
        );
      }
      // Si expiró, marcamos como expirada y dejamos continuar
      await this.store.actualizarSolicitud(solicitudPrevia.id, {
        status: "expirada",
      });
    }

    // Generar código y hashear password
    const codigo = generarCodigoVerificacion();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const ahora = new Date();
    const expiracion = new Date(
      ahora.getTime() + CODIGO_EXPIRACION_HORAS * 60 * 60 * 1000
    );

    const solicitud = await this.store.crearSolicitud({
      email: emailLower,
      codigo_verificacion: codigo,
      password_hash: passwordHash,
      status: "pendiente",
      created_at: ahora,
      expires_at: expiracion,
    });

    await registrarAccion(null, "registro_solicitud", {
      email: emailLower,
      solicitud_id: solicitud.id,
    });

    return { codigo, solicitud_id: solicitud.id };
  }

  // ── REGISTRO PASO 2: Verificar código ──

  async verificarCodigo(
    email: string,
    codigo: string
  ): Promise<{ usuario_id: string }> {
    const emailLower = email.toLowerCase().trim();

    const solicitud = await this.store.buscarSolicitudPorEmail(emailLower);
    if (!solicitud || solicitud.status !== "pendiente") {
      throw new Error("No hay solicitud de registro pendiente para este correo");
    }

    // Verificar expiración
    if (Date.now() > solicitud.expires_at.getTime()) {
      await this.store.actualizarSolicitud(solicitud.id, { status: "expirada" });
      throw new Error("El código de verificación ha expirado. Solicita uno nuevo.");
    }

    // Verificar código
    if (solicitud.codigo_verificacion !== codigo.trim()) {
      throw new Error("Código de verificación incorrecto");
    }

    // Marcar solicitud como verificada
    await this.store.actualizarSolicitud(solicitud.id, {
      status: "verificada",
    });

    // Generar número de identificación
    const totalUsuarios = await this.store.contarUsuarios();
    const numId = generarNumeroIdentificacion(totalUsuarios);

    // Crear usuario (verificado pero pendiente de completar perfil)
    const usuario = await this.store.crearUsuario({
      email: emailLower,
      nombre: "",
      apellido: "",
      area: "Crédito" as Area, // default, se cambia al completar perfil
      perfil: "staff", // default, el admin lo cambia después
      numero_identificacion: numId,
      verificado: true,
      activo: true,
      nombre_en_sheets: null,
      password_hash: solicitud.password_hash,
    } as any);

    await registrarAccion(null, "registro_verificado", {
      email: emailLower,
      usuario_id: usuario.id,
      numero_identificacion: numId,
    });

    return { usuario_id: usuario.id };
  }

  // ── LOGIN ──

  async login(
    email: string,
    password: string,
    ip?: string
  ): Promise<SesionUsuario> {
    const emailLower = email.toLowerCase().trim();

    const usuario = await this.store.buscarUsuarioPorEmail(emailLower);
    if (!usuario) {
      await registrarAccion(null, "login_fallido", {
        email: emailLower,
        razon: "usuario_no_encontrado",
      }, ip);
      throw new Error("Credenciales inválidas");
    }

    if (!usuario.verificado) {
      await registrarAccion(null, "login_fallido", {
        email: emailLower,
        razon: "no_verificado",
      }, ip);
      throw new Error("Tu cuenta aún no ha sido verificada");
    }

    if (!usuario.activo) {
      await registrarAccion(null, "login_fallido", {
        email: emailLower,
        razon: "desactivado",
      }, ip);
      throw new Error("Tu cuenta ha sido desactivada. Contacta al administrador.");
    }

    // Verificar contraseña
    const passwordHash = await this.store.obtenerPasswordHash(emailLower);
    if (!passwordHash) {
      throw new Error("Error interno: sin hash de contraseña");
    }

    const passwordValida = await bcrypt.compare(password, passwordHash);
    if (!passwordValida) {
      await registrarAccion(null, "login_fallido", {
        email: emailLower,
        razon: "password_incorrecta",
      }, ip);
      throw new Error("Credenciales inválidas");
    }

    const sesion: SesionUsuario = {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      perfil: usuario.perfil,
      numero_identificacion: usuario.numero_identificacion,
      nombre_en_sheets: usuario.nombre_en_sheets,
    };

    await registrarAccion(sesion, "login", {}, ip);

    return sesion;
  }

  // ── ADMIN: Asignar perfil ──

  async asignarPerfil(
    adminSesion: SesionUsuario,
    usuarioId: string,
    nuevoPerfil: PerfilClave
  ): Promise<void> {
    const usuario = await this.store.buscarUsuarioPorId(usuarioId);
    if (!usuario) throw new Error("Usuario no encontrado");

    const perfilAnterior = usuario.perfil;

    await this.store.actualizarUsuario(usuarioId, { perfil: nuevoPerfil });

    await registrarAccion(adminSesion, "admin_cambiar_perfil", {
      usuario_id: usuarioId,
      email_afectado: usuario.email,
      perfil_anterior: perfilAnterior,
      perfil_nuevo: nuevoPerfil,
    });
  }

  // ── ADMIN: Mapear ejecutivo a nombre en Sheets ──

  async mapearEjecutivo(
    adminSesion: SesionUsuario,
    usuarioId: string,
    nombreEnSheets: string
  ): Promise<void> {
    const usuario = await this.store.buscarUsuarioPorId(usuarioId);
    if (!usuario) throw new Error("Usuario no encontrado");

    await this.store.actualizarUsuario(usuarioId, {
      nombre_en_sheets: nombreEnSheets.toUpperCase().trim(),
    });

    await registrarAccion(adminSesion, "admin_mapear_ejecutivo", {
      usuario_id: usuarioId,
      email_afectado: usuario.email,
      nombre_en_sheets: nombreEnSheets,
    });
  }

  // ── ADMIN: Desactivar usuario ──

  async desactivarUsuario(
    adminSesion: SesionUsuario,
    usuarioId: string
  ): Promise<void> {
    const usuario = await this.store.buscarUsuarioPorId(usuarioId);
    if (!usuario) throw new Error("Usuario no encontrado");

    if (usuario.perfil === "admin_maestro") {
      throw new Error("No se puede desactivar al Administrador Maestro");
    }

    await this.store.actualizarUsuario(usuarioId, { activo: false });

    await registrarAccion(adminSesion, "admin_desactivar_usuario", {
      usuario_id: usuarioId,
      email_afectado: usuario.email,
    });
  }

  // ── Consultas ──

  async obtenerSolicitudesPendientes(): Promise<SolicitudRegistro[]> {
    return this.store.listarSolicitudesPendientes();
  }

  async listarUsuarios(): Promise<Usuario[]> {
    return this.store.listarUsuarios();
  }
}
