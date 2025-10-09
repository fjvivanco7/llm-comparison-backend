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
}