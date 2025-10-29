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
    description:
      'Ejecuta análisis completo de un código: métricas, seguridad y ejecución',
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
    description:
      'Analiza todos los códigos generados para una consulta específica',
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

  /**
   * Documentación de métricas y unidades
   */
  @Get('documentation')
  @ApiOperation({
    summary: 'Documentación de métricas',
    description: 'Explica todas las métricas, sus unidades y rangos de valores',
  })
  @ApiResponse({
    status: 200,
    description: 'Documentación completa de métricas',
  })
  getMetricsDocumentation() {
    return {
      categories: [
        {
          name: 'Corrección',
          weight: '40%',
          description: 'Evalúa si el código funciona correctamente',
          metrics: [
            {
              name: 'passRate',
              unit: '%',
              range: '0-100',
              description:
                'Porcentaje de casos de prueba que el código pasa exitosamente',
              interpretation: {
                excellent: '90-100%',
                good: '70-89%',
                regular: '50-69%',
                poor: '<50%',
              },
            },
            {
              name: 'errorHandlingScore',
              unit: 'pts',
              range: '0-100',
              description:
                'Calidad del manejo de errores (try-catch, validaciones)',
              interpretation: {
                excellent: '80-100 pts',
                good: '60-79 pts',
                regular: '40-59 pts',
                poor: '<40 pts',
              },
            },
            {
              name: 'runtimeErrorRate',
              unit: '%',
              range: '0-100',
              description: 'Porcentaje de ejecuciones que terminan con errores',
              interpretation: {
                excellent: '0%',
                good: '1-5%',
                regular: '6-10%',
                poor: '>10%',
              },
            },
          ],
        },
        {
          name: 'Eficiencia',
          weight: '25%',
          description: 'Evalúa el rendimiento y uso de recursos',
          metrics: [
            {
              name: 'avgExecutionTime',
              unit: 'ms',
              range: '0-∞',
              description: 'Tiempo promedio de ejecución en milisegundos',
              interpretation: {
                excellent: '<10 ms',
                good: '10-50 ms',
                regular: '51-100 ms',
                poor: '>100 ms',
              },
            },
            {
              name: 'memoryUsage',
              unit: 'MB',
              range: '0-∞',
              description:
                'Memoria utilizada en megabytes (nota: mide proceso completo)',
              interpretation: {
                note: 'Actualmente mide memoria del proceso Node.js completo, no solo de la función',
              },
            },
            {
              name: 'algorithmicComplexity',
              unit: 'nivel',
              range: '1-3',
              description: 'Complejidad algorítmica estimada',
              interpretation: {
                1: 'O(1) - Constante (excelente)',
                2: 'O(n) - Lineal (bueno)',
                3: 'O(n²) o peor - Cuadrática (regular)',
              },
            },
          ],
        },
        {
          name: 'Mantenibilidad',
          weight: '20%',
          description: 'Evalúa qué tan fácil es mantener el código',
          metrics: [
            {
              name: 'cyclomaticComplexity',
              unit: 'número',
              range: '1-∞',
              description:
                'Complejidad de McCabe - número de caminos independientes',
              interpretation: {
                excellent: '1-5',
                good: '6-10',
                regular: '11-20',
                poor: '>20',
              },
            },
            {
              name: 'linesOfCode',
              unit: 'líneas',
              range: '1-∞',
              description:
                'Cantidad de líneas de código (sin comentarios ni vacías)',
              interpretation: {
                note: 'Menos líneas = más conciso (generalmente mejor)',
              },
            },
            {
              name: 'nestingDepth',
              unit: 'nivel',
              range: '1-∞',
              description:
                'Profundidad máxima de anidamiento (bloques dentro de bloques)',
              interpretation: {
                excellent: '1-2',
                good: '3',
                regular: '4',
                poor: '>4',
              },
            },
            {
              name: 'cohesionScore',
              unit: 'pts',
              range: '0-100',
              description:
                'Responsabilidad única - penaliza código que hace muchas cosas',
              interpretation: {
                excellent: '100 pts (1 responsabilidad)',
                good: '80 pts (2 responsabilidades)',
                regular: '60 pts (3 responsabilidades)',
                poor: '<60 pts (>3 responsabilidades)',
              },
            },
          ],
        },
        {
          name: 'Seguridad',
          weight: '15%',
          description: 'Detecta vulnerabilidades y prácticas inseguras',
          metrics: [
            {
              name: 'xssVulnerabilities',
              unit: 'cantidad',
              range: '0-∞',
              description:
                'Número de vulnerabilidades XSS detectadas (innerHTML, document.write)',
              interpretation: {
                excellent: '0',
                poor: '>0',
              },
            },
            {
              name: 'injectionVulnerabilities',
              unit: 'cantidad',
              range: '0-∞',
              description:
                'Code injection detectado (eval, Function constructor)',
              interpretation: {
                excellent: '0',
                poor: '>0',
              },
            },
            {
              name: 'hardcodedSecrets',
              unit: 'cantidad',
              range: '0-∞',
              description: 'Contraseñas, API keys o tokens hardcodeados',
              interpretation: {
                excellent: '0',
                poor: '>0',
              },
            },
            {
              name: 'unsafeOperations',
              unit: 'cantidad',
              range: '0-∞',
              description:
                'Operaciones peligrosas (child_process, fs sin validación)',
              interpretation: {
                excellent: '0',
                poor: '>0',
              },
            },
          ],
        },
      ],
      scoring: {
        totalScore: {
          formula:
            'correction×0.4 + efficiency×0.25 + maintainability×0.2 + security×0.15',
          unit: 'pts',
          range: '0-100',
          interpretation: {
            excellent: '90-100 pts',
            veryGood: '80-89 pts',
            good: '70-79 pts',
            regular: '60-69 pts',
            needsImprovement: '<60 pts',
          },
        },
      },
      notes: [
        'Todas las puntuaciones (pts) están en escala 0-100',
        'Los porcentajes (%) también van de 0-100',
        'La memoria actualmente mide el proceso completo de Node.js',
        'Las vulnerabilidades: 0 es excelente, cualquier número >0 es problemático',
        'El score total está ponderado según la importancia de cada categoría',
      ],
    };
  }
}
