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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { QueriesService } from './queries.service';
import { CreateQueryDto } from './dto/create-query.dto';
import { QueryResponseDto } from './dto/query-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

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
   * Obtener todas las consultas del usuario autenticado
   */
  @Get()
  @ApiOperation({
    summary: 'Listar mis consultas',
    description:
      'Obtiene el historial completo de consultas del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de consultas',
    type: [QueryResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async findAll(@CurrentUser() user: any): Promise<QueryResponseDto[]> {
    return await this.queriesService.findAll(user.id);
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
}