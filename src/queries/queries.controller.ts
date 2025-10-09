import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseIntPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { QueriesService } from './queries.service';
import { CreateQueryDto } from './dto/create-query.dto';
import { QueryResponseDto } from './dto/query-response.dto';

@ApiTags('Queries')
@Controller('queries')
export class QueriesController {
  constructor(private readonly queriesService: QueriesService) {}

  /**
   * Crear nueva consulta y generar código con múltiples LLMs
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear nueva consulta',
    description: 'Crea una consulta, genera código con múltiples modelos y guarda todo en BD'
  })
  @ApiResponse({
    status: 201,
    description: 'Consulta creada exitosamente con códigos generados',
    type: QueryResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Error en la solicitud'
  })
  async create(@Body() createQueryDto: CreateQueryDto): Promise<QueryResponseDto> {
    return await this.queriesService.createQuery(createQueryDto);
  }

  /**
   * Obtener todas las consultas
   */
  @Get()
  @ApiOperation({
    summary: 'Listar todas las consultas',
    description: 'Obtiene el historial completo de consultas con sus códigos generados'
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de consultas',
    type: [QueryResponseDto]
  })
  async findAll(): Promise<QueryResponseDto[]> {
    return await this.queriesService.findAll();
  }

  /**
   * Obtener una consulta específica por ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener consulta por ID',
    description: 'Obtiene los detalles de una consulta específica con todos sus códigos'
  })
  @ApiParam({ name: 'id', description: 'ID de la consulta' })
  @ApiResponse({
    status: 200,
    description: 'Consulta encontrada',
    type: QueryResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Consulta no encontrada'
  })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<QueryResponseDto> {
    return await this.queriesService.findOne(id);
  }

  /**
   * Eliminar una consulta
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar consulta',
    description: 'Elimina una consulta y todos sus códigos asociados'
  })
  @ApiParam({ name: 'id', description: 'ID de la consulta' })
  @ApiResponse({
    status: 204,
    description: 'Consulta eliminada exitosamente'
  })
  @ApiResponse({
    status: 404,
    description: 'Consulta no encontrada'
  })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return await this.queriesService.remove(id);
  }
}