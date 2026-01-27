import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '@prisma/client';

// Configuraciones por defecto
const DEFAULT_SETTINGS = {
  dailyTokenLimit: { value: '10000', description: 'Límite de tokens diarios por usuario (~5-7 queries con 4 modelos)' },
  maxModelsPerQuery: { value: '5', description: 'Máximo de modelos por consulta' },
  maintenanceMode: { value: 'false', description: 'Modo mantenimiento activo' },
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // DASHBOARD STATS
  // ==========================================
  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalUsers,
      totalQueries,
      totalCodes,
      totalEvaluations,
      usersToday,
      queriesToday,
      usersByRole,
      recentUsers,
      totalTokensSum,
      tokensTodaySum,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.userQuery.count(),
      this.prisma.generatedCode.count(),
      this.prisma.qualitativeEvaluation.count(),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.userQuery.count({ where: { createdAt: { gte: today } } }),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { role: true },
      }),
      this.prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      }),
      // Total de tokens consumidos (todos los tiempos)
      this.prisma.tokenUsage.aggregate({
        _sum: { totalTokens: true },
      }),
      // Tokens consumidos hoy
      this.prisma.tokenUsage.aggregate({
        where: {
          createdAt: { gte: today, lt: tomorrow },
        },
        _sum: { totalTokens: true },
      }),
    ]);

    const roleStats = usersByRole.reduce((acc, item) => {
      acc[item.role] = item._count.role;
      return acc;
    }, {} as Record<string, number>);

    return {
      totals: {
        users: totalUsers,
        queries: totalQueries,
        codes: totalCodes,
        evaluations: totalEvaluations,
        tokens: totalTokensSum._sum.totalTokens || 0,
      },
      today: {
        newUsers: usersToday,
        queries: queriesToday,
        tokens: tokensTodaySum._sum.totalTokens || 0,
      },
      usersByRole: {
        users: roleStats.USER || 0,
        evaluators: roleStats.EVALUATOR || 0,
        admins: roleStats.ADMIN || 0,
      },
      recentUsers,
    };
  }

  // ==========================================
  // USERS MANAGEMENT
  // ==========================================
  async getUsers(
    page: number = 1,
    limit: number = 10,
    search?: string,
    role?: UserRole,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isEmailVerified: true,
          twoFactorEnabled: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              queries: true,
              qualitativeEvaluations: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: users.map(user => ({
        ...user,
        queriesCount: user._count.queries,
        evaluationsCount: user._count.qualitativeEvaluations,
        _count: undefined,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getUserById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            queries: true,
            qualitativeEvaluations: true,
            sessions: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Obtener estadísticas de uso
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [queriesToday, queriesLast30Days, codesWithTokensToday, codesWithTokensLast30Days] = await Promise.all([
      this.prisma.userQuery.count({
        where: {
          userId: id,
          createdAt: { gte: today },
        },
      }),
      this.prisma.userQuery.count({
        where: {
          userId: id,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      // Tokens consumidos hoy
      this.prisma.generatedCode.findMany({
        where: {
          query: {
            userId: id,
            createdAt: {
              gte: today,
              lt: tomorrow,
            },
          },
        },
        include: {
          tokenUsage: true,
        },
      }),
      // Tokens últimos 30 días
      this.prisma.generatedCode.findMany({
        where: {
          query: {
            userId: id,
            createdAt: { gte: thirtyDaysAgo },
          },
        },
        include: {
          tokenUsage: true,
        },
      }),
    ]);

    // Calcular tokens totales
    const tokensToday = codesWithTokensToday.reduce((sum, code) => {
      return sum + (code.tokenUsage?.totalTokens || 0);
    }, 0);

    const tokensLast30Days = codesWithTokensLast30Days.reduce((sum, code) => {
      return sum + (code.tokenUsage?.totalTokens || 0);
    }, 0);

    return {
      ...user,
      queriesCount: user._count.queries,
      evaluationsCount: user._count.qualitativeEvaluations,
      sessionsCount: user._count.sessions,
      usage: {
        queriesToday,
        queriesLast30Days,
        tokensToday,
        tokensLast30Days,
      },
    };
  }

  async updateUser(id: number, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
      },
    });

    this.logger.log(`Usuario ${id} actualizado por admin`);
    return updated;
  }

  async deleteUser(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.role === UserRole.ADMIN) {
      // Verificar que no sea el único admin
      const adminCount = await this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      });

      if (adminCount <= 1) {
        throw new BadRequestException('No puedes eliminar al único administrador');
      }
    }

    await this.prisma.user.delete({ where: { id } });
    this.logger.log(`Usuario ${id} eliminado por admin`);

    return { message: 'Usuario eliminado correctamente' };
  }

  async getUserActivity(id: number, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [total, queries] = await Promise.all([
      this.prisma.userQuery.count({ where: { userId: id } }),
      this.prisma.userQuery.findMany({
        where: { userId: id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          generatedCodes: {
            select: {
              id: true,
              llmName: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: queries,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  // ==========================================
  // APP SETTINGS
  // ==========================================
  async getSettings() {
    const settings = await this.prisma.appSettings.findMany();

    // Combinar con defaults
    const result: Record<string, { value: string; description: string | null }> = {};

    for (const [key, defaultVal] of Object.entries(DEFAULT_SETTINGS)) {
      const dbSetting = settings.find(s => s.key === key);
      result[key] = {
        value: dbSetting?.value ?? defaultVal.value,
        description: dbSetting?.description ?? defaultVal.description,
      };
    }

    // Agregar settings que no están en defaults
    for (const setting of settings) {
      if (!result[setting.key]) {
        result[setting.key] = {
          value: setting.value,
          description: setting.description,
        };
      }
    }

    return result;
  }

  async getSetting(key: string): Promise<string> {
    const setting = await this.prisma.appSettings.findUnique({
      where: { key },
    });

    if (setting) {
      return setting.value;
    }

    // Retornar default si existe
    const defaultSetting = DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS];
    return defaultSetting?.value ?? '';
  }

  async updateSetting(key: string, value: string, description?: string) {
    const setting = await this.prisma.appSettings.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description },
    });

    this.logger.log(`Configuración '${key}' actualizada a '${value}'`);
    return setting;
  }

  async updateSettings(settings: Record<string, string>) {
    const updates = Object.entries(settings).map(([key, value]) =>
      this.prisma.appSettings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    );

    await Promise.all(updates);
    this.logger.log(`${Object.keys(settings).length} configuraciones actualizadas`);

    return this.getSettings();
  }

  // ==========================================
  // SYSTEM STATS
  // ==========================================
  async getSystemStats() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Queries por día (últimos 30 días)
    const queriesByDay = await this.prisma.userQuery.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    });

    // Agrupar por fecha
    const dailyStats: Record<string, number> = {};
    for (const q of queriesByDay) {
      const date = q.createdAt.toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + q._count;
    }

    // Top modelos usados
    const topModels = await this.prisma.generatedCode.groupBy({
      by: ['llmName'],
      _count: { llmName: true },
      orderBy: { _count: { llmName: 'desc' } },
      take: 10,
    });

    // Promedio de métricas
    const avgMetrics = await this.prisma.codeMetrics.aggregate({
      _avg: {
        totalScore: true,
        passRate: true,
      },
    });

    return {
      queriesByDay: Object.entries(dailyStats)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      topModels: topModels.map(m => ({
        model: m.llmName,
        count: m._count.llmName,
      })),
      averageMetrics: {
        totalScore: Math.round((avgMetrics._avg.totalScore || 0) * 100) / 100,
        passRate: Math.round((avgMetrics._avg.passRate || 0) * 100) / 100,
      },
    };
  }
}
