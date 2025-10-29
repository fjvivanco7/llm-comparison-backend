import { ApiProperty } from '@nestjs/swagger';

export class LlmComparison {
  @ApiProperty({ description: 'Nombre del LLM' })
  llmName: string;

  @ApiProperty({ description: 'ID del código generado' })
  codeId: number;

  @ApiProperty({ description: 'Snippet del código' })
  codeSnippet: string;

  @ApiProperty({ description: 'Score total' })
  totalScore: number;

  @ApiProperty({ description: 'Scores por categoría' })
  categoryScores: {
    correction: number;
    efficiency: number;
    maintainability: number;
    security: number;
  };

  @ApiProperty({ description: 'Ranking en esta consulta (1 = mejor)' })
  rank: number;
}

export class QueryComparisonDto {
  @ApiProperty({ description: 'ID de la consulta' })
  queryId: number;

  @ApiProperty({ description: 'Prompt del usuario' })
  userPrompt: string;

  @ApiProperty({ description: 'Fecha de creación' })
  createdAt: Date;

  @ApiProperty({ description: 'Comparación de LLMs', type: [LlmComparison] })
  llmComparisons: LlmComparison[];

  @ApiProperty({ description: 'LLM ganador' })
  winner: {
    llmName: string;
    totalScore: number;
    reason: string;
  };

  @ApiProperty({ description: 'Diferencia entre mejor y peor' })
  scoreSpread: number;
}
