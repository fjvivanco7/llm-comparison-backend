import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      secure: false, // false para puerto 587
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  /**
   * Enviar email de verificación
   */
  async sendVerificationEmail(
    email: string,
    token: string,
    firstName?: string,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #09090b;
            background-color: #fafafa;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 560px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #e4e4e7;
          }
          .header {
            background: #18181b;
            padding: 48px 32px;
            text-align: center;
          }
          .header h1 {
            font-size: 24px;
            font-weight: 600;
            color: #ffffff;
            margin: 0;
            letter-spacing: -0.025em;
          }
          .content {
            padding: 48px 32px;
          }
          .greeting {
            font-size: 16px;
            color: #09090b;
            margin-bottom: 16px;
          }
          .message {
            font-size: 15px;
            color: #52525b;
            margin-bottom: 32px;
            line-height: 1.7;
          }
          .button-container {
            text-align: center;
            margin: 32px 0;
          }
          .button {
            display: inline-block;
            background: #18181b;
            color: #ffffff !important;
            padding: 12px 32px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            font-size: 14px;
            transition: background 0.2s;
          }
          .button:hover {
            background: #27272a;
          }
          .info-box {
            background: #fafafa;
            border: 1px solid #e4e4e7;
            border-radius: 6px;
            padding: 16px;
            margin: 24px 0;
          }
          .info-box p {
            font-size: 13px;
            color: #71717a;
            margin: 0;
          }
          .info-box strong {
            color: #52525b;
          }
          .divider {
            height: 1px;
            background: #e4e4e7;
            margin: 32px 0;
          }
          .footer {
            text-align: center;
            padding: 32px;
            background: #fafafa;
            border-top: 1px solid #e4e4e7;
          }
          .footer p {
            font-size: 13px;
            color: #a1a1aa;
            margin: 4px 0;
          }
          .security-note {
            font-size: 13px;
            color: #71717a;
            margin-top: 24px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verificación de Email</h1>
          </div>
          <div class="content">
            <p class="greeting">Hola <strong>${firstName || 'Usuario'}</strong>,</p>
            <p class="message">
              Gracias por registrarte en LLM Comparison. Para completar tu registro y comenzar a usar la plataforma, necesitas verificar tu correo electrónico.
            </p>

            <div class="button-container">
              <a href="${verificationUrl}" class="button">
                Verificar correo electrónico
              </a>
            </div>

            <div class="info-box">
              <p><strong>Este enlace expirará en 24 horas.</strong></p>
              <p>Por motivos de seguridad, el enlace de verificación solo será válido durante las próximas 24 horas.</p>
            </div>

            <div class="divider"></div>

            <p class="security-note">
              Si no creaste esta cuenta, puedes ignorar este correo de manera segura. No se realizará ningún cambio en tu información.
            </p>
          </div>
          <div class="footer">
            <p><strong>LLM Comparison</strong></p>
            <p>© 2025 Todos los derechos reservados</p>
            <p>Este es un correo automático, por favor no respondas</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM'),
        to: email,
        subject: 'Verifica tu correo electrónico - LLM Comparison',
        html: htmlContent,
      });

      this.logger.log(`✅ Email de verificación enviado a: ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Error enviando email a ${email}:`, error.message);
      throw new Error('No se pudo enviar el email de verificación');
    }
  }

  /**
   * Verificar conexión con el servidor de email
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      this.logger.log('✅ Conexión con servidor de email verificada');
      return true;
    } catch (error) {
      this.logger.error('❌ Error verificando conexión de email:', error);
      return false;
    }
  }

  /**
   * Enviar email de recuperación de contraseña
   */
  async sendPasswordResetEmail(
    email: string,
    token: string,
    firstName?: string,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #09090b;
            background-color: #fafafa;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 560px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #e4e4e7;
          }
          .header {
            background: #3b82f6;
            padding: 48px 32px;
            text-align: center;
          }
          .header h1 {
            font-size: 24px;
            font-weight: 600;
            color: #ffffff;
            margin: 0;
            letter-spacing: -0.025em;
          }
          .content {
            padding: 48px 32px;
          }
          .greeting {
            font-size: 16px;
            color: #09090b;
            margin-bottom: 16px;
          }
          .message {
            font-size: 15px;
            color: #52525b;
            margin-bottom: 32px;
            line-height: 1.7;
          }
          .button-container {
            text-align: center;
            margin: 32px 0;
          }
          .button {
            display: inline-block;
            background: #3b82f6;
            color: #ffffff !important;
            padding: 12px 32px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            font-size: 14px;
            transition: background 0.2s;
          }
          .button:hover {
            background: #2563eb;
          }
          .warning-box {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-left: 3px solid #3b82f6;
            border-radius: 6px;
            padding: 16px;
            margin: 24px 0;
          }
          .warning-box p {
            font-size: 13px;
            color: #1e3a8a;
            margin: 0 0 8px 0;
          }
          .warning-box p:last-child {
            margin-bottom: 0;
          }
          .warning-box strong {
            color: #1e40af;
          }
          .info-box {
            background: #fafafa;
            border: 1px solid #e4e4e7;
            border-radius: 6px;
            padding: 16px;
            margin: 24px 0;
          }
          .info-box p {
            font-size: 13px;
            color: #71717a;
            margin: 0;
          }
          .info-box strong {
            color: #52525b;
          }
          .divider {
            height: 1px;
            background: #e4e4e7;
            margin: 32px 0;
          }
          .footer {
            text-align: center;
            padding: 32px;
            background: #fafafa;
            border-top: 1px solid #e4e4e7;
          }
          .footer p {
            font-size: 13px;
            color: #a1a1aa;
            margin: 4px 0;
          }
          .security-note {
            font-size: 13px;
            color: #71717a;
            margin-top: 24px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Recuperación de Contraseña</h1>
          </div>
          <div class="content">
            <p class="greeting">Hola <strong>${firstName || 'Usuario'}</strong>,</p>
            <p class="message">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta en LLM Comparison. Haz clic en el botón a continuación para crear una nueva contraseña.
            </p>

            <div class="button-container">
              <a href="${resetUrl}" class="button">
                Restablecer contraseña
              </a>
            </div>

            <div class="warning-box">
              <p><strong>Información importante:</strong></p>
              <p>• Este enlace expirará en 1 hora</p>
              <p>• Tu contraseña actual seguirá siendo válida hasta que completes el proceso</p>
              <p>• Solo puedes usar este enlace una vez</p>
            </div>

            <div class="divider"></div>

            <p class="security-note">
              Si no solicitaste este cambio de contraseña, puedes ignorar este correo de manera segura. Tu cuenta permanecerá protegida y no se realizará ningún cambio.
            </p>
          </div>
          <div class="footer">
            <p><strong>LLM Comparison</strong></p>
            <p>© 2025 Todos los derechos reservados</p>
            <p>Este es un correo automático, por favor no respondas</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM'),
        to: email,
        subject: 'Recuperación de contraseña - LLM Comparison',
        html: htmlContent,
      });

      this.logger.log(`✅ Email de recuperación enviado a: ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Error enviando email a ${email}:`, error.message);
      throw new Error('No se pudo enviar el email de recuperación');
    }
  }
}