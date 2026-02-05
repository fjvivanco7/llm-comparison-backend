import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenRouterProvider } from './providers/openrouter.provider'; // ← NUEVO
import { GenerateCodeDto, LlmProvider } from './dto/generate-code.dto';
import { LlmResponseDto } from './dto/llm-response.dto';
import { GenerateMultipleDto } from './dto/generate-multiple.dto';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly ollamaProvider: OllamaProvider,
    private readonly openRouterProvider: OpenRouterProvider, // ← NUEVO
  ) {}

  /**
   * Genera código con un solo modelo
   */
  async generateCode(dto: GenerateCodeDto): Promise<LlmResponseDto> {
    const startTime = Date.now();

    try {
      // Obtener el provider correcto
      const provider = this.getProvider(dto.provider || LlmProvider.OLLAMA);

      // Determinar qué modelo usar
      const model = dto.model || (await this.getDefaultModel(dto.provider || LlmProvider.OLLAMA));

      this.logger.log(`Generando código con ${dto.provider}/${model}`);

      // Generar código (ahora retorna un objeto con code y usage)
      const result = await provider.generateCode(model, dto.prompt);

      // Preparar respuesta con información de tokens
      const response: LlmResponseDto = {
        code: result.code,
        model,
        provider: dto.provider || LlmProvider.OLLAMA,
        generationTimeMs: Date.now() - startTime,
        generatedAt: new Date(),
        // Incluir información de tokens si está disponible
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        totalTokens: result.usage?.totalTokens,
        estimatedCost: result.usage?.estimatedCost,
      };

      return response;
    } catch (error) {
      this.logger.error(`Error generando código: ${error.message}`);
      throw new BadRequestException(
        `Failed to generate code: ${error.message}`,
      );
    }
  }

  /**
   * Genera código con múltiples modelos en paralelo
   */
  async generateMultipleCodes(
    dto: GenerateMultipleDto,
  ): Promise<LlmResponseDto[]> {
    this.logger.log(`Generando código con ${dto.models.length} modelos`);

    try {
      // Generar con todos los modelos en paralelo
      const promises = dto.models.map((model) =>
        this.generateCode({
          prompt: dto.prompt,
          provider: dto.provider,
          model,
        }),
      );

      const results = await Promise.allSettled(promises);

      // Filtrar resultados exitosos
      const successfulResults = results
        .filter(
          (result): result is PromiseFulfilledResult<LlmResponseDto> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value);

      // Log de errores
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            `Error con modelo ${dto.models[index]}: ${result.reason}`,
          );
        }
      });

      if (successfulResults.length === 0) {
        throw new Error('Todos los modelos fallaron al generar código');
      }

      this.logger.log(
        `${successfulResults.length} de ${dto.models.length} modelos completados`,
      );
      return successfulResults;
    } catch (error) {
      this.logger.error(`Error en generación múltiple: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Obtiene el provider correcto según el enum
   */
  private getProvider(providerType: LlmProvider) {
    switch (providerType) {
      case LlmProvider.OLLAMA:
        return this.ollamaProvider;

      case LlmProvider.OPENROUTER: // ← NUEVO
        return this.openRouterProvider;

      default:
        throw new BadRequestException(`Provider ${providerType} no soportado`);
    }
  }

  /**
   * Obtiene el modelo por defecto según el provider
   */
  private async getDefaultModel(providerType: LlmProvider): Promise<string> {
    const provider = this.getProvider(providerType);
    const models = await provider.getAvailableModels();

    if (models.length === 0) {
      throw new Error('No hay modelos disponibles');
    }

    // Devolver el primer modelo disponible
    return models[0];
  }

  /**
   * Health check de todos los providers
   */
  async healthCheck() {
    const ollamaHealth = await this.ollamaProvider.healthCheck();
    const openRouterHealth = await this.openRouterProvider.healthCheck(); // ← NUEVO

    return {
      ollama: {
        status: ollamaHealth ? 'healthy' : 'unhealthy',
        models: ollamaHealth
          ? await this.ollamaProvider.getAvailableModels()
          : [],
      },
      openrouter: { // ← NUEVO
        status: openRouterHealth ? 'healthy' : 'unhealthy',
        models: openRouterHealth
          ? await this.openRouterProvider.getAvailableModels()
          : [],
      },
    };
  }

  /**
   * Lista todos los modelos disponibles por provider
   */
  async listAvailableModels() {
    const ollamaModels = await this.ollamaProvider.getAvailableModels();
    const openRouterModels = await this.openRouterProvider.getAvailableModels(); // ← NUEVO

    return {
      ollama: ollamaModels,
      openrouter: openRouterModels, // ← NUEVO
    };
  }

  /**
   * Valida si el prompt solicita una función JavaScript
   * Se ejecuta ANTES de generar código para evitar consumir tokens innecesariamente
   */
  async validatePromptRequestsFunction(prompt: string): Promise<{ isValid: boolean; reason: string }> {
    this.logger.log('🔍 Validando si el prompt solicita una función...');

    try {
      const validationPrompt = `Analyze if this user prompt is asking for a JavaScript FUNCTION.

VALID requests (return true):
- "Create a function that sorts an array"
- "Write a function to validate emails"
- "Implement quicksort algorithm" (implies a function)
- "Code to calculate prime numbers" (implies a function)

INVALID requests (return false):
- "Create a React component"
- "Build a web page"
- "Write a class for users"
- "Create an API with Express"
- Generic questions or non-code requests

USER PROMPT:
"${prompt}"

Respond ONLY with JSON:
{"requestsFunction": true/false, "reason": "brief explanation in Spanish"}`;

      const response = await this.openRouterProvider.generateRaw(
        'nvidia/nemotron-3-nano-30b-a3b:free',
        validationPrompt,
      );

      // Parsear respuesta
      const jsonMatch = response.match(/\{[\s\S]*"requestsFunction"[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('⚠️ No se pudo parsear respuesta de validación, asumiendo válido');
        return { isValid: true, reason: 'No se pudo validar, asumiendo válido' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const isValid = parsed.requestsFunction === true;

      this.logger.log(`${isValid ? '✅' : '❌'} Validación de prompt: ${parsed.reason}`);

      return {
        isValid,
        reason: parsed.reason || (isValid ? 'El prompt solicita una función' : 'El prompt no solicita una función'),
      };
    } catch (error) {
      this.logger.error(`Error en validación de prompt: ${error.message}`);
      // En caso de error, permitir para no bloquear
      return { isValid: true, reason: 'Error en validación, asumiendo válido' };
    }
  }
}