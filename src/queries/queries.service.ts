import { Injectable, Logger, NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
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

  private readonly DEFAULT_DAILY_TOKEN_LIMIT = 10000; // 10k tokens/día (~5 queries con 4 modelos)

  /**
   * Obtiene el límite diario de tokens desde la configuración
   */
  private async getDailyTokenLimit(): Promise<number> {
    const setting = await this.prisma.appSettings.findUnique({
      where: { key: 'dailyTokenLimit' },
    });
    return setting ? parseInt(setting.value, 10) : this.DEFAULT_DAILY_TOKEN_LIMIT;
  }

  /**
   * Calcula los tokens consumidos por el usuario en el día actual
   */
  private async getDailyTokenUsage(userId: number): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Obtener todos los códigos generados hoy por el usuario
    const codes = await this.prisma.generatedCode.findMany({
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

    // Sumar todos los tokens consumidos
    const totalTokens = codes.reduce((sum, code) => {
      return sum + (code.tokenUsage?.totalTokens || 0);
    }, 0);

    const limit = await this.getDailyTokenLimit();
    this.logger.log(`📊 Usuario ${userId}: ${totalTokens.toLocaleString()}/${limit.toLocaleString()} tokens consumidos hoy`);

    return totalTokens;
  }

  /**
   * Obtiene los tokens restantes del día para el usuario
   */
  async getRemainingTokens(userId: number): Promise<{
    used: number;
    limit: number;
    remaining: number;
    isGenerationBlocked: boolean;
  }> {
    const [used, limit, isGenerationBlocked] = await Promise.all([
      this.getDailyTokenUsage(userId),
      this.getDailyTokenLimit(),
      this.isCodeGenerationBlocked(),
    ]);
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      isGenerationBlocked,
    };
  }

  /**
   * Verifica si la generación de código está bloqueada
   */
  private async isCodeGenerationBlocked(): Promise<boolean> {
    const setting = await this.prisma.appSettings.findUnique({
      where: { key: 'blockCodeGeneration' },
    });
    return setting?.value === 'true';
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
      // 0. Verificar si la generación de código está bloqueada
      const isBlocked = await this.isCodeGenerationBlocked();
      if (isBlocked) {
        this.logger.warn(`🚫 Generación de código bloqueada - Usuario ${userId} intentó generar`);
        throw new ServiceUnavailableException(
          'La generación de código está temporalmente deshabilitada. Por favor, intenta más tarde.',
        );
      }

      // 1. Verificar límite diario de tokens
      const [tokensUsed, tokenLimit] = await Promise.all([
        this.getDailyTokenUsage(userId),
        this.getDailyTokenLimit(),
      ]);

      if (tokensUsed >= tokenLimit) {
        throw new BadRequestException(
          `Has alcanzado el límite de ${tokenLimit.toLocaleString()} tokens por día. Has usado ${tokensUsed.toLocaleString()} tokens. Intenta mañana.`,
        );
      }

      const tokensRemaining = tokenLimit - tokensUsed;
      this.logger.log(`✅ Usuario tiene ${tokensRemaining.toLocaleString()} tokens disponibles`);

      // 2. Validar que el prompt solicita una función (ANTES de gastar tokens)
      const promptValidation = await this.llmService.validatePromptRequestsFunction(dto.userPrompt);
      if (!promptValidation.isValid) {
        throw new BadRequestException(
          `Tu solicitud no parece pedir una función JavaScript. ${promptValidation.reason}. Por favor, reformula tu prompt para solicitar una función específica.`,
        );
      }

      // 3. Generar código (después de validar el prompt)
      this.logger.log('🚀 Generando código con los modelos...');
      const llmResponses = await this.llmService.generateMultipleCodes({
        prompt: dto.userPrompt,
        provider: LlmProvider.OPENROUTER,
        models: dto.models,
      });

      this.logger.log(`${llmResponses.length} códigos generados exitosamente`);

      // 2. Calcular tokens consumidos en esta generación
      const tokensConsumedNow = llmResponses.reduce((sum, response) => {
        return sum + (response.totalTokens || 0);
      }, 0);

      // Verificar que no excedamos el límite después de esta generación
      if (tokensUsed + tokensConsumedNow > tokenLimit) {
        throw new BadRequestException(
          `Esta generación consumiría ${tokensConsumedNow.toLocaleString()} tokens, lo que excedería tu límite diario de ${tokenLimit.toLocaleString()} tokens. Actualmente has usado ${tokensUsed.toLocaleString()} tokens.`,
        );
      }

      this.logger.log(`📊 Tokens consumidos en esta generación: ${tokensConsumedNow.toLocaleString()}`);

      // 4. Solo si la generación fue exitosa, crear la consulta en BD
      const query = await this.prisma.userQuery.create({
        data: {
          userId,
          userPrompt: dto.userPrompt,
          promptCategory: dto.promptCategory,
          status: 'processing',
        },
      });

      this.logger.log(`Consulta creada con ID: ${query.id}`);

      // 5. Guardar cada código generado en la BD junto con su información de tokens
      const savedCodes = await Promise.all(
        llmResponses.map(async (response) => {
          // Crear el código generado
          const code = await this.prisma.generatedCode.create({
            data: {
              queryId: query.id,
              llmName: response.model,
              codeContent: response.code,
              generationTimeMs: response.generationTimeMs,
              generatedAt: response.generatedAt,
            },
          });

          // Si hay información de tokens, guardarla en la tabla token_usage
          if (response.totalTokens) {
            await this.prisma.tokenUsage.create({
              data: {
                codeId: code.id,
                provider: response.provider,
                model: response.model,
                promptTokens: response.promptTokens,
                completionTokens: response.completionTokens,
                totalTokens: response.totalTokens,
                estimatedCost: response.estimatedCost,
              },
            });
            this.logger.log(
              `📊 Tokens guardados para ${response.model}: ${response.totalTokens} tokens`
            );
          }

          return code;
        }),
      );

      this.logger.log(`${savedCodes.length} códigos guardados en BD`);

      // 6. Actualizar estado de la consulta
      await this.prisma.userQuery.update({
        where: { id: query.id },
        data: { status: 'completed' },
      });

      // 7. Notificar a los evaluadores que hay nuevo código para evaluar
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

      // 8. Retornar la consulta completa con los códigos
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
          generatedCodes: {
            include: {
              tokenUsage: true, // ← Incluir información de tokens
            },
          },
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
            tokenUsage: true, // ← Incluir información de tokens
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
        // ← NUEVO: Incluir información de tokens
        tokenUsage: code.tokenUsage ? {
          promptTokens: code.tokenUsage.promptTokens,
          completionTokens: code.tokenUsage.completionTokens,
          totalTokens: code.tokenUsage.totalTokens,
          estimatedCost: code.tokenUsage.estimatedCost,
        } : undefined,
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
        tokenUsage: true, // ← Incluir información de tokens
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