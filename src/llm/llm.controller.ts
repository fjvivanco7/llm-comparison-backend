import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LlmService } from './llm.service';
import { GenerateCodeDto } from './dto/generate-code.dto';
import { GenerateMultipleDto } from './dto/generate-multiple.dto';
import { LlmResponseDto } from './dto/llm-response.dto';

@ApiTags('LLM')
@Controller('llm')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  /**
   * Genera código con un solo modelo
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generar código con un modelo LLM',
    description: 'Genera código JavaScript basado en un prompt usando un modelo específico'
  })
  @ApiResponse({
    status: 200,
    description: 'Código generado exitosamente',
    type: LlmResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Error en la solicitud o generación de código'
  })
  async generateCode(@Body() dto: GenerateCodeDto): Promise<LlmResponseDto> {
    return await this.llmService.generateCode(dto);
  }

  /**
   * Genera código con múltiples modelos en paralelo
   */
  @Post('generate-multiple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generar código con múltiples modelos',
    description: 'Genera código con varios modelos en paralelo para comparar resultados'
  })
  @ApiResponse({
    status: 200,
    description: 'Código generado con múltiples modelos',
    type: [LlmResponseDto]
  })
  async generateMultiple(@Body() dto: GenerateMultipleDto): Promise<LlmResponseDto[]> {
    return await this.llmService.generateMultipleCodes(dto);
  }

  /**
   * Health check de los providers
   */
  @Get('health')
  @ApiOperation({
    summary: 'Verificar estado de los providers',
    description: 'Verifica si Ollama y otros providers están disponibles'
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de los providers'
  })
  async healthCheck() {
    return await this.llmService.healthCheck();
  }

  /**
   * Lista modelos disponibles
   */
  @Get('models')
  @ApiOperation({
    summary: 'Listar modelos disponibles',
    description: 'Obtiene la lista de modelos disponibles en cada provider'
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de modelos disponibles'
  })
  async listModels() {
    return await this.llmService.listAvailableModels();
  }
}