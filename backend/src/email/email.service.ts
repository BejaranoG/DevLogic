import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      });
      this.logger.log(`Email configurado con ${user}`);
    } else {
      this.logger.warn("GMAIL_USER o GMAIL_APP_PASSWORD no configurados. Emails deshabilitados.");
    }
  }

  async sendRecoveryCode(to: string, code: string, nombre: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Email no configurado — código de recuperación para ${to}: ${code}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: `"LOGIC · Proaktiva" <${process.env.GMAIL_USER}>`,
        to,
        subject: "Código de recuperación — LOGIC",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #0f2167;">LOGIC</h2>
            <p>Hola <strong>${nombre}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña.</p>
            <p>Tu código de verificación es:</p>
            <div style="text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0f2167; background: #f0f4ff; padding: 16px 32px; border-radius: 8px; display: inline-block;">${code}</span>
            </div>
            <p>Este código expira en <strong>30 minutos</strong>.</p>
            <p style="color: #666; font-size: 13px;">Si no solicitaste este cambio, ignora este correo.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 11px;">LOGIC · Plataforma de Cartera — Proaktiva</p>
          </div>
        `,
      });
      this.logger.log(`Código de recuperación enviado a ${to}`);
      return true;
    } catch (err) {
      this.logger.error(`Error enviando email a ${to}: ${err}`);
      return false;
    }
  }
}
