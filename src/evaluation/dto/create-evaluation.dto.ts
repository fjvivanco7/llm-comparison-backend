import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEvaluationDto {
  @ApiProperty({
    description: 'Legibilidad: nombres claros, formato consistente',
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  readabilityScore: number;

  @ApiProperty({
    description: 'Claridad: lógica comprensible, sin ambigüedades',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  clarityScore: number;

  @ApiProperty({
    description: 'Estructura: organización, modularidad, patrones',
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  structureScore: number;

  @ApiProperty({
    description: 'Documentación: comentarios útiles, explicaciones',
    minimum: 1,
    maximum: 5,
    example: 3,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  documentationScore: number;

  @ApiProperty({
    description: 'Comentarios generales sobre el código',
    required: false,
  })
  @IsString()
  @IsOptional()
  generalComments?: string;

  @ApiProperty({
    description: 'Comentarios sobre legibilidad',
    required: false,
  })
  @IsString()
  @IsOptional()
  readabilityComments?: string;

  @ApiProperty({
    description: 'Comentarios sobre claridad',
    required: false,
  })
  @IsString()
  @IsOptional()
  clarityComments?: string;

  @ApiProperty({
    description: 'Comentarios sobre estructura',
    required: false,
  })
  @IsString()
  @IsOptional()
  structureComments?: string;

  @ApiProperty({
    description: 'Comentarios sobre documentación',
    required: false,
  })
  @IsString()
  @IsOptional()
  documentationComments?: string;
}