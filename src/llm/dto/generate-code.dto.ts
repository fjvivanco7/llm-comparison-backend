import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum LlmProvider {
  OLLAMA = 'ollama',
  OPENROUTER = 'openrouter',
}

export class GenerateCodeDto {
  @ApiProperty({
    description: 'El prompt del usuario para generar código',
    example: 'Crear una función que ordene un array de números',
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({
    description: 'Proveedor de LLM a usar',
    enum: LlmProvider,
    example: 'ollama',
    default: 'ollama',
  })
  @IsEnum(LlmProvider)
  @IsOptional()
  provider?: LlmProvider = LlmProvider.OLLAMA;

  @ApiProperty({
    description: 'Modelo específico a usar',
    example: 'codellama',
    required: false,
  })
  @IsString()
  @IsOptional()
  model?: string;
}
