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

    // Obtener usuario y su rol
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, createdAt: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const memberSinceDays = Math.floor(
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Si es evaluador, retornar estadísticas de evaluador
    if (user.role === 'EVALUATOR' || user.role === 'ADMIN') {
      return this.getEvaluatorUsageStats(userId, memberSinceDays);
    }

    // Estadísticas para developers (USER)
    return this.getDeveloperUsageStats(userId, memberSinceDays);
  }

  /**
   * Estadísticas para Developers (USER)
   */
  private async getDeveloperUsageStats(userId: number, memberSinceDays: number) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Consultas (para estadísticas generales)
    const [totalQueries, queriesLast30Days, queriesToday] = await Promise.all([
      this.prisma.userQuery.count({ where: { userId } }),
      this.prisma.userQuery.count({ where: { userId, createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.userQuery.count({ where: { userId, createdAt: { gte: today } } }),
    ]);

    // Obtener límite de tokens desde configuración
    const tokenLimitSetting = await this.prisma.appSettings.findUnique({
      where: { key: 'dailyTokenLimit' },
    });
    const dailyTokenLimit = tokenLimitSetting ? parseInt(tokenLimitSetting.value, 10) : 10000;

    // Calcular tokens consumidos hoy
    const codesWithTokensToday = await this.prisma.generatedCode.findMany({
      where: {
        query: {
          userId,
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      },
      include: {
        tokenUsage: true,
      },
    });

    const tokensUsedToday = codesWithTokensToday.reduce((sum, code) => {
      return sum + (code.tokenUsage?.totalTokens || 0);
    }, 0);

    const tokensRemaining = Math.max(0, dailyTokenLimit - tokensUsedToday);

    // Códigos y análisis
    const [totalCodes, totalAnalyses] = await Promise.all([
      this.prisma.generatedCode.count({ where: { query: { userId } } }),
      this.prisma.codeMetrics.count({ where: { code: { query: { userId } } } }),
    ]);

    // Modelos más usados
    const modelUsage = await this.prisma.generatedCode.groupBy({
      by: ['llmName'],
      where: { query: { userId } },
      _count: { llmName: true },
      orderBy: { _count: { llmName: 'desc' } },
      take: 5,
    });

    // Actividad por día
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

    return {
      type: 'developer',
      summary: {
        totalQueries,
        totalCodes,
        totalAnalyses,
        memberSinceDays,
      },
      daily: {
        used: tokensUsedToday,
        limit: dailyTokenLimit,
        remaining: tokensRemaining,
        percentageUsed: Math.round((tokensUsedToday / dailyTokenLimit) * 100),
      },
      last30Days: {
        queries: queriesLast30Days,
        averagePerDay: Math.round((queriesLast30Days / 30) * 10) / 10,
      },
      modelUsage: modelUsage.map(m => ({
        model: m.llmName,
        count: m._count.llmName,
        percentage: totalCodes > 0 ? Math.round((m._count.llmName / totalCodes) * 100) : 0,
      })),
      activityByDay,
    };
  }

  /**
   * Estadísticas para Evaluadores
   */
  private async getEvaluatorUsageStats(userId: number, memberSinceDays: number) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Evaluaciones realizadas
    const [totalEvaluations, evaluationsLast30Days, evaluationsToday] = await Promise.all([
      this.prisma.qualitativeEvaluation.count({ where: { evaluatorId: userId } }),
      this.prisma.qualitativeEvaluation.count({
        where: { evaluatorId: userId, evaluatedAt: { gte: thirtyDaysAgo } }
      }),
      this.prisma.qualitativeEvaluation.count({
        where: { evaluatorId: userId, evaluatedAt: { gte: today } }
      }),
    ]);

    // Códigos pendientes de evaluar (códigos que no han sido evaluados por este evaluador)
    const pendingCodes = await this.prisma.generatedCode.count({
      where: {
        qualitativeEvaluations: {
          none: { evaluatorId: userId },
        },
        metrics: { isNot: null }, // Solo códigos que ya tienen métricas
      },
    });

    // Promedio de scores dados
    const avgScores = await this.prisma.qualitativeEvaluation.aggregate({
      where: { evaluatorId: userId },
      _avg: {
        readabilityScore: true,
        clarityScore: true,
        structureScore: true,
        documentationScore: true,
        totalScore: true,
      },
    });

    // Distribución de scores
    const scoreDistribution = await this.prisma.qualitativeEvaluation.groupBy({
      by: ['totalScore'],
      where: { evaluatorId: userId },
      _count: { totalScore: true },
    });

    // Actividad por día
    const evaluationsByDay = await this.prisma.$queryRaw<{ day: number; count: bigint }[]>`
      SELECT EXTRACT(DOW FROM "evaluatedAt") as day, COUNT(*) as count
      FROM qualitative_evaluations
      WHERE "evaluatorId" = ${userId}
      GROUP BY EXTRACT(DOW FROM "evaluatedAt")
      ORDER BY day
    `;

    const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const activityByDay = daysOfWeek.map((name, index) => {
      const found = evaluationsByDay.find(q => Number(q.day) === index);
      return { day: name, count: found ? Number(found.count) : 0 };
    });

    return {
      type: 'evaluator',
      summary: {
        totalEvaluations,
        pendingCodes,
        memberSinceDays,
      },
      today: {
        evaluations: evaluationsToday,
      },
      last30Days: {
        evaluations: evaluationsLast30Days,
        averagePerDay: Math.round((evaluationsLast30Days / 30) * 10) / 10,
      },
      averageScores: {
        readability: Math.round((avgScores._avg.readabilityScore || 0) * 10) / 10,
        clarity: Math.round((avgScores._avg.clarityScore || 0) * 10) / 10,
        structure: Math.round((avgScores._avg.structureScore || 0) * 10) / 10,
        documentation: Math.round((avgScores._avg.documentationScore || 0) * 10) / 10,
        overall: Math.round((avgScores._avg.totalScore || 0) * 10) / 10,
      },
      activityByDay,
    };
  }
}
