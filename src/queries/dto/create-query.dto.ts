import { IsString, IsNotEmpty, IsArray, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum PromptCategory {
  ALGORITHMS = 'algorithms',
  WEB = 'web',
  UTILITIES = 'utilities',
}

export class CreateQueryDto {
  @ApiProperty({
    description: 'Prompt del usuario',
    example: 'Crear una función que ordene un array de números',
  })
  @IsString()
  @IsNotEmpty()
  userPrompt: string;

  @ApiProperty({
    description: 'Categoría del prompt',
    enum: PromptCategory,
    example: PromptCategory.ALGORITHMS,
    required: false,
  })
  @IsEnum(PromptCategory)
  @IsOptional()
  promptCategory?: PromptCategory;

  @ApiProperty({
    description: 'Modelos a usar para generar código',
    example: ['codellama', 'llama3.2', 'deepseek-coder', 'qwen2.5-coder'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  models: string[];
}