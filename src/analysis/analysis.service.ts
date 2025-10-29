import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from './services/metrics.service';
import { SecurityService } from './services/security.service';
import { ExecutionService, TestCase } from './services/execution.service';

export interface CompleteAnalysis {
  codeId: number;

  // MÉTRICAS POR CATEGORÍA
  correction: {
    passRate: number;
    errorHandlingScore: number;
    runtimeErrorRate: number;
    categoryScore: number;
  };

  efficiency: {
    avgExecutionTime: number;
    memoryUsage: number;
    algorithmicComplexity: number;
    categoryScore: number;
  };

  maintainability: {
    cyclomaticComplexity: number;
    linesOfCode: number;
    nestingDepth: number;
    cohesionScore: number;
    categoryScore: number;
  };

  security: {
    xssVulnerabilities: number;
    injectionVulnerabilities: number;
    hardcodedSecrets: number;
    unsafeOperations: number;
    categoryScore: number;
  };

  // SCORES FINALES
  totalScore: number;
  analyzedAt: Date;
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricsService: MetricsService,
    private readonly securityService: SecurityService,
    private readonly executionService: ExecutionService,
  ) {}

  /**
   * Analiza un código específico y guarda resultados
   */
  async analyzeCode(
    codeId: number,
    testCases?: TestCase[],
  ): Promise<CompleteAnalysis> {
    this.logger.log(`Iniciando análisis de código ID: ${codeId}`);

    try {
      // 1. Obtener el código de la BD
      const generatedCode = await this.prisma.generatedCode.findUnique({
        where: { id: codeId },
      });

      if (!generatedCode) {
        throw new NotFoundException(`Código con ID ${codeId} no encontrado`);
      }

      const code = generatedCode.codeContent;

      // 2. Análisis de métricas de mantenibilidad
      this.logger.log('Analizando métricas de mantenibilidad...');
      const metricsAnalysis = this.metricsService.analyzeCodeMetrics(code);

      // 3. Análisis de seguridad
      this.logger.log('Analizando vulnerabilidades de seguridad...');
      const securityAnalysis =
        await this.securityService.analyzeSecurityIssues(code);

      // 4. Análisis de ejecución (si hay casos de prueba)
      this.logger.log('Ejecutando casos de prueba...');
      const executionAnalysis =
        testCases && testCases.length > 0
          ? await this.executionService.executeWithTests(code, testCases)
          : await this.executionService.executeWithTests(
              code,
              this.executionService.generateBasicTestCases(code),
            );

      // 5. Calcular scores por categoría
      const correctionScore = this.calculateCorrectionScore(executionAnalysis);
      const efficiencyScore = this.calculateEfficiencyScore(executionAnalysis);
      const maintainabilityScore =
        this.calculateMaintainabilityScore(metricsAnalysis);
      const securityScore = securityAnalysis.securityScore;

      // 6. Calcular score total (ponderado)
      const totalScore = this.calculateTotalScore({
        correctionScore,
        efficiencyScore,
        maintainabilityScore,
        securityScore,
      });

      // 7. Guardar métricas en BD
      await this.saveMetricsToDB(codeId, {
        ...executionAnalysis,
        ...metricsAnalysis,
        ...securityAnalysis,
        correctionScore,
        efficiencyScore,
        maintainabilityScore,
        securityScore,
        totalScore,
      });

      // 8. Guardar detalles de pruebas
      await this.saveTestResults(codeId, executionAnalysis.testResults);

      // 9. Guardar vulnerabilidades encontradas
      await this.saveSecurityFindings(codeId, securityAnalysis.issues);

      this.logger.log(
        `Análisis completado. Score total: ${totalScore.toFixed(2)}`,
      );

      // 10. Retornar análisis completo
      return {
        codeId,
        correction: {
          passRate: executionAnalysis.passRate,
          errorHandlingScore: executionAnalysis.errorHandlingScore,
          runtimeErrorRate: executionAnalysis.runtimeErrorRate,
          categoryScore: correctionScore,
        },
        efficiency: {
          avgExecutionTime: executionAnalysis.avgExecutionTime,
          memoryUsage: executionAnalysis.memoryUsage,
          algorithmicComplexity: executionAnalysis.algorithmicComplexity,
          categoryScore: efficiencyScore,
        },
        maintainability: {
          cyclomaticComplexity: metricsAnalysis.cyclomaticComplexity,
          linesOfCode: metricsAnalysis.linesOfCode,
          nestingDepth: metricsAnalysis.nestingDepth,
          cohesionScore: metricsAnalysis.cohesionScore,
          categoryScore: maintainabilityScore,
        },
        security: {
          xssVulnerabilities: securityAnalysis.xssVulnerabilities,
          injectionVulnerabilities: securityAnalysis.injectionVulnerabilities,
          hardcodedSecrets: securityAnalysis.hardcodedSecrets,
          unsafeOperations: securityAnalysis.unsafeOperations,
          categoryScore: securityScore,
        },
        totalScore,
        analyzedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error analizando código: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analiza todos los códigos de una consulta
   */
  async analyzeQuery(queryId: number): Promise<CompleteAnalysis[]> {
    this.logger.log(`Analizando todos los códigos de la consulta ${queryId}`);

    // Obtener todos los códigos de la consulta
    const codes = await this.prisma.generatedCode.findMany({
      where: { queryId },
    });

    if (codes.length === 0) {
      throw new NotFoundException(
        `No se encontraron códigos para la consulta ${queryId}`,
      );
    }

    // Analizar cada código en paralelo
    const analyses = await Promise.all(
      codes.map((code) => this.analyzeCode(code.id)),
    );

    this.logger.log(`${analyses.length} códigos analizados exitosamente`);
    return analyses;
  }

  /**
   * Obtiene métricas de un código
   */
  async getMetrics(codeId: number) {
    const metrics = await this.prisma.codeMetrics.findUnique({
      where: { codeId },
      include: {
        code: {
          select: {
            llmName: true,
            codeContent: true,
          },
        },
      },
    });

    if (!metrics) {
      throw new NotFoundException(
        `Métricas no encontradas para código ${codeId}`,
      );
    }

    // Transformar a formato categorizado
    return {
      codeId: metrics.codeId,
      llmName: metrics.code.llmName,
      codeContent: metrics.code.codeContent,

      correction: {
        passRate: metrics.passRate,
        errorHandlingScore: metrics.errorHandlingScore,
        runtimeErrorRate: metrics.runtimeErrorRate,
      },

      efficiency: {
        avgExecutionTime: metrics.avgExecutionTime,
        memoryUsage: metrics.memoryUsage,
        algorithmicComplexity: metrics.algorithmicComplexity,
      },

      maintainability: {
        cyclomaticComplexity: metrics.cyclomaticComplexity,
        linesOfCode: metrics.linesOfCode,
        nestingDepth: metrics.nestingDepth,
        cohesionScore: metrics.cohesionScore,
      },

      security: {
        xssVulnerabilities: metrics.xssVulnerabilities,
        injectionVulnerabilities: metrics.injectionVulnerabilities,
        hardcodedSecrets: metrics.hardcodedSecrets,
        unsafeOperations: metrics.unsafeOperations,
      },

      totalScore: metrics.totalScore,
      analyzedAt: metrics.analyzedAt,
    };
  }

  /**
   * Calcula score de corrección (40% del total)
   */
  private calculateCorrectionScore(execution: any): number {
    return (
      execution.passRate * 0.6 +
      execution.errorHandlingScore * 0.3 +
      (100 - execution.runtimeErrorRate) * 0.1
    );
  }

  /**
   * Calcula score de eficiencia (25% del total)
   */
  private calculateEfficiencyScore(execution: any): number {
    // Normalizar tiempo de ejecución (menos es mejor)
    const timeScore = Math.max(0, 100 - execution.avgExecutionTime * 10);

    // Normalizar memoria (menos es mejor)
    const memoryScore = Math.max(0, 100 - execution.memoryUsage * 5);

    // Complejidad (menos es mejor)
    const complexityScore =
      execution.algorithmicComplexity === 1
        ? 100
        : execution.algorithmicComplexity === 2
          ? 80
          : 60;

    return timeScore * 0.4 + memoryScore * 0.3 + complexityScore * 0.3;
  }

  /**
   * Calcula score de mantenibilidad (20% del total)
   */
  private calculateMaintainabilityScore(metrics: any): number {
    // Complejidad ciclomática (menos es mejor)
    const complexityScore = Math.max(
      0,
      100 - (metrics.cyclomaticComplexity - 1) * 10,
    );

    // Líneas de código (menos es mejor, pero penalizar demasiado poco)
    const locScore =
      metrics.linesOfCode < 10
        ? 100
        : metrics.linesOfCode < 20
          ? 90
          : metrics.linesOfCode < 50
            ? 80
            : 70;

    // Profundidad de anidamiento (menos es mejor)
    const nestingScore = Math.max(0, 100 - (metrics.nestingDepth - 1) * 20);

    // Cohesión (más es mejor)
    const cohesionScore = metrics.cohesionScore;

    return (
      complexityScore * 0.35 +
      locScore * 0.15 +
      nestingScore * 0.25 +
      cohesionScore * 0.25
    );
  }

  /**
   * Calcula score total ponderado (15% del total)
   */
  private calculateTotalScore(scores: {
    correctionScore: number;
    efficiencyScore: number;
    maintainabilityScore: number;
    securityScore: number;
  }): number {
    return (
      scores.correctionScore * 0.4 +
      scores.efficiencyScore * 0.25 +
      scores.maintainabilityScore * 0.2 +
      scores.securityScore * 0.15
    );
  }

  /**
   * Guarda métricas en la base de datos
   */
  private async saveMetricsToDB(codeId: number, data: any) {
    await this.prisma.codeMetrics.upsert({
      where: { codeId },
      create: {
        codeId,
        passRate: data.passRate,
        errorHandlingScore: data.errorHandlingScore,
        runtimeErrorRate: data.runtimeErrorRate,
        avgExecutionTime: data.avgExecutionTime,
        memoryUsage: data.memoryUsage,
        algorithmicComplexity: data.algorithmicComplexity,
        cyclomaticComplexity: data.cyclomaticComplexity,
        linesOfCode: data.linesOfCode,
        nestingDepth: data.nestingDepth,
        cohesionScore: data.cohesionScore,
        xssVulnerabilities: data.xssVulnerabilities,
        injectionVulnerabilities: data.injectionVulnerabilities,
        hardcodedSecrets: data.hardcodedSecrets,
        unsafeOperations: data.unsafeOperations,
        totalScore: data.totalScore,
      },
      update: {
        passRate: data.passRate,
        errorHandlingScore: data.errorHandlingScore,
        runtimeErrorRate: data.runtimeErrorRate,
        avgExecutionTime: data.avgExecutionTime,
        memoryUsage: data.memoryUsage,
        algorithmicComplexity: data.algorithmicComplexity,
        cyclomaticComplexity: data.cyclomaticComplexity,
        linesOfCode: data.linesOfCode,
        nestingDepth: data.nestingDepth,
        cohesionScore: data.cohesionScore,
        xssVulnerabilities: data.xssVulnerabilities,
        injectionVulnerabilities: data.injectionVulnerabilities,
        hardcodedSecrets: data.hardcodedSecrets,
        unsafeOperations: data.unsafeOperations,
        totalScore: data.totalScore,
        analyzedAt: new Date(),
      },
    });
  }

  /**
   * Guarda resultados de pruebas
   */
  private async saveTestResults(codeId: number, testResults: any[]) {
    // Eliminar resultados anteriores
    await this.prisma.testExecution.deleteMany({
      where: { codeId },
    });

    // Guardar nuevos resultados
    await this.prisma.testExecution.createMany({
      data: testResults.map((result, index) => ({
        codeId,
        testCaseNumber: index + 1,
        testInput: result.input,
        expectedOutput: String(result.expectedOutput),
        actualOutput: String(result.actualOutput),
        passed: result.passed,
        executionTimeMs: result.executionTime,
        errorMessage: result.error,
      })),
    });
  }

  /**
   * Guarda vulnerabilidades encontradas
   */
  private async saveSecurityFindings(codeId: number, issues: any[]) {
    // Eliminar findings anteriores
    await this.prisma.securityFinding.deleteMany({
      where: { codeId },
    });

    // Guardar nuevos findings
    if (issues.length > 0) {
      await this.prisma.securityFinding.createMany({
        data: issues.map((issue) => ({
          codeId,
          vulnerabilityType: issue.type,
          severity: issue.severity,
          lineNumber: issue.lineNumber,
          patternMatched: issue.pattern,
          description: issue.message,
        })),
      });
    }
  }
}
