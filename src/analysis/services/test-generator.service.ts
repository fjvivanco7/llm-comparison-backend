import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenRouter } from '@openrouter/sdk';
import { OllamaTestGeneratorService } from './ollama-test-generator.service';

export interface IntelligentTestCase {
  input: any[];
  expectedOutput: any;
  description: string;
}

export interface CodeAnalysis {
  isExecutable: boolean;
  reason: string;
  hasExternalDependencies: boolean;
  dependencies: string[];
}

@Injectable()
export class TestGeneratorService {
  private readonly logger = new Logger(TestGeneratorService.name);
  private readonly client: OpenRouter;

  constructor(
    private configService: ConfigService,
    private ollamaTestGenerator: OllamaTestGeneratorService) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');

    if (!apiKey) {
      this.logger.warn('⚠️  OPENROUTER_API_KEY no está configurado. Test cases con IA no funcionarán.');
    }

    this.client = new OpenRouter({ apiKey });
    this.logger.log('✅ TestGeneratorService inicializado');
  }

  /**
   * Analiza si el código tiene dependencias externas
   */
  async analyzeCodeExecutability(code: string): Promise<CodeAnalysis> {
    this.logger.log('🔍 Analizando ejecutabilidad del código...');

    // Patrones de dependencias externas
    const externalPatterns = [
      { pattern: /require\s*\(['"](?!\.\/|\.\.\/)[^'"]+['"]\)/, name: 'require(npm)' },
      { pattern: /import\s+.*\s+from\s+['"](?!\.\/|\.\.\/)[^'"]+['"]/, name: 'ES6 imports' },
      { pattern: /import\s*\(['"](?!\.\/|\.\.\/)[^'"]+['"]\)/, name: 'dynamic import' },
      { pattern: /fetch\s*\(/, name: 'fetch' },
      { pattern: /axios/i, name: 'axios' },
      { pattern: /\.get\(|\.post\(|\.put\(|\.delete\(/, name: 'HTTP methods' },
      { pattern: /\bfs\.|readFile|writeFile|readdir/i, name: 'fs (file system)' },
      { pattern: /process\.env/, name: 'process.env' },
      { pattern: /googleapis|google-auth/i, name: 'googleapis' },
      { pattern: /mongodb|mongoose|prisma/i, name: 'database' },
      { pattern: /child_process|exec|spawn/i, name: 'child_process' },
      { pattern: /express|koa|fastify/i, name: 'web framework' },
      { pattern: /socket\.io|ws\b/i, name: 'websockets' },
    ];

    const foundDependencies: string[] = [];
    let hasExternalDependencies = false;

    for (const { pattern, name } of externalPatterns) {
      if (pattern.test(code)) {
        foundDependencies.push(name);
        hasExternalDependencies = true;
      }
    }

    // Detectar nombres específicos de paquetes npm
    const npmPackages = this.extractNpmPackages(code);
    foundDependencies.push(...npmPackages);

    // Eliminar duplicados
    const uniqueDependencies = [...new Set(foundDependencies)];

    const isExecutable = !hasExternalDependencies;
    const reason = hasExternalDependencies
      ? `Requiere dependencias externas: ${uniqueDependencies.join(', ')}`
      : 'Función pura, ejecutable en sandbox aislado';

    this.logger.log(`${isExecutable ? '✅ Ejecutable' : '⚠️  Requiere Docker'}: ${reason}`);

    return {
      isExecutable,
      reason,
      hasExternalDependencies,
      dependencies: uniqueDependencies,
    };
  }

  /**
   * Extrae nombres de paquetes npm del código
   */
  private extractNpmPackages(code: string): string[] {
    const packages: string[] = [];

    // Buscar require('package-name')
    const requireMatches = code.matchAll(/require\s*\(['"]([^'"./][^'"]*)['"]\)/g);
    for (const match of requireMatches) {
      packages.push(match[1]);
    }

    // Buscar import ... from 'package-name'
    const importMatches = code.matchAll(/import\s+.*\s+from\s+['"]([^'"./][^'"]+)['"]/g);
    for (const match of importMatches) {
      packages.push(match[1]);
    }

    return packages;
  }

  // /**
  //  * Genera test cases inteligentes usando IA (GPT-4)
  //  */
  // async generateIntelligentTestCases(code: string): Promise<IntelligentTestCase[]> {
  //   this.logger.log('🤖 Generando test cases inteligentes con IA...');
  //
  //   try {
  //     const prompt = this.buildPrompt(code);
  //
  //     const response = await this.client.chat.send(
  //       {
  //         model: 'openai/gpt-4',
  //         messages: [
  //           {
  //             role: 'system',
  //             content: 'Eres un experto en testing de software. Analiza código JavaScript y genera casos de prueba apropiados en formato JSON estricto.',
  //           },
  //           {
  //             role: 'user',
  //             content: prompt,
  //           },
  //         ],
  //         temperature: 0.3,
  //         maxTokens: 2000,
  //         stream: false,
  //       },
  //       {
  //         headers: {
  //           'HTTP-Referer': 'http://localhost:3000',
  //           'X-Title': 'LLM Comparison Tool',
  //         },
  //       }
  //     );
  //
  //     const content = response.choices[0]?.message?.content;
  //     const textContent = Array.isArray(content)
  //       ? content.map((c) => (typeof c === 'string' ? c : c.type === 'text' ? c.text : '')).join('\n')
  //       : (content || '');
  //
  //     if (!textContent) {
  //       this.logger.warn('⚠️  IA no generó contenido, usando fallback');
  //       return this.generateBasicFallback(code);
  //     }
  //
  //     // Extraer y parsear JSON del response
  //     const testCases = this.parseTestCasesFromResponse(textContent);
  //
  //     if (testCases.length === 0) {
  //       this.logger.warn('⚠️  IA no generó test cases válidos, usando fallback');
  //       return this.generateBasicFallback(code);
  //     }
  //
  //     this.logger.log(`✅ ${testCases.length} test cases inteligentes generados`);
  //     return testCases;
  //
  //   } catch (error) {
  //     this.logger.error(`❌ Error generando test cases con IA: ${error.message}`);
  //     this.logger.warn('🔄 Usando fallback básico');
  //     return this.generateBasicFallback(code);
  //   }
  // }

  async generateIntelligentTestCases(code: string): Promise<IntelligentTestCase[]> {
    this.logger.log('🤖 Generando test cases inteligentes...');

    // ✅ USAR OLLAMA LOCAL (GRATIS)
    return await this.ollamaTestGenerator.generateTestCases(code);
  }

  /**
   * Construye el prompt para la IA
   */
  private buildPrompt(code: string): string {
    return `
Analiza esta función JavaScript y genera 5 casos de prueba apropiados.

**CÓDIGO A ANALIZAR:**
\`\`\`javascript
${code}
\`\`\`

**INSTRUCCIONES:**
1. Identifica el NOMBRE de la función
2. Identifica los PARÁMETROS que espera
3. Identifica el TIPO de dato que retorna
4. Genera casos de prueba que cubran:
   - Casos válidos (happy path)
   - Casos edge (valores límite, vacíos)
   - Casos inválidos

**FORMATO DE RESPUESTA (JSON estricto):**
\`\`\`json
{
  "testCases": [
    {
      "input": ["valor1", "valor2"],
      "expectedOutput": resultado_esperado,
      "description": "Descripción del caso"
    }
  ]
}
\`\`\`

**REGLAS IMPORTANTES:**
- El "input" SIEMPRE debe ser un array de valores (los argumentos de la función)
- El "expectedOutput" es el valor que la función debe retornar
- Si la función recibe 1 argumento: "input": ["valor"]
- Si la función recibe 2 argumentos: "input": ["valor1", "valor2"]
- Si la función no recibe argumentos: "input": []

**EJEMPLOS:**

**Ejemplo 1:** \`function sumar(a, b) { return a + b; }\`
\`\`\`json
{
  "testCases": [
    { "input": [2, 3], "expectedOutput": 5, "description": "Suma de números positivos" },
    { "input": [0, 0], "expectedOutput": 0, "description": "Suma de ceros" },
    { "input": [-5, 5], "expectedOutput": 0, "description": "Suma con negativos" },
    { "input": [1.5, 2.5], "expectedOutput": 4, "description": "Suma con decimales" },
    { "input": [1000, 2000], "expectedOutput": 3000, "description": "Números grandes" }
  ]
}
\`\`\`

**Ejemplo 2:** \`function validarEmail(email) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email); }\`
\`\`\`json
{
  "testCases": [
    { "input": ["test@example.com"], "expectedOutput": true, "description": "Email válido" },
    { "input": ["invalid.email"], "expectedOutput": false, "description": "Sin @" },
    { "input": ["test@"], "expectedOutput": false, "description": "Sin dominio" },
    { "input": ["@example.com"], "expectedOutput": false, "description": "Sin usuario" },
    { "input": ["test@example"], "expectedOutput": false, "description": "Sin TLD" }
  ]
}
\`\`\`

**Ejemplo 3:** \`function ordenarArray(arr) { return arr.sort((a, b) => a - b); }\`
\`\`\`json
{
  "testCases": [
    { "input": [[3, 1, 2]], "expectedOutput": [1, 2, 3], "description": "Array desordenado" },
    { "input": [[]], "expectedOutput": [], "description": "Array vacío" },
    { "input": [[5]], "expectedOutput": [5], "description": "Un elemento" },
    { "input": [[1, 1, 1]], "expectedOutput": [1, 1, 1], "description": "Elementos iguales" },
    { "input": [[-3, -1, -2]], "expectedOutput": [-3, -2, -1], "description": "Números negativos" }
  ]
}
\`\`\`

**GENERA LOS TEST CASES AHORA (SOLO JSON, sin explicaciones adicionales):**
`;
  }

  /**
   * Parsea la respuesta de la IA para extraer test cases
   */
  private parseTestCasesFromResponse(response: string): IntelligentTestCase[] {
    try {
      // Intentar extraer JSON del markdown
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      let jsonString = jsonMatch ? jsonMatch[1] : response;

      // Si no hay markdown, intentar extraer JSON directo
      if (!jsonMatch) {
        const directJsonMatch = response.match(/\{[\s\S]*"testCases"[\s\S]*\}/);
        if (directJsonMatch) {
          jsonString = directJsonMatch[0];
        }
      }

      const parsed = JSON.parse(jsonString);

      if (parsed.testCases && Array.isArray(parsed.testCases)) {
        return parsed.testCases.map((tc: any) => ({
          input: Array.isArray(tc.input) ? tc.input : [tc.input],
          expectedOutput: tc.expectedOutput,
          description: tc.description || 'Test case',
        }));
      }

      this.logger.warn('⚠️  Formato de respuesta inesperado de IA');
      return [];

    } catch (error) {
      this.logger.error(`❌ Error parseando respuesta de IA: ${error.message}`);
      return [];
    }
  }

  /**
   * Genera test cases básicos como fallback (sin IA)
   */
  private generateBasicFallback(code: string): IntelligentTestCase[] {
    this.logger.warn('🔄 Generando test cases básicos (fallback sin IA)');

    // Detectar tipo de función por palabras clave
    if (this.isEmailValidation(code)) {
      return this.getEmailTestCases();
    }

    if (this.isArrayOperation(code)) {
      return this.getArrayTestCases();
    }

    if (this.isStringOperation(code)) {
      return this.getStringTestCases();
    }

    if (this.isNumericOperation(code)) {
      return this.getNumericTestCases();
    }

    // Fallback genérico
    this.logger.warn('⚠️  No se pudo determinar tipo de función, usando tests genéricos');
    return this.getGenericTestCases();
  }

  // ========================================
  // HELPERS PARA DETECTAR TIPOS DE FUNCIÓN
  // ========================================

  private isEmailValidation(code: string): boolean {
    return /email|mail|@|^\w+@/.test(code.toLowerCase());
  }

  private isArrayOperation(code: string): boolean {
    return /array|arr\[|\.sort|\.filter|\.map|\.reduce/.test(code.toLowerCase());
  }

  private isStringOperation(code: string): boolean {
    return /string|str\.|\.toUpperCase|\.toLowerCase|\.trim|\.split/.test(code);
  }

  private isNumericOperation(code: string): boolean {
    return /number|num|sum|add|multiply|divide|calculate|math\./i.test(code);
  }

  // ========================================
  // TEST CASES POR TIPO
  // ========================================

  private getEmailTestCases(): IntelligentTestCase[] {
    return [
      { input: ['test@example.com'], expectedOutput: true, description: 'Email válido' },
      { input: ['invalid.email'], expectedOutput: false, description: 'Sin @' },
      { input: ['test@'], expectedOutput: false, description: 'Sin dominio' },
      { input: ['@example.com'], expectedOutput: false, description: 'Sin usuario' },
      { input: [''], expectedOutput: false, description: 'String vacío' },
    ];
  }

  private getArrayTestCases(): IntelligentTestCase[] {
    return [
      { input: [[3, 1, 2]], expectedOutput: [1, 2, 3], description: 'Array desordenado' },
      { input: [[]], expectedOutput: [], description: 'Array vacío' },
      { input: [[5]], expectedOutput: [5], description: 'Un elemento' },
      { input: [[1, 1, 1]], expectedOutput: [1, 1, 1], description: 'Elementos duplicados' },
      { input: [[-3, -1, -2]], expectedOutput: [-3, -2, -1], description: 'Números negativos' },
    ];
  }

  private getStringTestCases(): IntelligentTestCase[] {
    return [
      { input: ['hello'], expectedOutput: 'HELLO', description: 'String normal' },
      { input: [''], expectedOutput: '', description: 'String vacío' },
      { input: ['Test123'], expectedOutput: 'TEST123', description: 'Con números' },
      { input: ['  spaces  '], expectedOutput: '  SPACES  ', description: 'Con espacios' },
      { input: ['!@#$'], expectedOutput: '!@#$', description: 'Caracteres especiales' },
    ];
  }

  private getNumericTestCases(): IntelligentTestCase[] {
    return [
      { input: [5, 3], expectedOutput: 8, description: 'Números positivos' },
      { input: [0, 0], expectedOutput: 0, description: 'Ceros' },
      { input: [-5, 5], expectedOutput: 0, description: 'Con negativos' },
      { input: [1.5, 2.5], expectedOutput: 4, description: 'Decimales' },
      { input: [1000, 2000], expectedOutput: 3000, description: 'Números grandes' },
    ];
  }

  private getGenericTestCases(): IntelligentTestCase[] {
    return [
      { input: [1], expectedOutput: 1, description: 'Test genérico - número' },
      { input: ['test'], expectedOutput: 'test', description: 'Test genérico - string' },
      { input: [[1, 2]], expectedOutput: [1, 2], description: 'Test genérico - array' },
      { input: [true], expectedOutput: true, description: 'Test genérico - boolean' },
      { input: [null], expectedOutput: null, description: 'Test genérico - null' },
    ];
  }
}