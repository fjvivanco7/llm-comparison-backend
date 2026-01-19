import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { QueriesService } from './queries.service';
import { CreateQueryDto } from './dto/create-query.dto';
import { QueryResponseDto } from './dto/query-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BadRequestException } from '@nestjs/common';

@ApiTags('Queries')
@Controller('queries')
@UseGuards(JwtAuthGuard) // ← PROTEGER todas las rutas
@ApiBearerAuth() // ← Requerir token en Swagger
export class QueriesController {
  constructor(private readonly queriesService: QueriesService) {}

  /**
   * Crear nueva consulta y generar código con múltiples LLMs
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nueva consulta',
    description:
      'Crea una consulta, genera código con múltiples modelos y guarda todo en BD',
  })
  @ApiResponse({
    status: 201,
    description: 'Consulta creada exitosamente con códigos generados',
    type: QueryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Error en la solicitud',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async create(
    @Body() createQueryDto: CreateQueryDto,
    @CurrentUser() user: any, // ← Obtener usuario del token
  ): Promise<QueryResponseDto> {
    return await this.queriesService.createQuery(createQueryDto, user.id);
  }

  /**
   * Obtener todas las consultas del usuario autenticado con paginación
   */
  @Get()
  @ApiOperation({
    summary: 'Listar mis consultas',
    description:
      'Obtiene el historial de consultas del usuario autenticado con paginación',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Elementos por página (default: 10, max: 50)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de consultas paginada',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || '10', 10) || 10));
    return await this.queriesService.findAll(user.id, pageNum, limitNum);
  }

  /**
   * Obtener una consulta específica por ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener mi consulta por ID',
    description:
      'Obtiene los detalles de una consulta específica (solo si pertenece al usuario)',
  })
  @ApiParam({ name: 'id', description: 'ID de la consulta' })
  @ApiResponse({
    status: 200,
    description: 'Consulta encontrada',
    type: QueryResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Consulta no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<QueryResponseDto> {
    return await this.queriesService.findOne(id, user.id);
  }

  /**
   * Eliminar una consulta
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar mi consulta',
    description: 'Elimina una consulta y todos sus códigos asociados',
  })
  @ApiParam({ name: 'id', description: 'ID de la consulta' })
  @ApiResponse({
    status: 204,
    description: 'Consulta eliminada exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Consulta no encontrada',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<void> {
    return await this.queriesService.remove(id, user.id);
  }
  /**
   * Obtener un código generado específico por su ID
   */
  @Get('code/:codeId')
  @ApiOperation({
    summary: 'Obtener código generado por ID',
    description: 'Obtiene los detalles de un código generado específico',
  })
  @ApiParam({
    name: 'codeId',
    description: 'ID del código generado',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Código encontrado',
  })
  @ApiResponse({
    status: 404,
    description: 'Código no encontrado',
  })
  async getCodeById(
    @Param('codeId') codeId: string,
    @Req() req: any,
  ) {
    const parsedCodeId = parseInt(codeId, 10);

    if (isNaN(parsedCodeId)) {
      throw new BadRequestException('ID de código inválido');
    }

    return await this.queriesService.getCodeById(
      parsedCodeId,
      req.user.id,
      req.user.role
    );
  }
}