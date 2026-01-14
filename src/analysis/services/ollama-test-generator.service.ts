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
        this.logger.warn('⚠️  Ollama no generó test cases válidos');
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
   * Construye prompt para Ollama
   */
  private buildPrompt(code: string): string {
    return `Analiza esta función JavaScript y genera 5 casos de prueba en formato JSON.

CÓDIGO:
\`\`\`javascript
${code}
\`\`\`

RESPONDE ÚNICAMENTE CON JSON EN ESTE FORMATO (sin explicaciones):
{
  "testCases": [
    {
      "input": ["valor1"],
      "expectedOutput": resultado,
      "description": "descripción"
    }
  ]
}

REGLAS:
- "input" es un array de argumentos
- Si la función no recibe parámetros: "input": []
- Incluye casos válidos, edge cases e inválidos

JSON:`;
  }

  /**
   * Parsea respuesta de Ollama
   */
  private parseTestCasesFromResponse(response: string): IntelligentTestCase[] {
    try {
      // Extraer JSON
      const jsonMatch = response.match(/\{[\s\S]*"testCases"[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.testCases && Array.isArray(parsed.testCases)) {
        return parsed.testCases.map((tc: any) => ({
          input: Array.isArray(tc.input) ? tc.input : [tc.input],
          expectedOutput: tc.expectedOutput,
          description: tc.description || 'Test case',
        }));
      }

      return [];
    } catch (error) {
      this.logger.error(`Error parseando: ${error.message}`);
      return [];
    }
  }

  /**
   * Fallback simple
   */
  private generateFallback(code: string): IntelligentTestCase[] {
    this.logger.warn('🔄 Usando fallback básico');
    return [
      {
        input: [],
        expectedOutput: undefined,
        description: 'Test genérico',
      },
    ];
  }
}