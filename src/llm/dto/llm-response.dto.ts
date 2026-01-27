import { ApiProperty } from '@nestjs/swagger';

export class LlmResponseDto {
  @ApiProperty({
    description: 'Código generado por el LLM',
    example: 'function sortArray(arr) { return arr.sort((a, b) => a - b); }',
  })
  code: string;

  @ApiProperty({
    description: 'Modelo utilizado',
    example: 'codellama',
  })
  model: string;

  @ApiProperty({
    description: 'Proveedor utilizado',
    example: 'ollama',
  })
  provider: string;

  @ApiProperty({
    description: 'Tiempo de generación en milisegundos',
    example: 1250,
  })
  generationTimeMs: number;

  @ApiProperty({
    description: 'Timestamp de generación',
  })
  generatedAt: Date;

  // ============================================
  // NUEVOS CAMPOS: Rastreo de tokens
  // ============================================
  @ApiProperty({
    description: 'Tokens consumidos del prompt (entrada)',
    example: 42,
    required: false,
  })
  promptTokens?: number;

  @ApiProperty({
    description: 'Tokens generados en la respuesta (salida)',
    example: 156,
    required: false,
  })
  completionTokens?: number;

  @ApiProperty({
    description: 'Total de tokens consumidos (prompt + completion)',
    example: 198,
    required: false,
  })
  totalTokens?: number;

  @ApiProperty({
    description: 'Costo estimado en USD (si aplica)',
    example: 0.0012,
    required: false,
  })
  estimatedCost?: number;
}
