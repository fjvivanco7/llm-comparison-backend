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

  private generateTestRunner(testCases: TestCase[]): string {
    // ✅ Serializar test cases de forma segura
    const testCasesJson = JSON.stringify(testCases, null, 2)
      .replace(/\\/g, '\\\\')  // Escapar backslashes
      .replace(/`/g, '\\`')    // Escapar backticks (CORREGIDO)
      .replace(/\$/g, '\\$');  // Escapar dollar signs

    return `
import { performance } from 'perf_hooks';

const testCases = ${testCasesJson};

// Comparación profunda de objetos/arrays
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    for (let key of keysA) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

async function runTests() {
  const results = [];
  let passedTests = 0;
  let runtimeErrors = 0;
  const executionTimes = [];

  // Importar el módulo de forma dinámica para capturar errores de importación
  let codeModule;
  try {
    codeModule = await import('./code.js');
  } catch (importError) {
    console.log(JSON.stringify({
      success: false,
      error: 'Error importando el código: ' + importError.message,
      passRate: 0,
      avgExecutionTime: 0,
      runtimeErrorRate: 100,
      memoryUsage: 0,
      testResults: [],
      totalTests: testCases.length,
      passedTests: 0,
    }));
    return;
  }

  const targetFunction = codeModule.default || codeModule;

  if (typeof targetFunction !== 'function') {
    console.log(JSON.stringify({
      success: false,
      error: 'El código no exporta una función válida. Tipo recibido: ' + typeof targetFunction,
      passRate: 0,
      avgExecutionTime: 0,
      runtimeErrorRate: 100,
      memoryUsage: 0,
      testResults: [],
      totalTests: testCases.length,
      passedTests: 0,
    }));
    return;
  }

  for (const testCase of testCases) {
    const startTime = performance.now();

    try {
      const actualOutput = await Promise.resolve(targetFunction(...testCase.input));
      const executionTime = performance.now() - startTime;
      executionTimes.push(executionTime);

      const passed = deepEqual(actualOutput, testCase.expectedOutput);

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

  const passRate = (passedTests / testCases.length) * 100;
  const avgExecutionTime = executionTimes.length > 0
    ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
    : 0;
  const runtimeErrorRate = (runtimeErrors / testCases.length) * 100;
  const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

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
}

runTests().catch(err => {
  console.log(JSON.stringify({
    success: false,
    error: 'Error fatal en el test runner: ' + err.message,
    passRate: 0,
    avgExecutionTime: 0,
    runtimeErrorRate: 100,
    memoryUsage: 0,
    testResults: [],
    totalTests: testCases.length,
    passedTests: 0,
  }));
});
`;
  }

  /**
   * Convierte require() de CommonJS a import de ES Modules
   */
  private convertRequireToImport(code: string): string {
    let result = code;

    // Caso 1: const/let/var name = require('module')
    // → import name from 'module'
    result = result.replace(
      /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)\s*;?/g,
      "import $1 from '$2';",
    );

    // Caso 2: const/let/var { a, b } = require('module')
    // → import { a, b } from 'module'
    result = result.replace(
      /(?:const|let|var)\s+(\{[^}]+\})\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)\s*;?/g,
      "import $1 from '$2';",
    );

    // Caso 3: require('module') usado inline (sin asignación)
    // Esto es más complejo, lo dejamos como está si no hay asignación

    if (result !== code) {
      this.logger.log('🔄 Convertido require() a import ES Module');
    }

    return result;
  }

  /**
   * Envuelve el código para exportarlo como módulo ES6
   */
  private wrapCodeForExport(code: string): string {
    let cleanCode = code.trim();

    // Convertir CommonJS require() a ES Module imports
    cleanCode = this.convertRequireToImport(cleanCode);

    // Si ya tiene export default, devolverlo tal cual
    if (cleanCode.includes('export default')) {
      return cleanCode;
    }

    // Si tiene module.exports, convertirlo a export default
    if (cleanCode.includes('module.exports')) {
      cleanCode = cleanCode.replace(/module\.exports\s*=\s*(\w+);?/g, 'export default $1;');
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

    // Docker devuelve logs multiplexados con headers de 8 bytes por frame
    // Necesitamos demultiplexar para obtener el texto limpio
    const output = this.demultiplexDockerLogs(logs);

    this.logger.debug(`📋 Output del container:\n${output}`);

    // Eliminar container
    await container.remove();

    this.logger.log(`✅ Container ejecutado y eliminado`);

    return output;
  }

  /**
   * Demultiplexa los logs de Docker
   * Docker streams tienen headers de 8 bytes: [type(1), 0, 0, 0, size(4 bytes big-endian)]
   */
  private demultiplexDockerLogs(buffer: Buffer): string {
    const output: string[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      // Header: 8 bytes
      if (offset + 8 > buffer.length) {
        // No hay suficientes bytes para un header completo, tomar el resto como texto
        const remaining = buffer.slice(offset).toString('utf8');
        if (remaining.trim()) {
          output.push(remaining);
        }
        break;
      }

      // Byte 0: tipo (1=stdout, 2=stderr)
      // Bytes 4-7: tamaño del mensaje (big-endian)
      const size = buffer.readUInt32BE(offset + 4);

      if (size === 0) {
        offset += 8;
        continue;
      }

      if (offset + 8 + size > buffer.length) {
        // El frame está incompleto, tomar lo que queda
        const remaining = buffer.slice(offset + 8).toString('utf8');
        if (remaining.trim()) {
          output.push(remaining);
        }
        break;
      }

      // Extraer el mensaje
      const message = buffer.slice(offset + 8, offset + 8 + size).toString('utf8');
      output.push(message);

      offset += 8 + size;
    }

    return output.join('');
  }

  /**
   * Parsea resultados de la ejecución
   */
  private parseResults(output: string): DockerExecutionResult {
    try {
      // Extraer JSON del output - buscar el último JSON válido que contenga "success"
      const jsonMatches = output.match(/\{[^{}]*"success"[^{}]*\}|\{[\s\S]*"success"[\s\S]*\}/g);

      if (!jsonMatches || jsonMatches.length === 0) {
        this.logger.error(`Output sin JSON: ${output.substring(0, 500)}`);
        throw new Error('No se encontró JSON en el output');
      }

      // Intentar parsear cada match hasta encontrar uno válido
      let data: any = null;
      let parseError: Error | null = null;

      for (const match of jsonMatches) {
        try {
          data = JSON.parse(match);
          if (data && typeof data.success !== 'undefined') {
            break;
          }
        } catch (e) {
          parseError = e;
          continue;
        }
      }

      if (!data) {
        throw parseError || new Error('No se pudo parsear ningún JSON válido');
      }

      // Si success es false, devolver resultado de error con los datos que tenemos
      if (!data.success) {
        this.logger.warn(`⚠️ Ejecución reportó error: ${data.error}`);
        return {
          passRate: data.passRate || 0,
          errorHandlingScore: 0,
          runtimeErrorRate: data.runtimeErrorRate || 100,
          avgExecutionTime: data.avgExecutionTime || 0,
          memoryUsage: data.memoryUsage || 0,
          algorithmicComplexity: 1,
          testResults: data.testResults || [],
          totalTests: data.totalTests || 0,
          passedTests: data.passedTests || 0,
          executionSkipped: true,
          skipReason: data.error || 'Ejecución fallida',
        };
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