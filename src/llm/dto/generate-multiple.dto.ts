import { IsString, IsNotEmpty, IsArray, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LlmProvider } from './generate-code.dto';

export class GenerateMultipleDto {
  @ApiProperty({
    description: 'El prompt del usuario',
    example: 'Crear función que valide email',
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({
    description: 'Lista de modelos a usar',
    example: ['llama3.2', 'codellama', 'deepseek-coder', 'qwen2.5-coder'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  models: string[];

  @ApiProperty({
    description: 'Proveedor de LLM',
    enum: LlmProvider,
    example: 'ollama',
  })
  @IsEnum(LlmProvider)
  provider: LlmProvider;
}