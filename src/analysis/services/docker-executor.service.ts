import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TestCase } from './execution.service';

export interface DockerExecutionResult {
  passRate: number;
  errorHandlingScore: number;
  runtimeErrorRate: number;
  avgExecutionTime: number;
  memoryUsage: number;
  algorithmicComplexity: number;
  testResults: any[];
  totalTests: number;
  passedTests: number;
  executionSkipped: boolean;
  skipReason?: string;
}

@Injectable()
export class DockerExecutorService {
  private readonly logger = new Logger(DockerExecutorService.name);
  private docker: Docker;
  private readonly tempDir = '/tmp/llm-executor';

  constructor() {
    this.docker = new Docker({
      socketPath: '/var/run/docker.sock', // Linux/Mac
      // Para Windows: socketPath: '//./pipe/docker_engine'
    });
  }

  /**
   * Ejecuta código en contenedor Docker aislado
   */
  async executeInDocker(
    code: string,
    testCases: TestCase[],
    dependencies: string[] = [],
  ): Promise<DockerExecutionResult> {
    // ✅ VALIDACIÓN AGREGADA
    if (!testCases || testCases.length === 0) {
      this.logger.error('❌ No se proporcionaron test cases');
      return this.generateErrorResult('No hay test cases para ejecutar');
    }

    const executionId = `exec-${Date.now()}`;
    const workDir = path.join(this.tempDir, executionId);

    try {
      this.logger.log(`🐳 Iniciando ejecución en Docker: ${executionId}`);

      // 1. Crear directorio temporal
      await fs.mkdir(workDir, { recursive: true });

      // 2. Preparar archivos
      await this.prepareExecutionFiles(workDir, code, testCases, dependencies);

      // 3. Construir imagen
      const imageName = await this.buildDockerImage(workDir, executionId);

      // 4. Ejecutar container
      const result = await this.runContainer(imageName, executionId);

      // 5. Parsear resultados
      return this.parseResults(result);
    } catch (error) {
      this.logger.error(`❌ Error en ejecución Docker: ${error.message}`);
      return this.generateErrorResult(error.message);
    } finally {
      // 6. Limpiar
      await this.cleanup(workDir, executionId);
    }
  }

  /**
   * Prepara archivos para el contenedor
   */
  private async prepareExecutionFiles(
    workDir: string,
    code: string,
    testCases: TestCase[],
    dependencies: string[],
  ): Promise<void> {
    // Archivo: package.json
    const packageJson = {
      name: 'code-executor',
      version: '1.0.0',
      type: 'module',
      dependencies: this.resolveDependencies(dependencies),
    };

    await fs.writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    );

    // Archivo: code.js (código a evaluar)
    await fs.writeFile(
      path.join(workDir, 'code.js'),
      this.wrapCodeForExport(code),
    );

    // Archivo: test-runner.js (ejecutor de tests)
    const testRunner = this.generateTestRunner(testCases);
    await fs.writeFile(path.join(workDir, 'test-runner.js'), testRunner);

    // Archivo: Dockerfile
    const dockerfile = this.generateDockerfile(dependencies);
    await fs.writeFile(path.join(workDir, 'Dockerfile'), dockerfile);

    this.logger.log(`✅ Archivos preparados en: ${workDir}`);
  }

  /**
   * Genera Dockerfile dinámico
   */
  private generateDockerfile(dependencies: string[]): string {
    const hasNpmDeps = dependencies.length > 0;

    return `
FROM node:18-alpine

WORKDIR /app

# Copiar package.json
COPY package.json .

# Instalar dependencias si existen
${hasNpmDeps ? 'RUN npm install --production' : '# No dependencies'}

# Copiar código
COPY code.js .
COPY test-runner.js .

# Límites de recursos
ENV NODE_OPTIONS="--max-old-space-size=512"

# Timeout de 30 segundos
CMD timeout 30s node test-runner.js
`;
  }

  /**
   * Genera script para ejecutar tests
   */
  private generateTestRunner(testCases: TestCase[]): string {
    return `
import { performance } from 'perf_hooks';
import codeModule from './code.js';

const testCases = ${JSON.stringify(testCases)};
const results = [];
let passedTests = 0;
let runtimeErrors = 0;
const executionTimes = [];

// Obtener función exportada
const targetFunction = codeModule.default || codeModule;

if (typeof targetFunction !== 'function') {
  console.error(JSON.stringify({
    error: 'El código no exporta una función válida',
    success: false
  }));
  process.exit(1);
}

// Ejecutar cada test
for (const testCase of testCases) {
  const startTime = performance.now();
  
  try {
    const actualOutput = targetFunction(...testCase.input);
    const executionTime = performance.now() - startTime;
    executionTimes.push(executionTime);

    const passed = JSON.stringify(actualOutput) === JSON.stringify(testCase.expectedOutput);
    
    if (passed) passedTests++;

    results.push({
      passed,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput,
      executionTime,
    });

  } catch (error) {
    runtimeErrors++;
    const executionTime = performance.now() - startTime;
    
    results.push({
      passed: false,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput: null,
      executionTime,
      error: error.message,
    });
  }
}

// Calcular métricas
const passRate = (passedTests / testCases.length) * 100;
const avgExecutionTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
const runtimeErrorRate = (runtimeErrors / testCases.length) * 100;
const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

// Output JSON
console.log(JSON.stringify({
  success: true,
  passRate,
  avgExecutionTime,
  runtimeErrorRate,
  memoryUsage,
  testResults: results,
  totalTests: testCases.length,
  passedTests,
}));
`;
  }

  /**
   * Envuelve el código para exportarlo como módulo ES6
   */
  private wrapCodeForExport(code: string): string {
    const cleanCode = code.trim();

    // Si ya tiene export, devolverlo tal cual
    if (cleanCode.includes('export default') || cleanCode.includes('module.exports')) {
      return cleanCode;
    }

    // CASO 1: Función declarada (function nombre() {...})
    const functionMatch = cleanCode.match(/function\s+(\w+)\s*\([^)]*\)\s*{/);

    if (functionMatch) {
      const functionName = functionMatch[1];

      // Verificar si la función se ejecuta al final
      const executionPattern = new RegExp(`${functionName}\\s*\\([^)]*\\)\\s*;?\\s*$`, 'm');

      if (executionPattern.test(cleanCode)) {
        // Eliminar la ejecución automática y solo exportar la función
        const codeWithoutExecution = cleanCode.replace(executionPattern, '').trim();
        this.logger.log(`🔧 Función auto-ejecutada detectada: ${functionName}(), removiendo ejecución`);
        return `${codeWithoutExecution}\n\nexport default ${functionName};`;
      }

      // Función declarada pero no ejecutada
      return `${cleanCode}\n\nexport default ${functionName};`;
    }

    // CASO 2: Arrow function (const nombre = () => {...})
    const arrowMatch = cleanCode.match(/(?:const|let|var)\s+(\w+)\s*=\s*(\([^)]*\)\s*=>\s*{[\s\S]*})/);

    if (arrowMatch) {
      const varName = arrowMatch[1];

      // Verificar si se ejecuta
      const executionPattern = new RegExp(`${varName}\\s*\\([^)]*\\)\\s*;?\\s*$`, 'm');

      if (executionPattern.test(cleanCode)) {
        const codeWithoutExecution = cleanCode.replace(executionPattern, '').trim();
        this.logger.log(`🔧 Arrow function auto-ejecutada detectada: ${varName}(), removiendo ejecución`);
        return `${codeWithoutExecution}\n\nexport default ${varName};`;
      }

      return `${cleanCode}\n\nexport default ${varName};`;
    }

    // CASO 3: Código sin función (se ejecuta directamente)
    // Ejemplo: console.log('hola'); const x = 5; etc.
    this.logger.warn('⚠️  Código sin función detectada, envolviéndolo en función wrapper');

    return `
function generatedCode() {
  ${cleanCode}
}

export default generatedCode;
`;
  }

  /**
   * Resuelve dependencias npm
   */
  private resolveDependencies(dependencies: string[]): Record<string, string> {
    const depMap: Record<string, string> = {};

    const knownDeps = {
      axios: '^1.6.0',
      'node-fetch': '^3.3.0',
      googleapis: '^128.0.0',
      mongodb: '^6.3.0',
      pg: '^8.11.0',
      mysql2: '^3.6.0',
      lodash: '^4.17.21',
      moment: '^2.29.4',
      uuid: '^9.0.0',
    };

    dependencies.forEach((dep) => {
      const cleanDep = dep.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (knownDeps[cleanDep]) {
        depMap[cleanDep] = knownDeps[cleanDep];
      }
    });

    return depMap;
  }

  /**
   * Construye imagen Docker
   */
  private async buildDockerImage(
    workDir: string,
    executionId: string,
  ): Promise<string> {
    const imageName = `llm-executor:${executionId}`;

    this.logger.log(`🔨 Construyendo imagen: ${imageName}`);

    const stream = await this.docker.buildImage(
      {
        context: workDir,
        src: ['Dockerfile', 'package.json', 'code.js', 'test-runner.js'],
      },
      { t: imageName },
    );

    // Esperar a que termine el build
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err, res) =>
        err ? reject(err) : resolve(res),
      );
    });

    this.logger.log(`✅ Imagen construida: ${imageName}`);
    return imageName;
  }

  /**
   * Ejecuta container
   */
  private async runContainer(
    imageName: string,
    executionId: string,
  ): Promise<string> {
    this.logger.log(`🚀 Ejecutando container: ${executionId}`);

    const container = await this.docker.createContainer({
      Image: imageName,
      name: `executor-${executionId}`,
      HostConfig: {
        Memory: 512 * 1024 * 1024, // 512 MB
        NanoCpus: 1000000000, // 1 CPU
        NetworkMode: 'none', // Sin acceso a internet (seguridad)
      },
      AttachStdout: true,
      AttachStderr: true,
    });

    await container.start();

    // Esperar a que termine (máx 30s por el timeout en Dockerfile)
    const result = await container.wait();

    // Obtener logs
    const logs = await container.logs({
      stdout: true,
      stderr: true,
    });

    const output = logs.toString('utf8');

    // Eliminar container
    await container.remove();

    this.logger.log(`✅ Container ejecutado y eliminado`);

    return output;
  }

  /**
   * Parsea resultados de la ejecución
   */
  private parseResults(output: string): DockerExecutionResult {
    try {
      // Extraer JSON del output
      const jsonMatch = output.match(/\{[\s\S]*"success"[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No se encontró JSON en el output');
      }

      const data = JSON.parse(jsonMatch[0]);

      if (!data.success) {
        throw new Error(data.error || 'Ejecución fallida');
      }

      return {
        passRate: data.passRate,
        errorHandlingScore: this.calculateErrorHandling(output),
        runtimeErrorRate: data.runtimeErrorRate,
        avgExecutionTime: data.avgExecutionTime,
        memoryUsage: data.memoryUsage,
        algorithmicComplexity: this.estimateComplexity(data.testResults),
        testResults: data.testResults,
        totalTests: data.totalTests,
        passedTests: data.passedTests,
        executionSkipped: false,
      };
    } catch (error) {
      this.logger.error(`Error parseando resultados: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resultado de error
   */
  private generateErrorResult(errorMessage: string): DockerExecutionResult {
    return {
      passRate: 0,
      errorHandlingScore: 0,
      runtimeErrorRate: 100,
      avgExecutionTime: 0,
      memoryUsage: 0,
      algorithmicComplexity: 1,
      testResults: [],
      totalTests: 0,
      passedTests: 0,
      executionSkipped: true,
      skipReason: errorMessage,
    };
  }

  /**
   * Limpieza de recursos
   */
  private async cleanup(workDir: string, executionId: string): Promise<void> {
    try {
      // Eliminar archivos temporales
      await fs.rm(workDir, { recursive: true, force: true });

      // Eliminar imagen Docker
      const imageName = `llm-executor:${executionId}`;
      const image = this.docker.getImage(imageName);
      await image.remove({ force: true });

      this.logger.log(`🧹 Limpieza completada: ${executionId}`);
    } catch (error) {
      this.logger.warn(`⚠️ Error en limpieza: ${error.message}`);
    }
  }

  // Métodos auxiliares
  private calculateErrorHandling(code: string): number {
    let score = 50;
    if (/try\s*{[\s\S]*catch/.test(code)) score += 25;
    if (/if\s*\(.*(?:null|undefined|!|===|!==)/.test(code)) score += 15;
    if (/throw\s+new\s+\w*Error/.test(code)) score += 10;
    return Math.min(100, score);
  }

  private estimateComplexity(testResults: any[]): number {
    if (testResults.length < 2) return 1;
    const times = testResults.map((r) => r.executionTime);
    const variance = this.calculateVariance(times);
    if (variance < 0.1) return 1;
    if (variance < 1) return 2;
    return 3;
  }

  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map((n) => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  }
}