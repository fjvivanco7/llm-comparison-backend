import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEvaluationDto, PROBLEM_TAGS, SCORE_RUBRICS } from './dto/create-evaluation.dto';
import { CreateComparativeEvaluationDto } from './dto/comparative-evaluation.dto';
import { EvaluationResponseDto } from './dto/evaluation-response.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crear una evaluación cualitativa (solo evaluadores)
   */
  async createEvaluation(
    codeId: number,
    evaluatorId: number,
    dto: CreateEvaluationDto,
  ): Promise<EvaluationResponseDto> {
    this.logger.log(
      `Evaluador ${evaluatorId} evaluando código ${codeId}`,
    );

    // Verificar que el código existe
    const code = await this.prisma.generatedCode.findUnique({
      where: { id: codeId },
    });

    if (!code) {
      throw new NotFoundException(`Código ${codeId} no encontrado`);
    }

    // Verificar que el evaluador tiene el rol correcto
    const evaluator = await this.prisma.user.findUnique({
      where: { id: evaluatorId },
    });

    if (!evaluator) {
      throw new NotFoundException(`Evaluador ${evaluatorId} no encontrado`);
    }

    if (evaluator.role !== UserRole.EVALUATOR && evaluator.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo evaluadores pueden crear evaluaciones cualitativas',
      );
    }

    // Verificar que no haya evaluado este código antes
    const existingEvaluation =
      await this.prisma.qualitativeEvaluation.findUnique({
        where: {
          codeId_evaluatorId: {
            codeId,
            evaluatorId,
          },
        },
      });

    if (existingEvaluation) {
      throw new ConflictException(
        'Ya has evaluado este código. Usa PUT para actualizar.',
      );
    }

    // Calcular score total incluyendo criterios nuevos si existen
    const scores = [
      dto.readabilityScore,
      dto.clarityScore,
      dto.structureScore,
      dto.documentationScore,
    ];

    // Agregar criterios opcionales si están presentes
    if (dto.functionalityScore) scores.push(dto.functionalityScore);
    if (dto.efficiencyScore) scores.push(dto.efficiencyScore);
    if (dto.errorHandlingScore) scores.push(dto.errorHandlingScore);
    if (dto.bestPracticesScore) scores.push(dto.bestPracticesScore);
    if (dto.securityScore) scores.push(dto.securityScore);

    const totalScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Crear evaluación
    const evaluation = await this.prisma.qualitativeEvaluation.create({
      data: {
        codeId,
        evaluatorId,
        readabilityScore: dto.readabilityScore,
        clarityScore: dto.clarityScore,
        structureScore: dto.structureScore,
        documentationScore: dto.documentationScore,
        // Nuevos criterios
        functionalityScore: dto.functionalityScore,
        efficiencyScore: dto.efficiencyScore,
        errorHandlingScore: dto.errorHandlingScore,
        bestPracticesScore: dto.bestPracticesScore,
        securityScore: dto.securityScore,
        // Problem tags
        problemTags: dto.problemTags || [],
        totalScore,
        generalComments: dto.generalComments,
        readabilityComments: dto.readabilityComments,
        clarityComments: dto.clarityComments,
        structureComments: dto.structureComments,
        documentationComments: dto.documentationComments,
      },
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
    });

    this.logger.log(
      `Evaluación creada exitosamente. Score: ${totalScore.toFixed(2)}`,
    );

    return this.mapToResponseDto(evaluation);
  }

  /**
   * Obtener todas las evaluaciones de un código
   */
  async getEvaluationsByCode(codeId: number): Promise<EvaluationResponseDto[]> {
    const evaluations = await this.prisma.qualitativeEvaluation.findMany({
      where: { codeId },
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
    });

    return evaluations.map((e) => this.mapToResponseDto(e));
  }

  /**
   * Obtener códigos pendientes de evaluar
   */
  async getPendingCodesForEvaluator(evaluatorId: number) {
    // Códigos que este evaluador NO ha evaluado aún
    const allCodes = await this.prisma.generatedCode.findMany({
      include: {
        query: {
          select: {
            id: true,
            userPrompt: true,
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
        qualitativeEvaluations: {
          where: {
            evaluatorId,
          },
        },
        metrics: true,
      },
      orderBy: {
        generatedAt: 'desc',
      },
    });

    // Filtrar solo los que no tienen evaluación de este evaluador
    const pendingCodes = allCodes.filter(
      (code) => code.qualitativeEvaluations.length === 0,
    );

    return pendingCodes.map((code) => ({
      id: code.id,
      llmName: code.llmName,
      codeContent: code.codeContent,
      queryId: code.query.id,
      userPrompt: code.query.userPrompt,
      generatedAt: code.generatedAt,
      hasMetrics: !!code.metrics,
      quantitativeScore: code.metrics?.totalScore || null,
      developerName: code.query.user.firstName && code.query.user.lastName
        ? `${code.query.user.firstName} ${code.query.user.lastName}`
        : code.query.user.email,
      developerId: code.query.user.id,
    }));
  }

  /**
   * Obtener estadísticas de evaluación cualitativa
   */
  async getEvaluationStats(evaluatorId?: number) {
    // Construir where clause
    const whereClause = evaluatorId ? { evaluatorId } : {};

    const totalEvaluations = await this.prisma.qualitativeEvaluation.count({
      where: whereClause,
    });

    const avgScores = await this.prisma.qualitativeEvaluation.aggregate({
      where: whereClause,
      _avg: {
        readabilityScore: true,
        clarityScore: true,
        structureScore: true,
        documentationScore: true,
        totalScore: true,
      },
    });

    // Mejor código según evaluaciones (del evaluador o global)
    const bestCode = await this.prisma.qualitativeEvaluation.findFirst({
      where: whereClause,
      orderBy: {
        totalScore: 'desc',
      },
      include: {
        code: {
          select: {
            id: true,
            llmName: true,
          },
        },
      },
    });

    // Ranking de modelos por evaluación cualitativa
    const evaluations = await this.prisma.qualitativeEvaluation.findMany({
      where: whereClause,
      select: {
        codeId: true,
        totalScore: true,
      },
    });

    const codesData = await this.prisma.generatedCode.findMany({
      where: {
        id: {
          in: evaluations.map((e) => e.codeId),
        },
      },
      select: {
        id: true,
        llmName: true,
      },
    });

    const modelScores = new Map<string, { total: number; sum: number }>();

    for (const evaluation of evaluations) {
      const code = codesData.find((c) => c.id === evaluation.codeId);
      if (code) {
        const existing = modelScores.get(code.llmName) || { total: 0, sum: 0 };
        existing.total++;
        existing.sum += evaluation.totalScore;
        modelScores.set(code.llmName, existing);
      }
    }

    const modelRanking = Array.from(modelScores.entries())
      .map(([llmName, data]) => ({
        llmName,
        avgQualitativeScore: data.sum / data.total,
        totalEvaluations: data.total,
      }))
      .sort((a, b) => b.avgQualitativeScore - a.avgQualitativeScore);

    return {
      totalEvaluations,
      averageScores: {
        readability: avgScores._avg.readabilityScore || 0,
        clarity: avgScores._avg.clarityScore || 0,
        structure: avgScores._avg.structureScore || 0,
        documentation: avgScores._avg.documentationScore || 0,
        total: avgScores._avg.totalScore || 0,
      },
      bestCode: bestCode
        ? {
          codeId: bestCode.code.id,
          llmName: bestCode.code.llmName,
          score: bestCode.totalScore,
        }
        : null,
      modelRanking,
    };
  }

  /**
   * Mapear a DTO de respuesta
   */
  private mapToResponseDto(evaluation: any): EvaluationResponseDto {
    return {
      id: evaluation.id,
      codeId: evaluation.codeId,
      evaluatorId: evaluation.evaluatorId,
      evaluatorName: evaluation.evaluator
        ? `${evaluation.evaluator.firstName || ''} ${evaluation.evaluator.lastName || ''}`.trim() ||
        evaluation.evaluator.email
        : 'Evaluador',
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
    };
  }

  /**
   * Obtener todas las evaluaciones de un evaluador específico
   */
  async getMyEvaluations(evaluatorId: number): Promise<EvaluationResponseDto[]> {
    const evaluations = await this.prisma.qualitativeEvaluation.findMany({
      where: { evaluatorId },
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
    });

    return evaluations.map((e) => this.mapToResponseDto(e));
  }

  // ============================================
  // EVALUACIÓN COMPARATIVA
  // ============================================

  /**
   * Obtener consultas disponibles para evaluación comparativa
   * Solo consultas con 2+ códigos que el evaluador no ha comparado
   */
  async getQueriesForComparison(evaluatorId: number) {
    // Obtener consultas con múltiples códigos
    const queries = await this.prisma.userQuery.findMany({
      where: {
        status: 'completed',
        generatedCodes: {
          some: {}, // Al menos un código
        },
      },
      include: {
        generatedCodes: {
          select: {
            id: true,
            llmName: true,
            codeContent: true,
            generatedAt: true,
          },
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Filtrar solo las que tienen 2+ códigos
    const queriesWithMultipleCodes = queries.filter(
      (q) => q.generatedCodes.length >= 2,
    );

    // Obtener comparaciones ya hechas por este evaluador
    const existingComparisons = await this.prisma.comparativeEvaluation.findMany({
      where: { evaluatorId },
      select: { queryId: true },
    });

    const comparedQueryIds = new Set(existingComparisons.map((c) => c.queryId));

    // Filtrar las que no ha comparado
    const pendingQueries = queriesWithMultipleCodes.filter(
      (q) => !comparedQueryIds.has(q.id),
    );

    return pendingQueries.map((q) => ({
      id: q.id,
      userPrompt: q.userPrompt,
      createdAt: q.createdAt,
      codesCount: q.generatedCodes.length,
      codes: q.generatedCodes.map((c) => ({
        id: c.id,
        llmName: c.llmName,
        codePreview: c.codeContent.substring(0, 200) + '...',
      })),
    }));
  }

  /**
   * Obtener detalle de una consulta para comparación side-by-side
   */
  async getQueryForComparison(queryId: number, evaluatorId: number) {
    const query = await this.prisma.userQuery.findUnique({
      where: { id: queryId },
      include: {
        generatedCodes: {
          include: {
            metrics: true,
            qualitativeEvaluations: {
              where: { evaluatorId },
            },
          },
        },
      },
    });

    if (!query) {
      throw new NotFoundException(`Consulta ${queryId} no encontrada`);
    }

    // Verificar si ya hizo una comparación
    const existingComparison = await this.prisma.comparativeEvaluation.findUnique({
      where: {
        queryId_evaluatorId: {
          queryId,
          evaluatorId,
        },
      },
    });

    return {
      id: query.id,
      userPrompt: query.userPrompt,
      createdAt: query.createdAt,
      codes: query.generatedCodes.map((code) => ({
        id: code.id,
        llmName: code.llmName,
        codeContent: code.codeContent,
        generatedAt: code.generatedAt,
        hasMetrics: !!code.metrics,
        quantitativeScore: code.metrics?.totalScore || null,
        hasEvaluation: code.qualitativeEvaluations.length > 0,
        evaluationScore: code.qualitativeEvaluations[0]?.totalScore || null,
      })),
      existingComparison: existingComparison
        ? {
            rankings: existingComparison.rankings,
            winnerId: existingComparison.winnerId,
            comparisonNotes: existingComparison.comparisonNotes,
          }
        : null,
    };
  }

  /**
   * Crear una evaluación comparativa
   */
  async createComparativeEvaluation(
    evaluatorId: number,
    dto: CreateComparativeEvaluationDto,
  ) {
    this.logger.log(
      `Evaluador ${evaluatorId} creando evaluación comparativa para query ${dto.queryId}`,
    );

    // Verificar que la consulta existe
    const query = await this.prisma.userQuery.findUnique({
      where: { id: dto.queryId },
      include: {
        generatedCodes: true,
      },
    });

    if (!query) {
      throw new NotFoundException(`Consulta ${dto.queryId} no encontrada`);
    }

    // Verificar que no haya hecho ya una comparación
    const existing = await this.prisma.comparativeEvaluation.findUnique({
      where: {
        queryId_evaluatorId: {
          queryId: dto.queryId,
          evaluatorId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Ya has realizado una comparación para esta consulta',
      );
    }

    // Verificar que el ganador está en los rankings
    if (dto.winnerId) {
      const winnerInRankings = dto.rankings.some((r) => r.codeId === dto.winnerId);
      if (!winnerInRankings) {
        throw new ForbiddenException('El ganador debe estar en los rankings');
      }
    }

    // Crear la evaluación comparativa
    const comparison = await this.prisma.comparativeEvaluation.create({
      data: {
        queryId: dto.queryId,
        evaluatorId,
        rankings: dto.rankings as any, // Convert to JSON
        winnerId: dto.winnerId || dto.rankings[0]?.codeId,
        comparisonNotes: dto.comparisonNotes,
      },
    });

    this.logger.log(
      `Evaluación comparativa creada. Ganador: código ${comparison.winnerId}`,
    );

    return comparison;
  }

  /**
   * Obtener mis evaluaciones comparativas
   */
  async getMyComparativeEvaluations(evaluatorId: number) {
    const comparisons = await this.prisma.comparativeEvaluation.findMany({
      where: { evaluatorId },
      orderBy: { evaluatedAt: 'desc' },
    });

    // Obtener info de las queries
    const queryIds = comparisons.map((c) => c.queryId);
    const queries = await this.prisma.userQuery.findMany({
      where: { id: { in: queryIds } },
      include: {
        generatedCodes: {
          select: {
            id: true,
            llmName: true,
          },
        },
      },
    });

    return comparisons.map((comp) => {
      const query = queries.find((q) => q.id === comp.queryId);
      const winnerCode = query?.generatedCodes.find((c) => c.id === comp.winnerId);

      return {
        id: comp.id,
        queryId: comp.queryId,
        userPrompt: query?.userPrompt || 'Consulta eliminada',
        rankings: comp.rankings,
        winnerId: comp.winnerId,
        winnerLlm: winnerCode?.llmName || null,
        comparisonNotes: comp.comparisonNotes,
        evaluatedAt: comp.evaluatedAt,
        codesCount: query?.generatedCodes.length || 0,
      };
    });
  }

  /**
   * Obtener rúbricas y tags disponibles
   */
  getRubricsAndTags() {
    return {
      rubrics: SCORE_RUBRICS,
      problemTags: PROBLEM_TAGS.map((tag) => ({
        id: tag,
        label: this.getTagLabel(tag),
      })),
    };
  }

  private getTagLabel(tag: string): string {
    const labels: Record<string, string> = {
      has_bugs: 'Tiene bugs',
      redundant_code: 'Código redundante',
      security_issue: 'Problema de seguridad',
      bad_practice: 'Mala práctica',
      missing_error_handling: 'Falta manejo de errores',
      incomplete_code: 'Código incompleto',
      poor_naming: 'Nombres poco descriptivos',
      no_comments: 'Sin comentarios',
      inefficient: 'Ineficiente',
      hard_to_read: 'Difícil de leer',
    };
    return labels[tag] || tag;
  }
}