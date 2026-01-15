import { IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: 14, description: 'Tamaño de fuente (10-24)' })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(24)
  promptFontSize?: number;

  @ApiPropertyOptional({ example: 'mono', enum: ['mono', 'sans', 'serif'] })
  @IsOptional()
  @IsString()
  @IsIn(['mono', 'sans', 'serif'])
  promptFontFamily?: string;

  @ApiPropertyOptional({ example: 'dark', enum: ['dark', 'light', 'system'] })
  @IsOptional()
  @IsString()
  @IsIn(['dark', 'light', 'system'])
  theme?: string;

  @ApiPropertyOptional({ example: 'es', enum: ['es', 'en'] })
  @IsOptional()
  @IsString()
  @IsIn(['es', 'en'])
  language?: string;
}
