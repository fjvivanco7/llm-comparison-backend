import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { CreateQueryDto } from './dto/create-query.dto';
import { QueryResponseDto } from './dto/query-response.dto';
import { LlmProvider } from '../llm/dto/generate-code.dto';
import { ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class QueriesService {
  private readonly logger = new Logger(QueriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  private readonly DEFAULT_DAILY_LIMIT = 10;

  /**
   * Obtiene el límite diario de consultas desde la configuración
   */
  private async getDailyQueryLimit(): Promise<number> {
    const setting = await this.prisma.appSettings.findUnique({
      where: { key: 'dailyQueryLimit' },
    });
    return setting ? parseInt(setting.value, 10) : this.DEFAULT_DAILY_LIMIT;
  }

  /**
   * Cuenta las consultas del usuario en el día actual
   */
  private async getDailyQueryCount(userId: number): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const count = await this.prisma.userQuery.count({
      where: {
        userId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const limit = await this.getDailyQueryLimit();
    this.logger.log(`📊 Usuario ${userId}: ${count}/${limit} consultas hoy`);
    return count;
  }

  /**
   * Obtiene las consultas restantes del día para el usuario
   */
  async getRemainingQueries(userId: number): Promise<{ used: number; limit: number; remaining: number }> {
    const [used, limit] = await Promise.all([
      this.getDailyQueryCount(userId),
      this.getDailyQueryLimit(),
    ]);
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
    };
  }

  /**
   * Crea una nueva consulta y genera código con múltiples modelos
   */
  async createQuery(
    dto: CreateQueryDto,
    userId: number, // ← NUEVO parámetro
  ): Promise<QueryResponseDto> {
    this.logger.log(`Creando nueva consulta para usuario ${userId}: "${dto.userPrompt}"`);

    try {
      // 0. Verificar límite diario de consultas
      const [todayQueries, dailyLimit] = await Promise.all([
        this.getDailyQueryCount(userId),
        this.getDailyQueryLimit(),
      ]);
      if (todayQueries >= dailyLimit) {
        throw new BadRequestException(
          `Has alcanzado el límite de ${dailyLimit} consultas por día. Intenta mañana.`,
        );
      }

      // 1. Crear la consulta en la BD con userId
      const query = await this.prisma.userQuery.create({
        data: {
          userId, // ← NUEVO campo
          userPrompt: dto.userPrompt,
          promptCategory: dto.promptCategory,
          status: 'processing',
        },
      });

      this.logger.log(`Consulta creada con ID: ${query.id}`);

      // 2. Generar código con múltiples modelos en paralelo
      const llmResponses = await this.llmService.generateMultipleCodes({
        prompt: dto.userPrompt,
        provider: LlmProvider.OPENROUTER,
        models: dto.models,
      });

      this.logger.log(`${llmResponses.length} códigos generados exitosamente`);

      // 3. Validar que cada código sea una función
      this.logger.log('🔍 Validando que los códigos sean funciones...');
      for (const response of llmResponses) {
        const validation = await this.llmService.validateIsFunction(response.code);
        if (!validation.isValid) {
          throw new BadRequestException(
            `El código generado por ${response.model} no es una función válida: ${validation.reason}`,
          );
        }
      }
      this.logger.log('✅ Todos los códigos son funciones válidas');

      // 4. Guardar cada código generado en la BD
      const savedCodes = await Promise.all(
        llmResponses.map(async (response) => {
          return await this.prisma.generatedCode.create({
            data: {
              queryId: query.id,
              llmName: response.model,
              codeContent: response.code,
              generationTimeMs: response.generationTimeMs,
              generatedAt: response.generatedAt,
            },
          });
        }),
      );

      this.logger.log(`${savedCodes.length} códigos guardados en BD`);

      // 4. Actualizar estado de la consulta
      await this.prisma.userQuery.update({
        where: { id: query.id },
        data: { status: 'completed' },
      });

      // 5. Notificar a los evaluadores que hay nuevo código para evaluar
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true, email: true },
        });

        const developerName = user?.firstName && user?.lastName
          ? `${user.firstName} ${user.lastName}`
          : user?.email || 'Usuario';

        const notifications = await this.notificationsService.notifyNewCodeToEvaluate({
          queryId: query.id,
          userPrompt: dto.userPrompt,
          developerName,
          codesCount: savedCodes.length,
        });

        // Enviar notificaciones en tiempo real via WebSocket
        this.notificationsGateway.sendNotificationToEvaluators(notifications);

        this.logger.log(`${notifications.length} evaluadores notificados de nuevo código`);
      } catch (notificationError) {
        this.logger.error(`Error enviando notificaciones: ${notificationError.message}`);
        // No lanzamos error para no afectar la respuesta principal
      }

      // 6. Retornar la consulta completa con los códigos
      return await this.findOne(query.id, userId);
    } catch (error) {
      this.logger.error(`Error creando consulta: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene todas las consultas del usuario con paginación
   */
  async findAll(
    userId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: QueryResponseDto[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const skip = (page - 1) * limit;

    // Obtener total y datos en paralelo
    const [total, queries] = await Promise.all([
      this.prisma.userQuery.count({ where: { userId } }),
      this.prisma.userQuery.findMany({
        where: { userId },
        include: {
          generatedCodes: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: queries.map((query) => this.mapToResponseDto(query)),
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

  /**
   * Obtiene una consulta por ID (solo si pertenece al usuario)
   */
  async findOne(id: number, userId: number): Promise<QueryResponseDto> {
    const query = await this.prisma.userQuery.findFirst({
      where: {
        id,
        userId, // ← Verificar que pertenezca al usuario
      },
      include: {
        generatedCodes: {
          include: {
            metrics: true,
            qualitativeEvaluations: {  // ← AGREGAR ESTO
              include: {
                evaluator: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                evaluatedAt: 'desc',
              },
            },
          },
          orderBy: {
            generatedAt: 'asc',
          },
        },
      },
    });

    if (!query) {
      throw new NotFoundException(`Consulta con ID ${id} no encontrada`);
    }

    return this.mapToResponseDto(query);
  }

  /**
   * Elimina una consulta (solo si pertenece al usuario)
   */
  async remove(id: number, userId: number): Promise<void> {
    const query = await this.prisma.userQuery.findFirst({
      where: {
        id,
        userId, // ← Verificar que pertenezca al usuario
      },
    });

    if (!query) {
      throw new NotFoundException(`Consulta con ID ${id} no encontrada`);
    }

    await this.prisma.userQuery.delete({
      where: { id },
    });

    this.logger.log(`Consulta ${id} eliminada`);
  }

  /**
   * Mapea el modelo de Prisma a DTO de respuesta
   */
  private mapToResponseDto(query: any): QueryResponseDto {
    return {
      id: query.id,
      userPrompt: query.userPrompt,
      promptCategory: query.promptCategory,
      status: query.status,
      createdAt: query.createdAt,
      generatedCodes: query.generatedCodes.map((code: any) => ({
        id: code.id,
        llmName: code.llmName,
        codeContent: code.codeContent,
        generationTimeMs: code.generationTimeMs,
        generatedAt: code.generatedAt,
        metrics: code.metrics ? {
          id: code.metrics.id,
          codeId: code.metrics.codeId,
          passRate: code.metrics.passRate,
          errorHandlingScore: code.metrics.errorHandlingScore,
          runtimeErrorRate: code.metrics.runtimeErrorRate,
          avgExecutionTime: code.metrics.avgExecutionTime,
          memoryUsage: code.metrics.memoryUsage,
          algorithmicComplexity: code.metrics.algorithmicComplexity,
          cyclomaticComplexity: code.metrics.cyclomaticComplexity,
          linesOfCode: code.metrics.linesOfCode,
          nestingDepth: code.metrics.nestingDepth,
          cohesionScore: code.metrics.cohesionScore,
          xssVulnerabilities: code.metrics.xssVulnerabilities,
          injectionVulnerabilities: code.metrics.injectionVulnerabilities,
          hardcodedSecrets: code.metrics.hardcodedSecrets,
          unsafeOperations: code.metrics.unsafeOperations,
          totalScore: code.metrics.totalScore,
          analyzedAt: code.metrics.analyzedAt,
        } : undefined,
        // ← AGREGAR EVALUACIONES CUALITATIVAS
        qualitativeEvaluations: code.qualitativeEvaluations?.map((evaluation: any) => ({
          id: evaluation.id,
          codeId: evaluation.codeId,
          evaluatorId: evaluation.evaluatorId,
          evaluatorName: evaluation.evaluator.firstName && evaluation.evaluator.lastName
            ? `${evaluation.evaluator.firstName} ${evaluation.evaluator.lastName}`
            : evaluation.evaluator.email,
          readabilityScore: evaluation.readabilityScore,
          clarityScore: evaluation.clarityScore,
          structureScore: evaluation.structureScore,
          documentationScore: evaluation.documentationScore,
          totalScore: evaluation.totalScore,
          generalComments: evaluation.generalComments,
          readabilityComments: evaluation.readabilityComments,
          clarityComments: evaluation.clarityComments,
          structureComments: evaluation.structureComments,
          documentationComments: evaluation.documentationComments,
          problemTags: evaluation.problemTags || [],
          evaluatedAt: evaluation.evaluatedAt,
        })) || [],
      })),
    };
  }

  /**
   * Obtener un código generado específico por su ID
   */
  async getCodeById(codeId: number, userId: number, userRole?: string) {
    const code = await this.prisma.generatedCode.findUnique({
      where: { id: codeId },
      include: {
        query: {
          select: {
            id: true,
            userId: true,
            userPrompt: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        metrics: true,
        qualitativeEvaluations: {
          include: {
            evaluator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!code) {
      throw new NotFoundException('Código no encontrado');
    }
    const isEvaluatorOrAdmin = userRole === 'EVALUATOR' || userRole === 'ADMIN';
    const isOwner = code.query.userId === userId;

    if (!isEvaluatorOrAdmin && !isOwner) {
      throw new ForbiddenException('No tienes permiso para ver este código');
    }

    // Agregar developerName al objeto de retorno
    return {
      ...code,
      developerName: code.query.user.firstName && code.query.user.lastName
        ? `${code.query.user.firstName} ${code.query.user.lastName}`
        : code.query.user.email,
      developerId: code.query.user.id,
    };
  }


}