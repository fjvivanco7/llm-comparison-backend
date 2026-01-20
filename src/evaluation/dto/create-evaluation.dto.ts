import { IsInt, IsString, IsOptional, Min, Max, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Tags de problemas disponibles
export const PROBLEM_TAGS = [
  'has_bugs',           // Tiene bugs
  'redundant_code',     // Código redundante
  'security_issue',     // Problema de seguridad
  'bad_practice',       // Mala práctica
  'missing_error_handling', // Falta manejo de errores
  'incomplete_code',    // Código incompleto
  'poor_naming',        // Nombres poco descriptivos
  'no_comments',        // Sin comentarios
  'inefficient',        // Ineficiente
  'hard_to_read',       // Difícil de leer
] as const;

export type ProblemTag = typeof PROBLEM_TAGS[number];

// Rúbricas de evaluación
export const SCORE_RUBRICS = {
  1: { label: 'Muy deficiente', description: 'Código ilegible o no funcional, problemas serios' },
  2: { label: 'Deficiente', description: 'Funciona parcialmente pero tiene problemas importantes' },
  3: { label: 'Aceptable', description: 'Cumple lo básico, hay espacio para mejora' },
  4: { label: 'Bueno', description: 'Bien estructurado, pocas mejoras necesarias' },
  5: { label: 'Excelente', description: 'Código ejemplar, sigue mejores prácticas' },
};

export class CreateEvaluationDto {
  // ============================================
  // CRITERIOS ORIGINALES (Obligatorios)
  // ============================================
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

  // ============================================
  // CRITERIOS NUEVOS (Opcionales)
  // ============================================
  @ApiProperty({
    description: 'Correctitud funcional: ¿hace lo que debe hacer?',
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  functionalityScore?: number;

  @ApiProperty({
    description: 'Eficiencia: rendimiento, uso de recursos',
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  efficiencyScore?: number;

  @ApiProperty({
    description: 'Manejo de errores: validaciones, excepciones',
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  errorHandlingScore?: number;

  @ApiProperty({
    description: 'Buenas prácticas: patrones, convenciones',
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  bestPracticesScore?: number;

  @ApiProperty({
    description: 'Seguridad: vulnerabilidades, validaciones',
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  securityScore?: number;

  // ============================================
  // TAGS DE PROBLEMAS
  // ============================================
  @ApiProperty({
    description: 'Tags de problemas encontrados en el código',
    example: ['has_bugs', 'missing_error_handling'],
    required: false,
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  problemTags?: string[];

  // ============================================
  // COMENTARIOS
  // ============================================
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