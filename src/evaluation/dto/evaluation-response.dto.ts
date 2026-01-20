import { ApiProperty } from '@nestjs/swagger';

export class EvaluationResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  codeId: number;

  @ApiProperty()
  evaluatorId: number;

  @ApiProperty()
  evaluatorName: string;

  @ApiProperty()
  readabilityScore: number;

  @ApiProperty()
  clarityScore: number;

  @ApiProperty()
  structureScore: number;

  @ApiProperty()
  documentationScore: number;

  @ApiProperty()
  totalScore: number;

  @ApiProperty({ required: false })
  generalComments?: string;

  @ApiProperty({ required: false })
  readabilityComments?: string;

  @ApiProperty({ required: false })
  clarityComments?: string;

  @ApiProperty({ required: false })
  structureComments?: string;

  @ApiProperty({ required: false })
  documentationComments?: string;

  @ApiProperty({ required: false, type: [String] })
  problemTags?: string[];

  @ApiProperty()
  evaluatedAt: Date;
}