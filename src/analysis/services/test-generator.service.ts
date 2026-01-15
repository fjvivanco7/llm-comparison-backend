import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenRouter } from '@openrouter/sdk';

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

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');

    if (!apiKey) {
      throw new Error('⚠️  OPENROUTER_API_KEY es requerido');
    }

    this.client = new OpenRouter({ apiKey });
    this.logger.log('✅ TestGeneratorService inicializado con OpenRouter');
  }

  /**
   * Analiza si el código tiene dependencias externas
   */
  async analyzeCodeExecutability(code: string): Promise<CodeAnalysis> {
    this.logger.log('🔍 Analizando ejecutabilidad del código...');

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

    const npmPackages = this.extractNpmPackages(code);
    foundDependencies.push(...npmPackages);
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

  private extractNpmPackages(code: string): string[] {
    const packages: string[] = [];
    const requireMatches = code.matchAll(/require\s*\(['"]([^'"./][^'"]*)['"]\)/g);
    for (const match of requireMatches) {
      packages.push(match[1]);
    }
    const importMatches = code.matchAll(/import\s+.*\s+from\s+['"]([^'"./][^'"]+)['"]/g);
    for (const match of importMatches) {
      packages.push(match[1]);
    }
    return packages;
  }

  /**
   * Genera test cases usando OpenRouter (SIN FALLBACK)
   */
  async generateIntelligentTestCases(code: string): Promise<IntelligentTestCase[]> {
    this.logger.log('🤖 Generando test cases con IA...');

    const model = this.configService.get<string>(
      'AI_TEST_MODEL',
      'qwen/qwen-2.5-7b-instruct:free'  // ← MODELO GRATIS POR DEFECTO
    );

    const numTests = this.configService.get<number>('AI_TEST_CASES_COUNT', 5);

    this.logger.log(`🎯 Modelo: ${model} | Test cases: ${numTests}`);

    const prompt = this.buildPrompt(code, numTests);

    // Retry logic: 3 intentos
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.logger.log(`🔄 Intento ${attempt}/3...`);

        const response = await this.client.chat.send(
          {
            model,
            messages: [
              {
                role: 'system',
                content: 'You are an expert software tester. Generate test cases in strict JSON format.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.3,
            maxTokens: 2000,
          },
          {
            headers: {
              'HTTP-Referer': 'http://localhost:3000',
              'X-Title': 'LLM Comparison Tool',
            },
          }
        );

        const content = response.choices[0]?.message?.content;
        const textContent = Array.isArray(content)
          ? content.map((c) => (typeof c === 'string' ? c : c.type === 'text' ? c.text : '')).join('\n')
          : (content || '');

        if (!textContent) {
          throw new Error('IA no generó contenido');
        }

        const testCases = this.parseTestCasesFromResponse(textContent);

        if (testCases.length === 0) {
          throw new Error('No se pudieron parsear test cases del JSON');
        }

        this.logger.log(`✅ ${testCases.length} test cases generados exitosamente`);
        return testCases;

      } catch (error) {
        lastError = error;
        this.logger.warn(`⚠️  Intento ${attempt}/3 falló: ${error.message}`);

        if (attempt < 3) {
          // Esperar 2 segundos antes de reintentar
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    // Si llegamos aquí, fallaron los 3 intentos
    throw new Error(
      `No se pudieron generar test cases después de 3 intentos. Último error: ${lastError?.message}`
    );
  }

  private buildPrompt(code: string, numTests: number): string {
    return `You are a code analyzer. First UNDERSTAND what this code does, then generate ${numTests} test cases.

CODE TO ANALYZE:
\`\`\`javascript
${code}
\`\`\`

STEP 1 - ANALYZE THE CODE:
- What parameters does the function receive? (name and type of each)
- What does the function return? (type and logic)
- Execute the logic mentally for simple inputs

STEP 2 - GENERATE TEST CASES:
The "input" field is an ARRAY spread as arguments: targetFunction(...input)

PARAMETER RULES:
- Function with NO parameters: "input": []
- Function with 1 number param: "input": [5]
- Function with 1 array param: "input": [[1,2,3]] (wrapped in array)
- Function with 1 string param: "input": ["hello"]
- Function with 1 object param: "input": [{"key": "value"}]
- Function with 2+ params: "input": [param1, param2, ...]

EXPECTED OUTPUT RULES:
- You MUST calculate what the function ACTUALLY returns for each input
- Do NOT guess - trace the code logic step by step
- If function returns boolean: true or false
- If function returns number: the calculated number
- If function returns array: the resulting array
- If function returns string: the resulting string

EXAMPLE - Analyzing a sum function:
\`\`\`javascript
function sumEvenNumbers(n) {
  let sum = 0;
  for (let i = 2; i <= n; i += 2) sum += i;
  return sum;
}
\`\`\`
Analysis: Receives 1 number, returns sum of even numbers from 2 to n
- sumEvenNumbers(10) = 2+4+6+8+10 = 30
- sumEvenNumbers(4) = 2+4 = 6

Test cases:
{"input": [10], "expectedOutput": 30, "description": "Sum evens 1-10"}
{"input": [4], "expectedOutput": 6, "description": "Sum evens 1-4"}

NOW generate ${numTests} test cases for the code above.

RESPOND ONLY WITH JSON:
{
  "testCases": [
    {"input": [...], "expectedOutput": ..., "description": "..."}
  ]
}`;
  }

  private parseTestCasesFromResponse(response: string): IntelligentTestCase[] {
    try {
      this.logger.log('📝 Parseando respuesta de IA...');

      let cleanResponse = response.trim();

      // Remover markdown
      cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // Reemplazar undefined con null (JSON válido)
      cleanResponse = cleanResponse.replace(/:\s*undefined\b/g, ': null');
      cleanResponse = cleanResponse.replace(/\[\s*undefined\b/g, '[null');
      cleanResponse = cleanResponse.replace(/,\s*undefined\b/g, ', null');

      // Buscar JSON
      const jsonMatch = cleanResponse.match(/\{[\s\S]*"testCases"[\s\S]*\}/);

      if (!jsonMatch) {
        this.logger.error('⚠️  No se encontró JSON en la respuesta');
        this.logger.debug(`Respuesta recibida: ${response.substring(0, 500)}`);
        throw new Error('No se encontró JSON válido en la respuesta');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.testCases || !Array.isArray(parsed.testCases)) {
        throw new Error('JSON no tiene el formato esperado');
      }

      const testCases = parsed.testCases.map((tc: any) => {
        let inputArray: any[];

        if (Array.isArray(tc.input)) {
          inputArray = tc.input;
        } else if (typeof tc.input === 'object' && tc.input !== null) {
          inputArray = Object.values(tc.input);
        } else {
          inputArray = [tc.input];
        }

        return {
          input: inputArray,
          expectedOutput: tc.expectedOutput !== undefined ? tc.expectedOutput : (tc.output !== undefined ? tc.output : null),
          description: tc.description || tc.name || 'Test case',
        };
      });

      this.logger.log(`✅ Parseados ${testCases.length} test cases correctamente`);
      return testCases;

    } catch (error) {
      this.logger.error(`❌ Error parseando respuesta: ${error.message}`);
      throw error;
    }
  }
}