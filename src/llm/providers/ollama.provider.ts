import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILlmProvider } from '../interfaces/llm-provider.interface';

@Injectable()
export class OllamaProvider implements ILlmProvider {
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
  }

  /**
   * Genera código usando Ollama
   */
  async generateCode(model: string, prompt: string): Promise<string> {
    try {
      this.logger.log(`Generando código con modelo: ${model}`);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          prompt: `Genera únicamente código JavaScript para: ${prompt}\n\nDevuelve SOLO el código, sin explicaciones.`,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      const generatedCode = data.response;

      this.logger.log(`Código generado exitosamente con ${model}`);
      return this.cleanCode(generatedCode);

    } catch (error) {
      this.logger.error(`Error generando código con ${model}:`, error.message);
      throw new Error(`Failed to generate code with Ollama: ${error.message}`);
    }
  }

  /**
   * Verifica si Ollama está corriendo
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      this.logger.warn('Ollama no está disponible');
      return false;
    }
  }

  /**
   * Obtiene los modelos instalados en Ollama
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);

      if (!response.ok) {
        throw new Error('No se pudieron obtener los modelos');
      }

      const data = await response.json();
      return data.models.map((model: any) => model.name);

    } catch (error) {
      this.logger.error('Error obteniendo modelos:', error.message);
      return [];
    }
  }

  /**
   * Limpia el código generado (remueve markdown, explicaciones, etc.)
   */
  private cleanCode(code: string): string {
    // Remover bloques de código markdown
    let cleaned = code.replace(/```javascript\n?/g, '').replace(/```\n?/g, '');

    // Remover explicaciones comunes
    cleaned = cleaned.replace(/^Here's.*?:\n/gm, '');
    cleaned = cleaned.replace(/^This code.*?\n/gm, '');

    return cleaned.trim();
  }
}