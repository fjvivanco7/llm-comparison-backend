import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { authenticator } from '@otplib/preset-default';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {
    // Configurar ventana de tiempo (permite códigos de ±1 intervalo)
    authenticator.options = {
      window: 1,
    };
  }

  /**
   * Generar secreto y QR code para activar 2FA
   */
  async generateSetup(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA ya está activado');
    }

    // Generar secreto
    const secret = authenticator.generateSecret();

    // Crear URI para el QR (formato otpauth)
    const appName = 'LLM Code Gen';
    const otpauthUrl = authenticator.keyuri(user.email, appName, secret);

    // Generar QR code como data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Guardar secreto temporalmente (no activado aún)
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    return {
      secret,
      qrCode: qrCodeDataUrl,
      manualEntryKey: secret, // Para entrada manual si no puede escanear QR
    };
  }

  /**
   * Verificar código y activar 2FA
   */
  async verifyAndEnable(userId: number, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA ya está activado');
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException('Primero debes generar el código QR');
    }

    // Verificar código
    const isValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new BadRequestException('Código inválido. Intenta de nuevo.');
    }

    // Generar códigos de respaldo
    const backupCodes = this.generateBackupCodes();

    // Activar 2FA
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: backupCodes,
      },
    });

    return {
      message: '2FA activado correctamente',
      backupCodes, // Mostrar solo una vez
    };
  }

  /**
   * Verificar código TOTP (para login)
   */
  async verifyCode(userId: number, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackupCodes: true },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return false;
    }

    // Primero verificar si es un código TOTP válido
    const isValidTotp = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });

    if (isValidTotp) {
      return true;
    }

    // Si no es TOTP, verificar si es un código de respaldo
    const backupCodeIndex = user.twoFactorBackupCodes.indexOf(code);
    if (backupCodeIndex !== -1) {
      // Eliminar el código de respaldo usado
      const updatedCodes = [...user.twoFactorBackupCodes];
      updatedCodes.splice(backupCodeIndex, 1);

      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorBackupCodes: updatedCodes },
      });

      return true;
    }

    return false;
  }

  /**
   * Desactivar 2FA
   */
  async disable(userId: number, password: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, twoFactorEnabled: true, twoFactorSecret: true },
    });

    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('2FA no está activado');
    }

    // Verificar código 2FA actual
    const isValidCode = await this.verifyCode(userId, code);
    if (!isValidCode) {
      throw new UnauthorizedException('Código 2FA inválido');
    }

    // Desactivar 2FA
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    });

    return { message: '2FA desactivado correctamente' };
  }

  /**
   * Regenerar códigos de respaldo
   */
  async regenerateBackupCodes(userId: number, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });

    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('2FA no está activado');
    }

    // Verificar código actual
    const isValidCode = await this.verifyCode(userId, code);
    if (!isValidCode) {
      throw new UnauthorizedException('Código 2FA inválido');
    }

    // Generar nuevos códigos
    const backupCodes = this.generateBackupCodes();

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: backupCodes },
    });

    return { backupCodes };
  }

  /**
   * Generar códigos de respaldo aleatorios
   */
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Formato: XXXX-XXXX (8 caracteres)
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }

  /**
   * Verificar si el usuario tiene 2FA activado
   */
  async is2FAEnabled(userId: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    return user?.twoFactorEnabled || false;
  }
}
