import { ApiProperty } from '@nestjs/swagger';

export class LlmRankingDto {
  @ApiProperty({ description: 'Nombre del LLM' })
  llmName: string;

  @ApiProperty({ description: 'Cantidad de códigos analizados' })
  totalAnalyzed: number;

  @ApiProperty({ description: 'Score promedio total' })
  avgTotalScore: number;

  @ApiProperty({ description: 'Scores promedio por categoría' })
  avgCategoryScores: {
    correction: number;
    efficiency: number;
    maintainability: number;
    security: number;
  };

  @ApiProperty({ description: 'Cantidad de veces que ganó' })
  wins: number;

  @ApiProperty({ description: 'Posición en ranking general' })
  overallRank: number;
}

export class GlobalRankingDto {
  @ApiProperty({
    description: 'Ranking general de LLMs',
    type: [LlmRankingDto],
  })
  ranking: LlmRankingDto[];

  @ApiProperty({ description: 'Total de consultas analizadas' })
  totalQueries: number;

  @ApiProperty({ description: 'Total de códigos analizados' })
  totalCodesAnalyzed: number;

  @ApiProperty({ description: 'Fecha del análisis' })
  generatedAt: Date;
}
