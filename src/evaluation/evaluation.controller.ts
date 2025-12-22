import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { EvaluationService } from './evaluation.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationResponseDto } from './dto/evaluation-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Qualitative Evaluation')
@Controller('evaluation')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  /**
   * Crear evaluación cualitativa (solo evaluadores)
   */
  @Post('code/:codeId')
  @Roles(UserRole.EVALUATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Crear evaluación cualitativa',
    description: 'Solo evaluadores pueden calificar código cualitativamente',
  })
  @ApiParam({ name: 'codeId', description: 'ID del código a evaluar' })
  @ApiResponse({
    status: 201,
    description: 'Evaluación creada',
    type: EvaluationResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permisos de evaluador',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya evaluaste este código',
  })
  async createEvaluation(
    @Param('codeId', ParseIntPipe) codeId: number,
    @Body() dto: CreateEvaluationDto,
    @Req() req: any,
  ): Promise<EvaluationResponseDto> {
    return await this.evaluationService.createEvaluation(
      codeId,
      req.user.id,
      dto,
    );
  }

  /**
   * Obtener evaluaciones de un código
   */
  @Get('code/:codeId')
  @ApiOperation({
    summary: 'Obtener evaluaciones de un código',
    description: 'Lista todas las evaluaciones cualitativas de un código',
  })
  @ApiParam({ name: 'codeId', description: 'ID del código' })
  @ApiResponse({
    status: 200,
    description: 'Evaluaciones encontradas',
    type: [EvaluationResponseDto],
  })
  async getEvaluationsByCode(
    @Param('codeId', ParseIntPipe) codeId: number,
  ): Promise<EvaluationResponseDto[]> {
    return await this.evaluationService.getEvaluationsByCode(codeId);
  }

  /**
   * Obtener códigos pendientes de evaluar
   */
  @Get('pending')
  @Roles(UserRole.EVALUATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Obtener códigos pendientes de evaluar',
    description: 'Lista códigos que el evaluador aún no ha calificado',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de códigos pendientes',
  })
  async getPendingCodes(@Req() req: any) {
    return await this.evaluationService.getPendingCodesForEvaluator(
      req.user.id,
    );
  }

  /**
   * Estadísticas de evaluación
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Estadísticas de evaluación cualitativa',
    description: 'Promedios y mejores códigos. Evaluadores ven sus propias stats, admins ven globales',
  })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas generadas',
  })
  async getStats(@Req() req: any) {
    const user = req.user;

    // Si es evaluador, mostrar solo sus estadísticas
    if (user.role === 'EVALUATOR') {
      return await this.evaluationService.getEvaluationStats(user.id);
    }

    // Si es admin, mostrar estadísticas globales
    return await this.evaluationService.getEvaluationStats();
  }

  /**
   * Obtener mis evaluaciones (historial del evaluador)
   */
  @Get('my-evaluations')
  @Roles(UserRole.EVALUATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Obtener mis evaluaciones',
    description: 'Lista todas las evaluaciones realizadas por el evaluador actual',
  })
  @ApiResponse({
    status: 200,
    description: 'Evaluaciones encontradas',
    type: [EvaluationResponseDto],
  })
  async getMyEvaluations(@Req() req: any) {
    return await this.evaluationService.getMyEvaluations(req.user.id);
  }
}