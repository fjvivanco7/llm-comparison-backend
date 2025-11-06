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
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px 30px;
          }
          .button {
            display: inline-block;
            background: #667eea;
            color: white !important;
            padding: 15px 40px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
          }
          .button:hover {
            background: #5568d3;
          }
          .token-box {
            background: #f8f9fa;
            border: 2px dashed #667eea;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
            word-break: break-all;
            font-family: monospace;
            font-size: 14px;
          }
          .footer {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 ¡Bienvenido a LLM Comparison!</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${firstName || 'Usuario'}</strong>,</p>
            <p>Gracias por registrarte en <strong>LLM Comparison</strong>. Para completar tu registro, necesitas verificar tu correo electrónico.</p>
            
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">
                ✅ Verificar mi email
              </a>
            </div>

            <p><strong>O copia este token y úsalo en el endpoint:</strong></p>
            <div class="token-box">
              ${token}
            </div>

            <p>También puedes usar este enlace completo:</p>
            <div class="token-box" style="font-size: 12px;">
              ${verificationUrl}
            </div>

            <p style="margin-top: 30px;"><strong>⏰ Este token expirará en 24 horas.</strong></p>
            <p style="color: #666; font-size: 14px;">Si no creaste esta cuenta, puedes ignorar este email.</p>
          </div>
          <div class="footer">
            <p>© 2025 LLM Comparison. Todos los derechos reservados.</p>
            <p>Este es un email automático, por favor no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM'),
        to: email,
        subject: '✅ Verifica tu correo electrónico - LLM Comparison',
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
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 40px 30px;
          }
          .button {
            display: inline-block;
            background: #f5576c;
            color: white !important;
            padding: 15px 40px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
          }
          .button:hover {
            background: #e04458;
          }
          .token-box {
            background: #f8f9fa;
            border: 2px dashed #f5576c;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
            word-break: break-all;
            font-family: monospace;
            font-size: 14px;
          }
          .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .footer {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Recuperación de Contraseña</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${firstName || 'Usuario'}</strong>,</p>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>LLM Comparison</strong>.</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">
                🔑 Restablecer contraseña
              </a>
            </div>

            <p><strong>O copia este token y úsalo en el endpoint:</strong></p>
            <div class="token-box">
              ${token}
            </div>

            <p>También puedes usar este enlace completo:</p>
            <div class="token-box" style="font-size: 12px;">
              ${resetUrl}
            </div>

            <div class="warning">
              <strong>⚠️ Importante:</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Este enlace expirará en <strong>1 hora</strong></li>
                <li>Si no solicitaste este cambio, ignora este email</li>
                <li>Tu contraseña actual seguirá siendo válida hasta que la cambies</li>
              </ul>
            </div>

            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              Si tienes problemas, contacta con soporte.
            </p>
          </div>
          <div class="footer">
            <p>© 2025 LLM Comparison. Todos los derechos reservados.</p>
            <p>Este es un email automático, por favor no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM'),
        to: email,
        subject: '🔒 Recuperación de contraseña - LLM Comparison',
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