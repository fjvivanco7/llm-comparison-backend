import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateSettingDto, BulkUpdateSettingsDto } from './dto/update-settings.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==========================================
  // DASHBOARD
  // ==========================================
  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard de administración' })
  @ApiResponse({ status: 200, description: 'Estadísticas del dashboard' })
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas del sistema' })
  @ApiResponse({ status: 200, description: 'Estadísticas detalladas' })
  async getSystemStats() {
    return this.adminService.getSystemStats();
  }

  // ==========================================
  // USERS
  // ==========================================
  @Get('users')
  @ApiOperation({ summary: 'Listar todos los usuarios' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiResponse({ status: 200, description: 'Lista de usuarios paginada' })
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || '10', 10) || 10));
    return this.adminService.getUsers(pageNum, limitNum, search, role);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Detalles del usuario' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async getUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getUserById(id);
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Actualizar usuario' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar usuario' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Usuario eliminado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 400, description: 'No se puede eliminar al único admin' })
  async deleteUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteUser(id);
  }

  @Get('users/:id/activity')
  @ApiOperation({ summary: 'Actividad del usuario' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Historial de actividad' })
  async getUserActivity(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit || '10', 10) || 10));
    return this.adminService.getUserActivity(id, pageNum, limitNum);
  }

  // ==========================================
  // SETTINGS
  // ==========================================
  @Get('settings')
  @ApiOperation({ summary: 'Obtener configuraciones' })
  @ApiResponse({ status: 200, description: 'Configuraciones de la aplicación' })
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings/:key')
  @ApiOperation({ summary: 'Actualizar una configuración' })
  @ApiParam({ name: 'key', type: String })
  @ApiResponse({ status: 200, description: 'Configuración actualizada' })
  async updateSetting(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
  ) {
    return this.adminService.updateSetting(key, dto.value, dto.description);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Actualizar múltiples configuraciones' })
  @ApiResponse({ status: 200, description: 'Configuraciones actualizadas' })
  async updateSettings(@Body() dto: BulkUpdateSettingsDto) {
    return this.adminService.updateSettings(dto.settings);
  }
}
