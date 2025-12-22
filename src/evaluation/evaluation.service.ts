import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
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

    // Calcular score total (promedio de las 4 categorías)
    const totalScore =
      (dto.readabilityScore +
        dto.clarityScore +
        dto.structureScore +
        dto.documentationScore) /
      4;

    // Crear evaluación
    const evaluation = await this.prisma.qualitativeEvaluation.create({
      data: {
        codeId,
        evaluatorId,
        readabilityScore: dto.readabilityScore,
        clarityScore: dto.clarityScore,
        structureScore: dto.structureScore,
        documentationScore: dto.documentationScore,
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
}