import { Injectable, Logger } from '@nestjs/common';
import { VM } from 'vm2';

export interface TestCase {
  input: any[];
  expectedOutput: any;
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
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  /**
   * Ejecuta el código con casos de prueba
   */
  async executeWithTests(
    code: string,
    testCases: TestCase[],
  ): Promise<ExecutionAnalysis> {
    this.logger.log(`Ejecutando código con ${testCases.length} casos de prueba`);

    const testResults: TestResult[] = [];
    const executionTimes: number[] = [];
    let passedTests = 0;
    let runtimeErrors = 0;

    // Ejecutar cada caso de prueba
    for (const testCase of testCases) {
      try {
        const result = await this.executeTestCase(code, testCase);
        testResults.push(result);

        if (result.passed) passedTests++;
        executionTimes.push(result.executionTime);

      } catch (error) {
        runtimeErrors++;
        testResults.push({
          passed: false,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: null,
          executionTime: 0,
          error: error.message,
        });
      }
    }

    // Calcular métricas
    const passRate = (passedTests / testCases.length) * 100;
    const avgExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0;
    const runtimeErrorRate = (runtimeErrors / testCases.length) * 100;

    // Estimar complejidad algorítmica basado en tiempo de ejecución
    const algorithmicComplexity = this.estimateComplexity(executionTimes);

    // Medir uso de memoria
    const memoryUsage = this.measureMemory();

    this.logger.log(
      `Ejecución completada: ${passedTests}/${testCases.length} tests pasados`
    );

    return {
      passRate,
      errorHandlingScore: this.calculateErrorHandling(code),
      runtimeErrorRate,
      avgExecutionTime,
      memoryUsage,
      algorithmicComplexity,
      testResults,
      totalTests: testCases.length,
      passedTests,
    };
  }

  /**
   * Ejecuta un caso de prueba individual
   */
  private async executeTestCase(
    code: string,
    testCase: TestCase,
  ): Promise<TestResult> {
    const startTime = performance.now();

    try {
      // Crear sandbox seguro con VM2
      const vm = new VM({
        timeout: 5000, // 5 segundos máximo
        sandbox: {},
      });

      // Preparar el código para ejecución
      const executableCode = this.prepareCodeForExecution(code);

      // Ejecutar código en sandbox
      const func = vm.run(executableCode);

      // Ejecutar función con inputs
      const actualOutput = func(...testCase.input);

      const executionTime = performance.now() - startTime;

      // Comparar resultado
      const passed = this.compareOutputs(actualOutput, testCase.expectedOutput);

      return {
        passed,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput,
        executionTime,
      };

    } catch (error) {
      const executionTime = performance.now() - startTime;

      return {
        passed: false,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: null,
        executionTime,
        error: error.message,
      };
    }
  }

  /**
   * Prepara el código para ser ejecutado
   */
  private prepareCodeForExecution(code: string): string {
    // Si el código ya es una función, devolverlo
    if (code.trim().startsWith('function') || code.includes('=>')) {
      return `(${code})`;
    }

    // Si es código suelto, envolverlo en función
    return `(function() { ${code} })()`;
  }

  /**
   * Compara outputs esperado vs actual
   */
  private compareOutputs(actual: any, expected: any): boolean {
    // Comparación profunda para objetos y arrays
    if (Array.isArray(actual) && Array.isArray(expected)) {
      if (actual.length !== expected.length) return false;
      return actual.every((val, idx) => this.compareOutputs(val, expected[idx]));
    }

    if (typeof actual === 'object' && typeof expected === 'object') {
      const actualKeys = Object.keys(actual || {});
      const expectedKeys = Object.keys(expected || {});

      if (actualKeys.length !== expectedKeys.length) return false;

      return actualKeys.every(key =>
        this.compareOutputs(actual[key], expected[key])
      );
    }

    // Comparación simple
    return actual === expected;
  }

  /**
   * Calcula score de manejo de errores
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

  /**
   * Estima complejidad algorítmica basado en tiempos
   */
  private estimateComplexity(times: number[]): number {
    if (times.length < 2) return 1; // O(1)

    // Si los tiempos se mantienen constantes -> O(1)
    const variance = this.calculateVariance(times);
    if (variance < 0.1) return 1;

    // Si crecen linealmente -> O(n)
    if (variance < 1) return 2;

    // Si crecen más rápido -> O(n²) o más
    return 3;
  }

  /**
   * Calcula varianza de un array de números
   */
  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  }

  /**
   * Mide uso de memoria actual
   */
  private measureMemory(): number {
    const memUsage = process.memoryUsage();
    // Retornar heap usado en MB
    return memUsage.heapUsed / 1024 / 1024;
  }

  /**
   * Genera casos de prueba automáticos para una función
   */
  generateBasicTestCases(code: string): TestCase[] {
    // Analizar la función para determinar tipo de inputs
    const testCases: TestCase[] = [];

    // Casos de prueba genéricos
    if (code.includes('array') || code.includes('arr')) {
      testCases.push(
        { input: [[1, 2, 3]], expectedOutput: [1, 2, 3] },
        { input: [[]], expectedOutput: [] },
        { input: [[5, 3, 8, 1]], expectedOutput: [1, 3, 5, 8] },
      );
    } else if (code.includes('number') || code.includes('num')) {
      testCases.push(
        { input: [5], expectedOutput: true },
        { input: [0], expectedOutput: false },
        { input: [-10], expectedOutput: true },
      );
    } else if (code.includes('string') || code.includes('str')) {
      testCases.push(
        { input: ['hello'], expectedOutput: 'HELLO' },
        { input: [''], expectedOutput: '' },
        { input: ['test123'], expectedOutput: 'TEST123' },
      );
    }

    return testCases;
  }
}