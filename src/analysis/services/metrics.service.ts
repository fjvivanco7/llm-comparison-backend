import { Injectable, Logger } from '@nestjs/common';
import * as escomplex from 'escomplex';

export interface CodeMetrics {
  // Mantenibilidad
  cyclomaticComplexity: number;
  linesOfCode: number;
  nestingDepth: number;
  cohesionScore: number;

  // Información adicional
  numberOfFunctions: number;
  maintainabilityIndex: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  /**
   * Analiza métricas de mantenibilidad usando escomplex
   */
  analyzeCodeMetrics(code: string): CodeMetrics {
    try {
      // Analizar código con escomplex
      const analysis = escomplex.analyse(code);

      this.logger.log(`Métricas calculadas: Complejidad=${analysis.aggregate.cyclomatic}`);

      return {
        cyclomaticComplexity: analysis.aggregate.cyclomatic,
        linesOfCode: analysis.aggregate.sloc.physical,
        nestingDepth: this.calculateNestingDepth(code),
        cohesionScore: this.calculateCohesion(code),
        numberOfFunctions: analysis.functions?.length || 0,
        maintainabilityIndex: analysis.maintainability || 0,
      };

    } catch (error) {
      this.logger.error(`Error analizando métricas: ${error.message}`);

      // Fallback: análisis básico manual
      return this.basicMetricsAnalysis(code);
    }
  }

  /**
   * Calcula profundidad de anidamiento manualmente
   */
  private calculateNestingDepth(code: string): number {
    const lines = code.split('\n');
    let maxDepth = 0;
    let currentDepth = 0;

    for (const line of lines) {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;

      currentDepth += openBraces - closeBraces;
      maxDepth = Math.max(maxDepth, currentDepth);
    }

    return maxDepth;
  }

  /**
   * Calcula cohesión del código (responsabilidad única)
   */
  private calculateCohesion(code: string): number {
    // Detectar múltiples responsabilidades
    const responsibilities = [
      /save.*database|insert.*db|update.*db/gi.test(code),
      /send.*email|notify|alert/gi.test(code),
      /validate.*input|check.*valid/gi.test(code),
      /calculate|compute|process/gi.test(code),
      /format.*output|render|display/gi.test(code),
    ].filter(Boolean).length;

    // Score: 100 si 1 responsabilidad, decrece con más
    return Math.max(0, 100 - (responsibilities - 1) * 20);
  }

  /**
   * Análisis básico si escomplex falla
   */
  private basicMetricsAnalysis(code: string): CodeMetrics {
    const lines = code.split('\n').filter(l => l.trim().length > 0);

    const decisions = [
      ...code.matchAll(/\bif\b/g),
      ...code.matchAll(/\bwhile\b/g),
      ...code.matchAll(/\bfor\b/g),
      ...code.matchAll(/\bcase\b/g),
      ...code.matchAll(/&&/g),
      ...code.matchAll(/\|\|/g),
    ].length;

    return {
      cyclomaticComplexity: 1 + decisions,
      linesOfCode: lines.length,
      nestingDepth: this.calculateNestingDepth(code),
      cohesionScore: this.calculateCohesion(code),
      numberOfFunctions: (code.match(/function\s+\w+/g) || []).length,
      maintainabilityIndex: 100 - decisions * 5,
    };
  }
}