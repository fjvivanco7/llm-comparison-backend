import { ApiProperty } from '@nestjs/swagger';

export class ComparisonStatsDto {
  @ApiProperty({ description: 'Mejor LLM por categoría' })
  bestByCategory: {
    correction: { llmName: string; avgScore: number };
    efficiency: { llmName: string; avgScore: number };
    maintainability: { llmName: string; avgScore: number };
    security: { llmName: string; avgScore: number };
  };

  @ApiProperty({
    description: 'LLM más consistente (menor desviación estándar)',
  })
  mostConsistent: {
    llmName: string;
    stdDeviation: number;
  };

  @ApiProperty({ description: 'Estadísticas generales' })
  overall: {
    totalQueries: number;
    totalCodes: number;
    avgScoreAllLlms: number;
  };
}
