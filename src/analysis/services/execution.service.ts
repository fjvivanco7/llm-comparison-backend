import { Injectable, Logger } from '@nestjs/common';
import { TestGeneratorService } from './test-generator.service';
import { DockerExecutorService } from './docker-executor.service';

export interface TestCase {
  input: any[];
  expectedOutput: any;
  description?: string;
}

export interface TestResult {
  passed: boolean;
  input: any[];
  expectedOutput: any;
  actualOutput: any;
  executionTime: number;
  error?: string;
}

export interface ExecutionAnalysis {
  // Métricas de Corrección
  passRate: number;
  errorHandlingScore: number;
  runtimeErrorRate: number;

  // Métricas de Eficiencia
  avgExecutionTime: number;
  memoryUsage: number;
  algorithmicComplexity: number;

  // Detalles
  testResults: TestResult[];
  totalTests: number;
  passedTests: number;

  // Información de ejecución
  executedInDocker?: boolean;
  executionSkipped?: boolean;
  skipReason?: string;
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly testGenerator: TestGeneratorService,
    private readonly dockerExecutor: DockerExecutorService,
  ) {}

  /**
   * Ejecuta el código con casos de prueba INTELIGENTES en DOCKER
   */
  async executeWithTests(
    code: string,
    testCases?: TestCase[],
  ): Promise<ExecutionAnalysis> {
    try {
      // PASO 1: Generar test cases inteligentes con IA si no hay
      if (!testCases || testCases.length === 0) {
        this.logger.log('🤖 Generando test cases inteligentes con IA...');

        // Llamar a IA
        testCases = await this.testGenerator.generateIntelligentTestCases(code);

        // Fallback de emergencia si IA falla completamente
        if (!testCases || testCases.length === 0) {
          this.logger.error('❌ IA no generó test cases válidos');
          testCases = [
            {
              input: [],
              expectedOutput: undefined,
              description: 'Test case genérico (fallback de emergencia)',
            },
          ];
        } else {
          this.logger.log(`✅ ${testCases.length} test cases generados por IA`);
        }
      }

      this.logger.log(`📋 ${testCases.length} test cases listos para ejecución`);

      // PASO 2: Analizar código para detectar dependencias
      this.logger.log('🔍 Analizando dependencias del código...');
      const codeAnalysis = await this.testGenerator.analyzeCodeExecutability(code);

      this.logger.log(
        `📦 Dependencias detectadas: ${codeAnalysis.dependencies.length > 0 ? codeAnalysis.dependencies.join(', ') : 'ninguna'}`,
      );

      // PASO 3: Ejecutar en Docker con dependencias
      this.logger.log('🐳 Iniciando ejecución en contenedor Docker...');
      const dockerResult = await this.dockerExecutor.executeInDocker(
        code,
        testCases,
        codeAnalysis.dependencies,
      );

      // Agregar flag de Docker
      return {
        ...dockerResult,
        executedInDocker: true,
      };
    } catch (error) {
      this.logger.error(`❌ Error en ejecución: ${error.message}`);

      // En caso de error, devolver resultado vacío
      return {
        passRate: 0,
        errorHandlingScore: this.calculateErrorHandling(code),
        runtimeErrorRate: 100,
        avgExecutionTime: 0,
        memoryUsage: 0,
        algorithmicComplexity: 1,
        testResults: [],
        totalTests: testCases?.length || 0,
        passedTests: 0,
        executedInDocker: false,
        executionSkipped: true,
        skipReason: error.message,
      };
    }
  }

  /**
   * Calcula score de manejo de errores (análisis estático)
   */
  private calculateErrorHandling(code: string): number {
    let score = 50; // Base score

    // Detectar try-catch
    if (/try\s*{[\s\S]*catch/.test(code)) {
      score += 25;
    }

    // Detectar validación de inputs
    if (/if\s*\(.*(?:null|undefined|!|===|!==)/.test(code)) {
      score += 15;
    }

    // Detectar throw de errores apropiados
    if (/throw\s+new\s+\w*Error/.test(code)) {
      score += 10;
    }

    return Math.min(100, score);
  }
}