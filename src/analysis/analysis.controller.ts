import {
  Controller,
  Post,
  Get,
  Param,
  ParseIntPipe,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AnalysisService, CompleteAnalysis } from './analysis.service';
import { TestCase } from './services/execution.service';

@ApiTags('Analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  /**
   * Analizar un código específico
   */
  @Post('analyze/:codeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analizar código específico',
    description: 'Ejecuta análisis completo de un código: métricas, seguridad y ejecución',
  })
  @ApiParam({ name: 'codeId', description: 'ID del código generado' })
  @ApiResponse({
    status: 200,
    description: 'Análisis completado exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Código no encontrado',
  })
  async analyzeCode(
    @Param('codeId', ParseIntPipe) codeId: number,
    @Body() body: { testCases?: TestCase[] },
  ): Promise<CompleteAnalysis> {
    return await this.analysisService.analyzeCode(codeId, body.testCases);
  }

  /**
   * Analizar todos los códigos de una consulta
   */
  @Post('batch/:queryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analizar todos los códigos de una consulta',
    description: 'Analiza todos los códigos generados para una consulta específica',
  })
  @ApiParam({ name: 'queryId', description: 'ID de la consulta' })
  @ApiResponse({
    status: 200,
    description: 'Todos los códigos analizados',
    type: [Object],
  })
  async analyzeQuery(
    @Param('queryId', ParseIntPipe) queryId: number,
  ): Promise<CompleteAnalysis[]> {
    return await this.analysisService.analyzeQuery(queryId);
  }

  /**
   * Obtener métricas de un código
   */
  @Get('metrics/:codeId')
  @ApiOperation({
    summary: 'Obtener métricas de un código',
    description: 'Obtiene las métricas guardadas de un código específico',
  })
  @ApiParam({ name: 'codeId', description: 'ID del código generado' })
  @ApiResponse({
    status: 200,
    description: 'Métricas encontradas',
  })
  @ApiResponse({
    status: 404,
    description: 'Métricas no encontradas',
  })
  async getMetrics(@Param('codeId', ParseIntPipe) codeId: number) {
    return await this.analysisService.getMetrics(codeId);
  }
}