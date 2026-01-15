import { Injectable, Logger } from '@nestjs/common';
import * as parser from '@typescript-eslint/typescript-estree';

export interface CodeMetrics {
  cyclomaticComplexity: number;
  linesOfCode: number;
  nestingDepth: number;
  cohesionScore: number;
  numberOfFunctions: number;
  maintainabilityIndex: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  /**
   * Analiza métricas de mantenibilidad con parser moderno
   */
  analyzeCodeMetrics(code: string): CodeMetrics {
    try {
      // ✅ Parsear con soporte COMPLETO para sintaxis moderna
      const ast = parser.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: false,
        },
      });

      const metrics = this.analyzeAST(ast, code);

      this.logger.log(
        `✅ Métricas calculadas: Complejidad=${metrics.cyclomaticComplexity}`,
      );

      return metrics;
    } catch (error) {
      // Fallback solo si el código tiene errores de sintaxis
      this.logger.warn(
        `⚠️  Parser falló (código con errores): ${error.message}`,
      );
      return this.basicMetricsAnalysis(code);
    }
  }

  /**
   * Analiza el AST para calcular métricas
   */
  private analyzeAST(ast: any, code: string): CodeMetrics {
    let cyclomaticComplexity = 1; // Base
    let numberOfFunctions = 0;
    let maxNestingDepth = 0;

    const traverse = (node: any, depth: number = 0) => {
      if (!node || typeof node !== 'object') return;

      // Actualizar profundidad máxima
      maxNestingDepth = Math.max(maxNestingDepth, depth);

      // Contar decisiones (complejidad ciclomática)
      if (
        node.type === 'IfStatement' ||
        node.type === 'WhileStatement' ||
        node.type === 'DoWhileStatement' ||
        node.type === 'ForStatement' ||
        node.type === 'ForInStatement' ||
        node.type === 'ForOfStatement' ||
        node.type === 'SwitchCase' ||
        node.type === 'ConditionalExpression' ||
        node.type === 'CatchClause'
      ) {
        cyclomaticComplexity++;
      }

      // Contar operadores lógicos
      if (node.type === 'LogicalExpression') {
        if (node.operator === '&&' || node.operator === '||') {
          cyclomaticComplexity++;
        }
      }

      // Contar funciones
      if (
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression'
      ) {
        numberOfFunctions++;
      }

      // Recorrer hijos con profundidad incrementada para bloques
      const shouldIncrementDepth =
        node.type === 'BlockStatement' ||
        node.type === 'IfStatement' ||
        node.type === 'WhileStatement' ||
        node.type === 'DoWhileStatement' ||
        node.type === 'ForStatement' ||
        node.type === 'ForInStatement' ||
        node.type === 'ForOfStatement' ||
        node.type === 'SwitchStatement';

      const newDepth = shouldIncrementDepth ? depth + 1 : depth;

      // Recorrer todas las propiedades del nodo
      for (const key in node) {
        if (key === 'type' || key === 'loc' || key === 'range' || key === 'parent') continue;
        const child = node[key];

        if (Array.isArray(child)) {
          child.forEach((c) => traverse(c, newDepth));
        } else if (child && typeof child === 'object') {
          traverse(child, newDepth);
        }
      }
    };

    // Iniciar recorrido desde el body
    if (ast.body && Array.isArray(ast.body)) {
      ast.body.forEach((node: any) => traverse(node, 0));
    } else {
      traverse(ast, 0);
    }

    const lines = code.split('\n').filter((l) => l.trim().length > 0);

    // Calcular índice de mantenibilidad
    const volume = lines.length * Math.log2(cyclomaticComplexity + 1);
    const maintainabilityIndex = Math.max(
      0,
      Math.min(
        100,
        171 - 5.2 * Math.log(volume + 1) - 0.23 * cyclomaticComplexity,
      ),
    );

    return {
      cyclomaticComplexity,
      linesOfCode: lines.length,
      nestingDepth: Math.max(1, maxNestingDepth),
      cohesionScore: this.calculateCohesion(code),
      numberOfFunctions: Math.max(1, numberOfFunctions),
      maintainabilityIndex: Math.round(maintainabilityIndex),
    };
  }

  /**
   * Calcula cohesión del código (responsabilidad única)
   */
  private calculateCohesion(code: string): number {
    const patterns = [
      /save.*database|insert.*db|update.*db/gi,
      /send.*email|notify|alert/gi,
      /validate.*input|check.*valid/gi,
      /calculate|compute|process|filter|sort|map/gi,
      /format.*output|render|display/gi,
    ];

    const responsibilities = patterns.filter((pattern) =>
      pattern.test(code),
    ).length;

    const finalResponsibilities = responsibilities === 0 ? 1 : responsibilities;
    const score = 100 - (finalResponsibilities - 1) * 20;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Análisis básico como fallback (solo si hay error de sintaxis)
   */
  private basicMetricsAnalysis(code: string): CodeMetrics {
    const cleanCode = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    const lines = cleanCode.split('\n').filter((l) => l.trim().length > 0);

    const ifStatements = (cleanCode.match(/\bif\b/g) || []).length;
    const whileLoops = (cleanCode.match(/\bwhile\b/g) || []).length;
    const forLoops = (cleanCode.match(/\bfor\b/g) || []).length;
    const cases = (cleanCode.match(/\bcase\b/g) || []).length;
    const ternaries = (cleanCode.match(/\?/g) || []).length;
    const logicalOps = (cleanCode.match(/&&|\|\|/g) || []).length;
    const catches = (cleanCode.match(/\bcatch\b/g) || []).length;

    const decisions =
      ifStatements +
      whileLoops +
      forLoops +
      cases +
      ternaries +
      logicalOps +
      catches;

    const functionDeclarations = (cleanCode.match(/function\s+\w+/g) || [])
      .length;
    const arrowFunctions = (cleanCode.match(/=>/g) || []).length;
    const totalFunctions = functionDeclarations + arrowFunctions;

    const volume = lines.length * Math.log2(decisions + 1);
    const maintainabilityIndex = Math.max(
      0,
      Math.min(100, 171 - 5.2 * Math.log(volume + 1) - 0.23 * decisions),
    );

    return {
      cyclomaticComplexity: 1 + decisions,
      linesOfCode: lines.length,
      nestingDepth: this.calculateNestingDepth(code),
      cohesionScore: this.calculateCohesion(code),
      numberOfFunctions: Math.max(1, totalFunctions),
      maintainabilityIndex: Math.round(maintainabilityIndex),
    };
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

    return Math.max(1, maxDepth);
  }
}