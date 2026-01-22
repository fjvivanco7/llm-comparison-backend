import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingDto {
  @ApiProperty({ description: 'Valor de la configuración' })
  @IsString()
  value: string;

  @ApiProperty({ required: false, description: 'Descripción de la configuración' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class BulkUpdateSettingsDto {
  @ApiProperty({
    description: 'Configuraciones a actualizar',
    example: { dailyQueryLimit: '10', maxModelsPerQuery: '5' },
  })
  @IsObject()
  settings: Record<string, string>;
}
