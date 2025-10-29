import { ApiProperty } from '@nestjs/swagger';

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
