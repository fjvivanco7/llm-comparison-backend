import { IsInt, IsString, IsOptional, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class CodeRankingDto {
  @ApiProperty({ description: 'ID del código generado' })
  @IsInt()
  codeId: number;

  @ApiProperty({ description: 'Posición en el ranking (1 = mejor)', minimum: 1 })
  @IsInt()
  rank: number;
}

export class CreateComparativeEvaluationDto {
  @ApiProperty({ description: 'ID de la consulta (query) que contiene los códigos a comparar' })
  @IsInt()
  @IsNotEmpty()
  queryId: number;

  @ApiProperty({
    description: 'Rankings de los códigos ordenados del mejor al peor',
    type: [CodeRankingDto],
    example: [{ codeId: 1, rank: 1 }, { codeId: 2, rank: 2 }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CodeRankingDto)
  rankings: CodeRankingDto[];

  @ApiProperty({
    description: 'ID del código ganador (el mejor)',
    required: false,
  })
  @IsInt()
  @IsOptional()
  winnerId?: number;

  @ApiProperty({
    description: 'Notas explicando por qué se eligió este ranking',
    required: false,
  })
  @IsString()
  @IsOptional()
  comparisonNotes?: string;
}

export class ComparativeEvaluationResponseDto {
  id: number;
  queryId: number;
  evaluatorId: number;
  rankings: CodeRankingDto[];
  winnerId: number | null;
  comparisonNotes: string | null;
  evaluatedAt: Date;
}
