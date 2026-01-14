import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntelligentTestCase } from './test-generator.service';

@Injectable()
export class OllamaTestGeneratorService {
  private readonly logger = new Logger(OllamaTestGeneratorService.name);
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );
  }

  /**
   * Genera test cases con Ollama (GRATIS)
   */
  async generateTestCases(code: string): Promise<IntelligentTestCase[]> {
    this.logger.log('🤖 Generando test cases con Ollama (local)...');

    try {
      const model = this.configService.get<string>(
        'OLLAMA_TEST_MODEL',
        'deepseek-coder:6.7b',
      );

      const prompt = this.buildPrompt(code);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 2000,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json();
      const testCases = this.parseTestCasesFromResponse(data.response);

      if (testCases.length === 0) {
        this.logger.warn('⚠️  Ollama no generó test cases válidos, usando fallback');
        return this.generateFallback(code);
      }

      this.logger.log(`✅ ${testCases.length} test cases generados con Ollama`);
      return testCases;

    } catch (error) {
      this.logger.error(`❌ Error con Ollama: ${error.message}`);
      return this.generateFallback(code);
    }
  }

  /**
   * Construye prompt mejorado para Ollama
   */
  private buildPrompt(code: string): string {
    return `You are a testing expert. Analyze this JavaScript function and generate 5 test cases.

CODE TO TEST:
\`\`\`javascript
${code}
\`\`\`

IMPORTANT RULES:
1. Identify the function name and parameters
2. Generate test cases that cover: valid inputs, edge cases, and invalid inputs
3. "input" must be an ARRAY of function arguments (in order)
4. If function has NO parameters, use empty array: "input": []
5. If function has 1 parameter, use: "input": [value]
6. If function has 2+ parameters, use: "input": [value1, value2, ...]

RESPOND ONLY WITH THIS EXACT JSON FORMAT (no explanations):
{
  "testCases": [
    {
      "input": [arg1, arg2],
      "expectedOutput": result,
      "description": "Brief description"
    }
  ]
}

EXAMPLES:

For: function sum(a, b) { return a + b; }
{
  "testCases": [
    {"input": [2, 3], "expectedOutput": 5, "description": "Positive numbers"},
    {"input": [0, 0], "expectedOutput": 0, "description": "Zeros"},
    {"input": [-5, 5], "expectedOutput": 0, "description": "Negative and positive"},
    {"input": [1.5, 2.5], "expectedOutput": 4, "description": "Decimals"},
    {"input": [1000, 2000], "expectedOutput": 3000, "description": "Large numbers"}
  ]
}

For: function validateEmail(email) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email); }
{
  "testCases": [
    {"input": ["test@example.com"], "expectedOutput": true, "description": "Valid email"},
    {"input": ["invalid.email"], "expectedOutput": false, "description": "Missing @"},
    {"input": ["test@"], "expectedOutput": false, "description": "Missing domain"},
    {"input": ["@example.com"], "expectedOutput": false, "description": "Missing username"},
    {"input": [""], "expectedOutput": false, "description": "Empty string"}
  ]
}

For: function greet() { return "Hello World"; }
{
  "testCases": [
    {"input": [], "expectedOutput": "Hello World", "description": "No parameters"},
    {"input": [], "expectedOutput": "Hello World", "description": "Verify consistency"},
    {"input": [], "expectedOutput": "Hello World", "description": "Multiple calls"}
  ]
}

NOW GENERATE TEST CASES FOR THE PROVIDED CODE.
RESPOND WITH ONLY THE JSON (no markdown, no explanations):`;
  }

  /**
   * Parsea respuesta de Ollama (mejorado)
   */
  private parseTestCasesFromResponse(response: string): IntelligentTestCase[] {
    try {
      this.logger.log('📝 Parseando respuesta de Ollama...');

      // Limpiar respuesta
      let cleanResponse = response.trim();

      // Remover markdown si existe
      cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // Buscar JSON en la respuesta
      const jsonMatch = cleanResponse.match(/\{[\s\S]*"testCases"[\s\S]*\}/);

      if (!jsonMatch) {
        this.logger.warn('⚠️  No se encontró JSON válido en la respuesta');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.testCases || !Array.isArray(parsed.testCases)) {
        this.logger.warn('⚠️  JSON no tiene formato esperado');
        return [];
      }

      // Convertir al formato esperado
      const testCases = parsed.testCases.map((tc: any) => {
        // Si "input" es objeto, convertir a array
        let inputArray: any[];

        if (Array.isArray(tc.input)) {
          inputArray = tc.input;
        } else if (typeof tc.input === 'object' && tc.input !== null) {
          // Convertir objeto a array de valores
          inputArray = Object.values(tc.input);
        } else {
          inputArray = [tc.input];
        }

        return {
          input: inputArray,
          expectedOutput: tc.expectedOutput || tc.output,
          description: tc.description || tc.name || 'Test case',
        };
      });

      this.logger.log(`✅ Parseados ${testCases.length} test cases`);
      return testCases;

    } catch (error) {
      this.logger.error(`❌ Error parseando respuesta: ${error.message}`);
      this.logger.debug(`Respuesta recibida: ${response.substring(0, 200)}...`);
      return [];
    }
  }

  /**
   * Fallback simple si Ollama falla
   */
  private generateFallback(code: string): IntelligentTestCase[] {
    this.logger.warn('🔄 Usando fallback básico');

    // Detectar si la función no tiene parámetros
    const noParamsPattern = /function\s+\w+\s*\(\s*\)/;

    if (noParamsPattern.test(code)) {
      return [
        {
          input: [],
          expectedOutput: undefined,
          description: 'Función sin parámetros',
        },
      ];
    }

    // Fallback genérico
    return [
      {
        input: [],
        expectedOutput: undefined,
        description: 'Test genérico (fallback)',
      },
    ];
  }
}