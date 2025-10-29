// src/comparison/comparison.service.ts

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryComparisonDto, LlmComparison } from './dto/comparison-result.dto';
import { GlobalRankingDto, LlmRankingDto } from './dto/ranking.dto';
import { ComparisonStatsDto } from './dto/stats.dto';

@Injectable()
export class ComparisonService {
  private readonly logger = new Logger(ComparisonService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compara todos los LLMs de una consulta específica
   */
  async compareQuery(queryId: number): Promise<QueryComparisonDto> {
    this.logger.log(`Comparando LLMs para consulta ${queryId}`);

    // Obtener la consulta con sus códigos y métricas
    const query = await this.prisma.userQuery.findUnique({
      where: { id: queryId },
      include: {
        generatedCodes: {
          include: {
            metrics: true,
          },
        },
      },
    });

    if (!query) {
      throw new NotFoundException(`Consulta ${queryId} no encontrada`);
    }

    if (query.generatedCodes.length === 0) {
      throw new NotFoundException(
        `No hay códigos generados para consulta ${queryId}`,
      );
    }

    // Filtrar códigos que tienen métricas
    const codesWithMetrics = query.generatedCodes.filter(
      (code) => code.metrics !== null,
    );

    if (codesWithMetrics.length === 0) {
      throw new NotFoundException(
        `No hay códigos analizados para consulta ${queryId}. Ejecuta el análisis primero.`,
      );
    }

    // Crear comparaciones
    const comparisons: LlmComparison[] = codesWithMetrics
      .map((code) => ({
        llmName: code.llmName,
        codeId: code.id,
        codeSnippet: this.getCodeSnippet(code.codeContent),
        totalScore: code.metrics?.totalScore || 0,
        categoryScores: this.extractCategoryScores(code.metrics),
        rank: 0, // Se calculará después
      }))
      .sort((a, b) => b.totalScore - a.totalScore); // Ordenar por score

    // Asignar rankings
    comparisons.forEach((comp, index) => {
      comp.rank = index + 1;
    });

    // Determinar ganador
    const winner = comparisons[0];
    const winnerReason = this.generateWinnerReason(winner, comparisons);

    // Calcular spread
    const scores = comparisons.map((c) => c.totalScore);
    const scoreSpread = Math.max(...scores) - Math.min(...scores);

    return {
      queryId: query.id,
      userPrompt: query.userPrompt,
      createdAt: query.createdAt,
      llmComparisons: comparisons,
      winner: {
        llmName: winner.llmName,
        totalScore: winner.totalScore,
        reason: winnerReason,
      },
      scoreSpread,
    };
  }

  /**
   * Obtiene el ganador de una consulta
   */
  async getWinner(queryId: number) {
    const comparison = await this.compareQuery(queryId);
    return comparison.winner;
  }

  /**
   * Genera ranking global de todos los LLMs
   */
  async getGlobalRanking(): Promise<GlobalRankingDto> {
    this.logger.log('Generando ranking global de LLMs');

    // Obtener todos los códigos con métricas
    const allCodes = await this.prisma.generatedCode.findMany({
      include: {
        metrics: true,
      },
      where: {
        metrics: {
          isNot: null,
        },
      },
    });

    if (allCodes.length === 0) {
      return {
        ranking: [],
        totalQueries: 0,
        totalCodesAnalyzed: 0,
        generatedAt: new Date(),
      };
    }

    // Agrupar por LLM
    const llmGroups = this.groupByLlm(allCodes);

    // Calcular estadísticas por LLM
    const rankings: LlmRankingDto[] = await Promise.all(
      Object.entries(llmGroups).map(async ([llmName, codes]) => {
        // Tipar explícitamente codes
        const typedCodes = codes as typeof allCodes;
        const metrics = typedCodes
          .map((c) => c.metrics)
          .filter((m) => m !== null);

        return {
          llmName,
          totalAnalyzed: typedCodes.length,
          avgTotalScore: this.calculateAverage(
            metrics.map((m) => m.totalScore || 0),
          ),
          avgCategoryScores: {
            correction: this.calculateAverage(
              metrics.map((m) => this.calculateCorrectionScore(m)),
            ),
            efficiency: this.calculateAverage(
              metrics.map((m) => this.calculateEfficiencyScore(m)),
            ),
            maintainability: this.calculateAverage(
              metrics.map((m) => this.calculateMaintainabilityScore(m)),
            ),
            security: this.calculateAverage(
              metrics.map((m) => this.calculateSecurityScore(m)),
            ),
          },
          wins: await this.countWins(llmName),
          overallRank: 0, // Se asignará después
        };
      }),
    );

    // Ordenar por score promedio y asignar ranking
    rankings.sort((a, b) => b.avgTotalScore - a.avgTotalScore);
    rankings.forEach((rank, index) => {
      rank.overallRank = index + 1;
    });

    // Contar queries únicas
    const uniqueQueries = new Set(allCodes.map((c) => c.queryId)).size;

    return {
      ranking: rankings,
      totalQueries: uniqueQueries,
      totalCodesAnalyzed: allCodes.length,
      generatedAt: new Date(),
    };
  }

  /**
   * Obtiene estadísticas de comparación
   */
  async getStats(): Promise<ComparisonStatsDto> {
    this.logger.log('Generando estadísticas de comparación');

    const ranking = await this.getGlobalRanking();

    if (ranking.ranking.length === 0) {
      throw new NotFoundException(
        'No hay datos suficientes para generar estadísticas',
      );
    }

    // Mejor por categoría
    const bestByCategory = {
      correction: this.findBestInCategory(ranking.ranking, 'correction'),
      efficiency: this.findBestInCategory(ranking.ranking, 'efficiency'),
      maintainability: this.findBestInCategory(
        ranking.ranking,
        'maintainability',
      ),
      security: this.findBestInCategory(ranking.ranking, 'security'),
    };

    // Más consistente (menor desviación estándar)
    const mostConsistent = await this.findMostConsistent();

    // Stats generales
    const avgScoreAllLlms =
      ranking.ranking.reduce((sum, r) => sum + r.avgTotalScore, 0) /
      ranking.ranking.length;

    return {
      bestByCategory,
      mostConsistent,
      overall: {
        totalQueries: ranking.totalQueries,
        totalCodes: ranking.totalCodesAnalyzed,
        avgScoreAllLlms,
      },
    };
  }

  // ============================================
  // MÉTODOS AUXILIARES
  // ============================================

  private getCodeSnippet(code: string, maxLength = 100): string {
    return code.length > maxLength
      ? code.substring(0, maxLength) + '...'
      : code;
  }

  private extractCategoryScores(metrics: any) {
    return {
      correction: this.calculateCorrectionScore(metrics),
      efficiency: this.calculateEfficiencyScore(metrics),
      maintainability: this.calculateMaintainabilityScore(metrics),
      security: this.calculateSecurityScore(metrics),
    };
  }

  private calculateCorrectionScore(metrics: any): number {
    if (!metrics) return 0;
    const scores = [
      metrics.passRate || 0,
      metrics.errorHandlingScore || 0,
      100 - (metrics.runtimeErrorRate || 0),
    ];
    return scores.reduce((a, b) => a + b, 0) / 3;
  }

  private calculateEfficiencyScore(metrics: any): number {
    if (!metrics) return 0;
    return (
      Math.max(0, 100 - (metrics.avgExecutionTime || 0) * 10) * 0.4 +
      Math.max(0, 100 - (metrics.memoryUsage || 0) * 0.5) * 0.3 +
      (metrics.algorithmicComplexity === 1
        ? 100
        : metrics.algorithmicComplexity === 2
          ? 80
          : 60) *
        0.3
    );
  }

  private calculateMaintainabilityScore(metrics: any): number {
    if (!metrics) return 0;
    return (
      Math.max(0, 100 - (metrics.cyclomaticComplexity - 1) * 10) * 0.35 +
      (metrics.linesOfCode < 10 ? 100 : metrics.linesOfCode < 20 ? 90 : 80) *
        0.15 +
      Math.max(0, 100 - (metrics.nestingDepth - 1) * 20) * 0.25 +
      (metrics.cohesionScore || 100) * 0.25
    );
  }

  private calculateSecurityScore(metrics: any): number {
    if (!metrics) return 0;
    return Math.max(
      0,
      100 -
        (metrics.injectionVulnerabilities || 0) * 25 -
        (metrics.xssVulnerabilities || 0) * 20 -
        (metrics.hardcodedSecrets || 0) * 15 -
        (metrics.unsafeOperations || 0) * 10,
    );
  }

  private generateWinnerReason(
    winner: LlmComparison,
    all: LlmComparison[],
  ): string {
    const categories = [
      'correction',
      'efficiency',
      'maintainability',
      'security',
    ];
    const strengths = categories.filter((cat) => {
      const winnerScore = winner.categoryScores[cat];
      const avgOthers =
        all
          .filter((c) => c.llmName !== winner.llmName)
          .reduce((sum, c) => sum + c.categoryScores[cat], 0) /
        (all.length - 1);
      return winnerScore > avgOthers + 5; // 5 puntos de ventaja
    });

    if (strengths.length > 0) {
      return `Destaca en: ${strengths.join(', ')}`;
    }
    return 'Score general más alto';
  }

  private groupByLlm(codes: any[]) {
    return codes.reduce((groups, code) => {
      if (!groups[code.llmName]) {
        groups[code.llmName] = [];
      }
      groups[code.llmName].push(code);
      return groups;
    }, {});
  }

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  private async countWins(llmName: string): Promise<number> {
    // Contar cuántas veces este LLM tuvo el score más alto en su query
    const queries = await this.prisma.userQuery.findMany({
      include: {
        generatedCodes: {
          include: {
            metrics: true,
          },
        },
      },
    });

    let wins = 0;
    for (const query of queries) {
      const codesWithMetrics = query.generatedCodes.filter((c) => c.metrics);
      if (codesWithMetrics.length === 0) continue;

      const bestCode = codesWithMetrics.reduce((best, current) =>
        (current.metrics?.totalScore || 0) > (best.metrics?.totalScore || 0)
          ? current
          : best,
      );

      if (bestCode.llmName === llmName) wins++;
    }

    return wins;
  }

  private findBestInCategory(
    rankings: LlmRankingDto[],
    category: keyof LlmRankingDto['avgCategoryScores'],
  ) {
    const best = rankings.reduce((best, current) =>
      current.avgCategoryScores[category] > best.avgCategoryScores[category]
        ? current
        : best,
    );

    return {
      llmName: best.llmName,
      avgScore: best.avgCategoryScores[category],
    };
  }

  private async findMostConsistent() {
    // Calcular desviación estándar de scores por LLM
    const allCodes = await this.prisma.generatedCode.findMany({
      include: { metrics: true },
      where: { metrics: { isNot: null } },
    });

    const llmGroups = this.groupByLlm(allCodes);

    const stdDevs = Object.entries(llmGroups).map(
      ([llmName, codes]: [string, any[]]) => {
        const scores = codes.map((c) => c.metrics?.totalScore || 0);
        const avg = this.calculateAverage(scores);
        const variance =
          scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) /
          scores.length;
        const stdDev = Math.sqrt(variance);

        return { llmName, stdDeviation: stdDev };
      },
    );

    return stdDevs.reduce((best, current) =>
      current.stdDeviation < best.stdDeviation ? current : best,
    );
  }
}
