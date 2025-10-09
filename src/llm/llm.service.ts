import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { OllamaProvider } from './providers/ollama.provider';
import { GenerateCodeDto, LlmProvider } from './dto/generate-code.dto';
import { LlmResponseDto } from './dto/llm-response.dto';
import { GenerateMultipleDto } from './dto/generate-multiple.dto';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly ollamaProvider: OllamaProvider,
    // Aquí agregaremos openRouterProvider después
  ) {}

  /**
   * Genera código con un solo modelo
   */
  async generateCode(dto: GenerateCodeDto): Promise<LlmResponseDto> {
    const startTime = Date.now();

    try {
      // Obtener el provider correcto
      const provider = this.getProvider(dto.provider || LlmProvider.OLLAMA); // ← Agregar valor por defecto

      // Determinar qué modelo usar
      const model = dto.model || await this.getDefaultModel(dto.provider || LlmProvider.OLLAMA); // ← Agregar valor por defecto

      this.logger.log(`Generando código con ${dto.provider}/${model}`);

      // Generar código
      const code = await provider.generateCode(model, dto.prompt);

      // Preparar respuesta
      const response: LlmResponseDto = {
        code,
        model,
        provider: dto.provider || LlmProvider.OLLAMA,  // ← Agregar valor por defecto
        generationTimeMs: Date.now() - startTime,
        generatedAt: new Date(),
      };

      return response;

    } catch (error) {
      this.logger.error(`Error generando código: ${error.message}`);
      throw new BadRequestException(`Failed to generate code: ${error.message}`);
    }
  }

  /**
   * Genera código con múltiples modelos en paralelo
   */
  async generateMultipleCodes(dto: GenerateMultipleDto): Promise<LlmResponseDto[]> {
    this.logger.log(`Generando código con ${dto.models.length} modelos`);

    try {
      // Generar con todos los modelos en paralelo
      const promises = dto.models.map(model =>
        this.generateCode({
          prompt: dto.prompt,
          provider: dto.provider,
          model,
        })
      );

      const results = await Promise.allSettled(promises);

      // Filtrar resultados exitosos
      const successfulResults = results
        .filter((result): result is PromiseFulfilledResult<LlmResponseDto> =>
          result.status === 'fulfilled'
        )
        .map(result => result.value);

      // Log de errores
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            `Error con modelo ${dto.models[index]}: ${result.reason}`
          );
        }
      });

      if (successfulResults.length === 0) {
        throw new Error('Todos los modelos fallaron al generar código');
      }

      this.logger.log(`${successfulResults.length} de ${dto.models.length} modelos completados`);
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

      // case LlmProvider.OPENROUTER:
      //   return this.openRouterProvider;

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

    return {
      ollama: {
        status: ollamaHealth ? 'healthy' : 'unhealthy',
        models: ollamaHealth ? await this.ollamaProvider.getAvailableModels() : [],
      },
      // openrouter: { ... } // Agregar después
    };
  }

  /**
   * Lista todos los modelos disponibles por provider
   */
  async listAvailableModels() {
    const ollamaModels = await this.ollamaProvider.getAvailableModels();

    return {
      ollama: ollamaModels,
      // openrouter: [...], // Agregar después
    };
  }
}