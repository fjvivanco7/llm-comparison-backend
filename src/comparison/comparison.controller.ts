import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ComparisonService } from './comparison.service';
import { QueryComparisonDto } from './dto/comparison-result.dto';
import { GlobalRankingDto } from './dto/ranking.dto';
import { ComparisonStatsDto } from './dto/stats.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Comparison')
@Controller('comparison')
@UseGuards(JwtAuthGuard) // ← PROTEGER todas las rutas
@ApiBearerAuth() // ← Requerir token en Swagger
export class ComparisonController {
  constructor(private readonly comparisonService: ComparisonService) {}

  /**
   * Comparar todos los LLMs de una consulta
   */
  @Get('query/:queryId')
  @ApiOperation({
    summary: 'Comparar LLMs de una consulta',
    description:
      'Compara todos los códigos generados por diferentes LLMs para una consulta específica',
  })
  @ApiParam({ name: 'queryId', description: 'ID de la consulta' })
  @ApiResponse({
    status: 200,
    description: 'Comparación completada',
    type: QueryComparisonDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Consulta no encontrada o sin códigos analizados',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async compareQuery(
    @Param('queryId', ParseIntPipe) queryId: number,
  ): Promise<QueryComparisonDto> {
    return await this.comparisonService.compareQuery(queryId);
  }

  /**
   * Obtener el ganador de una consulta
   */
  @Get('winner/:queryId')
  @ApiOperation({
    summary: 'Obtener ganador de una consulta',
    description: 'Retorna el LLM con el mejor score en una consulta específica',
  })
  @ApiParam({ name: 'queryId', description: 'ID de la consulta' })
  @ApiResponse({
    status: 200,
    description: 'Ganador identificado',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async getWinner(@Param('queryId', ParseIntPipe) queryId: number) {
    return await this.comparisonService.getWinner(queryId);
  }

  /**
   * Ranking global de LLMs
   */
  @Get('ranking')
  @ApiOperation({
    summary: 'Ranking global de LLMs',
    description:
      'Genera un ranking general de todos los LLMs basado en todas las consultas analizadas',
  })
  @ApiResponse({
    status: 200,
    description: 'Ranking generado',
    type: GlobalRankingDto,
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async getGlobalRanking(): Promise<GlobalRankingDto> {
    return await this.comparisonService.getGlobalRanking();
  }

  /**
   * Estadísticas de comparación
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Estadísticas de comparación',
    description:
      'Obtiene estadísticas generales: mejor por categoría, más consistente, etc.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas generadas',
    type: ComparisonStatsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async getStats(): Promise<ComparisonStatsDto> {
    return await this.comparisonService.getStats();
  }
}