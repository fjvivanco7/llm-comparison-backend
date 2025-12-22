import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
  Req, // ← AGREGADO
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ComparisonService } from './comparison.service';
import { QueryComparisonDto } from './dto/comparison-result.dto';
import { GlobalRankingDto } from './dto/ranking.dto';
import { ComparisonStatsDto } from './dto/stats.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Comparison')
@Controller('comparison')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
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
   * Ranking de LLMs (filtrado por rol)
   */
  @Get('ranking')
  @ApiOperation({
    summary: 'Ranking de LLMs',
    description:
      'Clasificación de modelos. Usuarios ven su propio ranking, evaluadores ven ranking global',
  })
  @ApiResponse({
    status: 200,
    description: 'Ranking calculado exitosamente',
    type: GlobalRankingDto,
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async getGlobalRanking(@Req() req: any): Promise<GlobalRankingDto> {
    const user = req.user;

    // Si es evaluador o admin, mostrar ranking global (sin filtro)
    if (user.role === 'EVALUATOR' || user.role === 'ADMIN') {
      return await this.comparisonService.getGlobalRanking();
    }

    // Si es usuario normal, mostrar solo su ranking
    return await this.comparisonService.getGlobalRanking(user.id);
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