import { ApiProperty } from '@nestjs/swagger';

export class CodeMetricsResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  codeId: number;

  // Corrección
  @ApiProperty({ required: false })
  passRate?: number;

  @ApiProperty({ required: false })
  errorHandlingScore?: number;

  @ApiProperty({ required: false })
  runtimeErrorRate?: number;

  // Eficiencia
  @ApiProperty({ required: false })
  avgExecutionTime?: number;

  @ApiProperty({ required: false })
  memoryUsage?: number;

  @ApiProperty({ required: false })
  algorithmicComplexity?: number;

  // Mantenibilidad
  @ApiProperty({ required: false })
  cyclomaticComplexity?: number;

  @ApiProperty({ required: false })
  linesOfCode?: number;

  @ApiProperty({ required: false })
  nestingDepth?: number;

  @ApiProperty({ required: false })
  cohesionScore?: number;

  // Seguridad
  @ApiProperty({ required: false })
  xssVulnerabilities?: number;

  @ApiProperty({ required: false })
  injectionVulnerabilities?: number;

  @ApiProperty({ required: false })
  hardcodedSecrets?: number;

  @ApiProperty({ required: false })
  unsafeOperations?: number;

  // Total
  @ApiProperty({ required: false })
  totalScore?: number;

  @ApiProperty()
  analyzedAt: Date;
}

export class TokenUsageResponseDto {
  @ApiProperty({ description: 'Tokens del prompt enviado', required: false })
  promptTokens?: number;

  @ApiProperty({ description: 'Tokens de la respuesta generada', required: false })
  completionTokens?: number;

  @ApiProperty({ description: 'Total de tokens consumidos', required: false })
  totalTokens?: number;

  @ApiProperty({ description: 'Costo estimado en USD', required: false })
  estimatedCost?: number;
}

export class GeneratedCodeResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  llmName: string;

  @ApiProperty()
  codeContent: string;

  @ApiProperty()
  generationTimeMs: number;

  @ApiProperty()
  generatedAt: Date;

  @ApiProperty({ type: TokenUsageResponseDto, required: false, description: 'Información de tokens consumidos' })
  tokenUsage?: TokenUsageResponseDto;

  @ApiProperty({ type: CodeMetricsResponseDto, required: false })
  metrics?: CodeMetricsResponseDto;
}

export class QueryResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  userPrompt: string;

  @ApiProperty({ required: false })
  promptCategory?: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [GeneratedCodeResponseDto] })
  generatedCodes: GeneratedCodeResponseDto[];
}