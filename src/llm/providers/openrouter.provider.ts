import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenRouter } from '@openrouter/sdk';
import { ILlmProvider, GenerateCodeResponse } from '../interfaces/llm-provider.interface';
import { calculateCost } from '../pricing.config';

@Injectable()
export class OpenRouterProvider implements ILlmProvider {
  private readonly logger = new Logger(OpenRouterProvider.name);
  private readonly client: OpenRouter;

  private readonly AVAILABLE_MODELS = {
    'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
    'gpt-4': 'openai/gpt-4',
    'gemini-pro': 'google/gemini-2.5-pro',
    'mistral-large': 'mistralai/mistral-large',
  };

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    console.log('🔑 API Key cargada:', apiKey ? '✅ SÍ' : '❌ NO');

    if (!apiKey) {
      this.logger.warn('⚠️  OPENROUTER_API_KEY no está configurado');
    }

    this.client = new OpenRouter({ apiKey });

    this.logger.log('✅ OpenRouter Provider inicializado con 4 modelos premium');
  }

  async generateCode(model: string, prompt: string): Promise<GenerateCodeResponse> {
    try {
      this.logger.log(`🚀 Generando código con modelo: ${model}`);

      const fullModelName = this.AVAILABLE_MODELS[model] || model;

      const response = await this.client.chat.send(
        {
          model: fullModelName,
          messages: [
            {
              role: 'system',
              content:
                'Eres un asistente experto en programación. Genera únicamente código JavaScript funcional y limpio, sin explicaciones adicionales ni bloques de markdown.',
            },
            {
              role: 'user',
              content: `Genera código JavaScript para: ${prompt}\n\nDevuelve SOLO el código, sin explicaciones.`,
            },
          ],
          temperature: 0.3,
          maxTokens: 2000,
          stream: false,
        },
        {
          headers: {
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'LLM Comparison Tool',
          },
        }
      );

      const content = response.choices[0]?.message?.content;
      const generatedCode = Array.isArray(content)
        ? content
          .map((c) =>
            typeof c === 'string'
              ? c
              : c.type === 'text'
                ? c.text
                : ''
          )
          .join('\n')
        : (content || '');

      if (!generatedCode) {
        this.logger.error('No se generó código. Respuesta:', JSON.stringify(response, null, 2));
        throw new Error('El modelo no generó ningún código');
      }

      // ✨ NUEVO: Extraer información de tokens de la respuesta
      const usage = response.usage ? {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        estimatedCost: calculateCost(
          fullModelName,
          response.usage.promptTokens,
          response.usage.completionTokens
        ),
      } : undefined;

      if (usage) {
        this.logger.log(
          `📊 Tokens consumidos: ${usage.totalTokens} (prompt: ${usage.promptTokens}, completion: ${usage.completionTokens}) - Costo: $${usage.estimatedCost?.toFixed(6)}`
        );
      }

      this.logger.log(`✅ Código generado exitosamente con ${model}`);
      return {
        code: this.cleanCode(generatedCode),
        usage,
      };
    } catch (error) {
      this.logger.error(`❌ Error generando código con ${model}:`, error.message);
      throw new Error(`Failed to generate code with OpenRouter: ${error.message}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.chat.send({
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5,
        stream: false,
      });

      const isHealthy = !!response.choices[0]?.message?.content;
      this.logger.log(isHealthy ? '✅ OpenRouter disponible' : '⚠️  OpenRouter no responde');
      return isHealthy;
    } catch (error) {
      this.logger.warn('⚠️  OpenRouter no está disponible:', error.message);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const models = Object.keys(this.AVAILABLE_MODELS);
      this.logger.log(`📋 ${models.length} modelos premium disponibles en OpenRouter`);
      return models;
    } catch (error) {
      this.logger.error('❌ Error obteniendo modelos:', error.message);
      return [];
    }
  }

  private cleanCode(code: string): string {
    let cleaned = code
      .replace(/```javascript\n?/g, '')
      .replace(/```js\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/^Here'?s.*?:\n/gm, '')
      .replace(/^This code.*?\n/gm, '')
      .replace(/^Aquí está.*?:\n/gm, '');
    return cleaned.trim();
  }

  getFullModelName(shortName: string): string {
    return this.AVAILABLE_MODELS[shortName] || shortName;
  }

  getBestModels() {
    return {
      claude: 'claude-3.5-sonnet',
      gpt: 'gpt-4',
      gemini: 'google/gemini-2.5-pro',
      mistral: 'mistral-large',
    };
  }

  /**
   * Genera respuesta raw sin formateo (para validaciones)
   */
  async generateRaw(model: string, prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.send(
        {
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          maxTokens: 500,
          stream: false,
        },
        {
          headers: {
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'LLM Comparison Tool',
          },
        }
      );

      const content = response.choices[0]?.message?.content;
      const contentStr = Array.isArray(content)
        ? content.map((c) => (typeof c === 'string' ? c : c.type === 'text' ? c.text : '')).join('')
        : (content || '');

      // Log de tokens si están disponibles
      if (response.usage) {
        this.logger.log(
          `📊 [Validación] Tokens: ${response.usage.totalTokens} (prompt: ${response.usage.promptTokens}, completion: ${response.usage.completionTokens})`
        );
      }

      return contentStr;
    } catch (error) {
      this.logger.error(`❌ Error en generateRaw: ${error.message}`);
      this.logger.error(`❌ Modelo usado: ${model}`);
      if (error.response) {
        this.logger.error(`❌ Status: ${error.response.status}`);
        this.logger.error(`❌ Body: ${JSON.stringify(error.response.data || error.response.body)}`);
      }
      if (error.cause) {
        this.logger.error(`❌ Causa: ${JSON.stringify(error.cause)}`);
      }
      throw error;
    }
  }
}
