import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Registrar nuevo usuario
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    this.logger.log(`Intentando registrar usuario: ${dto.email}`);

    // Verificar si el email ya existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Generar token de verificación
    const verificationToken = this.generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    // Crear usuario
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role || UserRole.USER,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
      },
    });

    this.logger.log(`Usuario registrado exitosamente: ${user.email}`);

    // Enviar email de verificación
    try {
      await this.emailService.sendVerificationEmail(
        user.email,
        verificationToken,
        user.firstName || undefined,
      );
      this.logger.log(`Email de verificación enviado a: ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Error enviando email de verificación: ${error.message}`,
      );
      // No fallar el registro si el email falla
    }

    // Respuesta de registro
    return {
      accessToken: '',
      tokenType: 'Bearer',
      expiresIn: 0,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /**
   * Login de usuario
   */
  async login(dto: LoginDto, deviceInfo?: string, ipAddress?: string): Promise<any> {
    this.logger.log(`Intento de login: ${dto.email}`);

    // Buscar usuario
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      this.logger.warn(
        `⚠️ SEGURIDAD: Intento de login con email inexistente: ${dto.email}`,
      );
      throw new UnauthorizedException('No existe una cuenta con este correo electrónico');
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      this.logger.warn(
        `⚠️ SEGURIDAD: Intento de login con contraseña incorrecta para: ${dto.email}`,
      );
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    if (!user.isEmailVerified) {
      this.logger.warn(
        `⚠️ Intento de login sin verificar email: ${dto.email}`,
      );
      throw new UnauthorizedException(
        'Debes verificar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.',
      );
    }

    // ==================== 2FA CHECK ====================
    if (user.twoFactorEnabled) {
      // Generar token temporal (corta duración, solo para 2FA)
      const tempToken = this.jwtService.sign(
        { sub: user.id, email: user.email, type: '2fa-pending' },
        { expiresIn: '5m' } // 5 minutos para completar 2FA
      );

      this.logger.log(`2FA requerido para: ${user.email}`);

      return {
        requiresTwoFactor: true,
        tempToken,
        message: 'Se requiere verificación de dos factores',
      };
    }
    // ==================== FIN 2FA CHECK ====================

    // Si no tiene 2FA, login normal
    return this.completeLogin(user, deviceInfo, ipAddress);
  }

  /**
   * Completar login después de verificar 2FA
   */
  async verify2FALogin(tempToken: string, code: string, deviceInfo?: string, ipAddress?: string): Promise<AuthResponseDto> {
    try {
      // Verificar token temporal
      const payload = this.jwtService.verify(tempToken);

      if (payload.type !== '2fa-pending') {
        throw new UnauthorizedException('Token inválido');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        throw new UnauthorizedException('Usuario no válido');
      }

      // Importar y usar el servicio de 2FA
      const { authenticator } = await import('@otplib/preset-default');

      // Verificar código TOTP
      const isValidTotp = authenticator.verify({
        token: code,
        secret: user.twoFactorSecret,
      });

      // Si no es TOTP válido, verificar si es código de respaldo
      if (!isValidTotp) {
        const backupCodeIndex = user.twoFactorBackupCodes.indexOf(code);
        if (backupCodeIndex === -1) {
          throw new UnauthorizedException('Código 2FA inválido');
        }

        // Eliminar código de respaldo usado
        const updatedCodes = [...user.twoFactorBackupCodes];
        updatedCodes.splice(backupCodeIndex, 1);

        await this.prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: updatedCodes },
        });

        this.logger.log(`Código de respaldo usado para: ${user.email}`);
      }

      this.logger.log(`✅ 2FA verificado para: ${user.email}`);

      // Completar login
      return this.completeLogin(user, deviceInfo, ipAddress);
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token temporal expirado. Inicia sesión de nuevo.');
      }
      throw error;
    }
  }

  /**
   * Completar login (crear sesión y retornar token)
   */
  private async completeLogin(user: any, deviceInfo?: string, ipAddress?: string): Promise<AuthResponseDto> {
    // Generar token
    const authResponse = this.generateAuthResponse(user);

    // Buscar sesión existente del mismo dispositivo
    const existingSession = await this.prisma.userSession.findFirst({
      where: {
        userId: user.id,
        deviceInfo: deviceInfo || 'Unknown Device',
      },
    });

    if (existingSession) {
      // Actualizar sesión existente con nuevo token
      await this.prisma.userSession.update({
        where: { id: existingSession.id },
        data: {
          token: authResponse.accessToken,
          ipAddress: ipAddress || 'Unknown',
          lastActivity: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
        },
      });
      this.logger.log(`Sesión actualizada para dispositivo: ${deviceInfo}`);
    } else {
      // Crear nueva sesión solo si no existe una para este dispositivo
      await this.prisma.userSession.create({
        data: {
          userId: user.id,
          token: authResponse.accessToken,
          deviceInfo: deviceInfo || 'Unknown Device',
          ipAddress: ipAddress || 'Unknown',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
        },
      });
      this.logger.log(`Nueva sesión creada para dispositivo: ${deviceInfo}`);
    }

    // Actualizar último login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`✅ Login exitoso: ${user.email}`);

    return authResponse;
  }

  /**
   * Verificar email con token
   */
  async verifyEmail(token: string) {
    this.logger.log(`Intentando verificar email con token`);

    // Validar y sanitizar token
    if (!this.isValidToken(token)) {
      this.logger.warn(
        `⚠️ SEGURIDAD: Intento de verificación con token malformado`,
      );
      throw new BadRequestException(
        'Token de verificación inválido o expirado',
      );
    }

    // Buscar usuario con el token
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: {
          gt: new Date(), // Token no expirado
        },
      },
    });

    if (!user) {
      this.logger.warn(
        `⚠️ SEGURIDAD: Intento de verificación con token inválido o expirado`,
      );
      throw new BadRequestException(
        'Token de verificación inválido o expirado',
      );
    }

    // Marcar email como verificado
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    this.logger.log(`✅ Email verificado exitosamente: ${user.email}`);

    return {
      message: 'Email verificado exitosamente',
      email: user.email,
    };
  }

  /**
   * Reenviar email de verificación
   */
  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('El email ya está verificado');
    }

    // Generar nuevo token
    const verificationToken = this.generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Actualizar token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
      },
    });

    // Enviar email
    await this.emailService.sendVerificationEmail(
      user.email,
      verificationToken,
      user.firstName || undefined,
    );

    this.logger.log(`Email de verificación reenviado a: ${user.email}`);

    return {
      message: 'Email de verificación enviado',
    };
  }

  /**
   * Solicitar recuperación de contraseña
   */
  async forgotPassword(email: string) {
    this.logger.log(`Solicitud de recuperación de contraseña: ${email}`);

    // Buscar usuario
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Por seguridad, siempre devolvemos el mismo mensaje
    // (no revelamos si el email existe o no)
    if (!user) {
      this.logger.warn(
        `Intento de recuperación para email no registrado: ${email}`,
      );
      return {
        message:
          'Si el email existe, recibirás instrucciones para recuperar tu contraseña',
      };
    }

    // Generar token de recuperación
    const resetToken = this.generateVerificationToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Guardar token en BD
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      },
    });

    // Enviar email
    try {
      await this.emailService.sendPasswordResetEmail(
        user.email,
        resetToken,
        user.firstName || undefined,
      );
      this.logger.log(`Email de recuperación enviado a: ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Error enviando email de recuperación: ${error.message}`,
      );
      throw new BadRequestException(
        'No se pudo enviar el email de recuperación',
      );
    }

    return {
      message:
        'Si el email existe, recibirás instrucciones para recuperar tu contraseña',
    };
  }

  /**
   * Restablecer contraseña con token
   */
  async resetPassword(token: string, newPassword: string) {
    this.logger.log(`Intentando restablecer contraseña con token`);

    // Validar y sanitizar token
    if (!this.isValidToken(token)) {
      this.logger.warn(
        `⚠️ SEGURIDAD: Intento de reset password con token malformado`,
      );
      throw new BadRequestException(
        'Token de recuperación inválido o expirado',
      );
    }

    // Buscar usuario con el token válido
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date(), // Token no expirado
        },
      },
    });

    if (!user) {
      this.logger.warn(
        `⚠️ SEGURIDAD: Intento de reset password con token inválido o expirado`,
      );
      throw new BadRequestException(
        'Token de recuperación inválido o expirado',
      );
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña y limpiar tokens
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    this.logger.log(`✅ Contraseña restablecida exitosamente: ${user.email}`);

    return {
      message: 'Contraseña restablecida exitosamente',
      email: user.email,
    };
  }

  /**
   * Validar usuario por ID (usado por JWT Strategy)
   */
  async validateUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true, // ← AGREGAR
        isEmailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return user;
  }

  /**
   * Generar respuesta de autenticación con token
   */
  private generateAuthResponse(user: any): AuthResponseDto {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role, // ← AGREGAR
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 86400,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role, // ← AGREGAR
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /**
   * Generar token de verificación aleatorio
   */
  private generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validar formato de token
   * Debe ser hexadecimal de 64 caracteres
   */
  private isValidToken(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // Sanitizar: eliminar espacios en blanco
    token = token.trim();

    // Validar longitud (64 caracteres hex = 32 bytes)
    if (token.length !== 64) {
      return false;
    }

    // Validar que sea hexadecimal
    const hexPattern = /^[a-f0-9]{64}$/i;
    return hexPattern.test(token);
  }
}