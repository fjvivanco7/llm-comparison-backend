import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto, ChangePasswordDto, UpdatePreferencesDto } from './dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtener perfil completo del usuario
   */
  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        preferences: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  /**
   * Actualizar datos del perfil
   */
  async updateProfile(userId: number, dto: UpdateProfileDto) {
    this.logger.log(`Actualizando perfil de usuario ${userId}`);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    return {
      message: 'Perfil actualizado correctamente',
      user,
    };
  }

  /**
   * Cambiar contraseña
   */
  async changePassword(userId: number, dto: ChangePasswordDto) {
    this.logger.log(`Cambiando contraseña de usuario ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar contraseña actual
    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    // Verificar que la nueva sea diferente
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la actual');
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Invalidar todas las sesiones excepto la actual
    await this.prisma.userSession.deleteMany({
      where: { userId },
    });

    return { message: 'Contraseña actualizada correctamente. Por seguridad, se cerraron todas las sesiones.' };
  }

  /**
   * Obtener/Actualizar preferencias
   */
  async getPreferences(userId: number) {
    let preferences = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    // Si no existen, crear con valores por defecto
    if (!preferences) {
      preferences = await this.prisma.userPreferences.create({
        data: { userId },
      });
    }

    return preferences;
  }

  async updatePreferences(userId: number, dto: UpdatePreferencesDto) {
    this.logger.log(`Actualizando preferencias de usuario ${userId}`);

    const preferences = await this.prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
      },
      update: dto,
    });

    return {
      message: 'Preferencias actualizadas',
      preferences,
    };
  }

  /**
   * Obtener sesiones activas
   */
  async getActiveSessions(userId: number) {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        lastActivity: true,
        createdAt: true,
      },
      orderBy: { lastActivity: 'desc' },
    });

    return sessions;
  }

  /**
   * Cerrar sesión en todos los dispositivos
   */
  async logoutAllDevices(userId: number) {
    this.logger.log(`Cerrando todas las sesiones de usuario ${userId}`);

    const result = await this.prisma.userSession.deleteMany({
      where: { userId },
    });

    return {
      message: `Se cerraron ${result.count} sesiones activas`,
      sessionsTerminated: result.count,
    };
  }

  /**
   * Cerrar una sesión específica
   */
  async logoutSession(userId: number, sessionId: number) {
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    await this.prisma.userSession.delete({
      where: { id: sessionId },
    });

    return { message: 'Sesión cerrada correctamente' };
  }

  /**
   * Eliminar cuenta
   */
  async deleteAccount(userId: number, password: string) {
    this.logger.log(`Eliminando cuenta de usuario ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar contraseña para confirmar
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Contraseña incorrecta. No se puede eliminar la cuenta.');
    }

    // Eliminar usuario (cascade eliminará todo lo relacionado)
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { message: 'Cuenta eliminada permanentemente' };
  }

  /**
   * Obtener estadísticas de uso del usuario
   */
  async getUsageStats(userId: number) {
    this.logger.log(`Obteniendo estadísticas de uso para usuario ${userId}`);

    // Total de consultas
    const totalQueries = await this.prisma.userQuery.count({
      where: { userId },
    });

    // Consultas por día (últimos 30 días)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const queriesLast30Days = await this.prisma.userQuery.count({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Consultas hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const queriesToday = await this.prisma.userQuery.count({
      where: {
        userId,
        createdAt: { gte: today },
      },
    });

    // Límite diario
    const dailyLimit = 10;
    const remainingToday = Math.max(0, dailyLimit - queriesToday);

    // Total de códigos generados
    const totalCodes = await this.prisma.generatedCode.count({
      where: { query: { userId } },
    });

    // Total de análisis completados
    const totalAnalyses = await this.prisma.codeMetrics.count({
      where: { code: { query: { userId } } },
    });

    // Modelos más usados
    const modelUsage = await this.prisma.generatedCode.groupBy({
      by: ['llmName'],
      where: { query: { userId } },
      _count: { llmName: true },
      orderBy: { _count: { llmName: 'desc' } },
      take: 5,
    });

    // Score promedio por modelo
    const avgScoresByModel = await this.prisma.codeMetrics.groupBy({
      by: ['codeId'],
      where: { code: { query: { userId } } },
      _avg: { totalScore: true },
    });

    // Actividad por día de la semana
    const queriesByDay = await this.prisma.$queryRaw<{ day: number; count: bigint }[]>`
      SELECT EXTRACT(DOW FROM "createdAt") as day, COUNT(*) as count
      FROM user_queries
      WHERE "userId" = ${userId}
      GROUP BY EXTRACT(DOW FROM "createdAt")
      ORDER BY day
    `;

    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const activityByDay = daysOfWeek.map((name, index) => {
      const found = queriesByDay.find(q => Number(q.day) === index);
      return { day: name, count: found ? Number(found.count) : 0 };
    });

    // Fecha de registro
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    const memberSinceDays = user
      ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      summary: {
        totalQueries,
        totalCodes,
        totalAnalyses,
        memberSinceDays,
      },
      daily: {
        used: queriesToday,
        limit: dailyLimit,
        remaining: remainingToday,
        percentageUsed: Math.round((queriesToday / dailyLimit) * 100),
      },
      last30Days: {
        queries: queriesLast30Days,
        averagePerDay: Math.round((queriesLast30Days / 30) * 10) / 10,
      },
      modelUsage: modelUsage.map(m => ({
        model: m.llmName,
        count: m._count.llmName,
        percentage: Math.round((m._count.llmName / totalCodes) * 100),
      })),
      activityByDay,
    };
  }
}
