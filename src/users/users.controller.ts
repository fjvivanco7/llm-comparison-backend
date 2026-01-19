import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto, ChangePasswordDto, UpdatePreferencesDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ==================== PERFIL ====================

  @Get('profile')
  @ApiOperation({ summary: 'Obtener perfil del usuario' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario' })
  async getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Actualizar datos del perfil' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado' })
  async updateProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  // ==================== CONTRASEÑA ====================

  @Post('change-password')
  @ApiOperation({ summary: 'Cambiar contraseña' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 400, description: 'Contraseña actual incorrecta' })
  async changePassword(
    @CurrentUser() user: any,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, dto);
  }

  // ==================== PREFERENCIAS ====================

  @Get('preferences')
  @ApiOperation({ summary: 'Obtener preferencias del usuario' })
  @ApiResponse({ status: 200, description: 'Preferencias del usuario' })
  async getPreferences(@CurrentUser() user: any) {
    return this.usersService.getPreferences(user.id);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Actualizar preferencias' })
  @ApiResponse({ status: 200, description: 'Preferencias actualizadas' })
  async updatePreferences(
    @CurrentUser() user: any,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(user.id, dto);
  }

  // ==================== SESIONES ====================

  @Get('sessions')
  @ApiOperation({ summary: 'Ver sesiones activas' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones activas' })
  async getActiveSessions(@CurrentUser() user: any) {
    return this.usersService.getActiveSessions(user.id);
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Cerrar sesión en todos los dispositivos' })
  @ApiResponse({ status: 200, description: 'Todas las sesiones cerradas' })
  async logoutAllDevices(@CurrentUser() user: any) {
    return this.usersService.logoutAllDevices(user.id);
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Cerrar una sesión específica' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  async logoutSession(
    @CurrentUser() user: any,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.usersService.logoutSession(user.id, sessionId);
  }

  // ==================== ESTADÍSTICAS ====================

  @Get('usage-stats')
  @ApiOperation({ summary: 'Obtener estadísticas de uso' })
  @ApiResponse({ status: 200, description: 'Estadísticas de uso del usuario' })
  async getUsageStats(@CurrentUser() user: any) {
    return this.usersService.getUsageStats(user.id);
  }

  // ==================== ELIMINAR CUENTA ====================

  @Post('delete-account')
  @ApiOperation({ summary: 'Eliminar cuenta permanentemente' })
  @ApiResponse({ status: 200, description: 'Cuenta eliminada' })
  @ApiResponse({ status: 400, description: 'Contraseña incorrecta' })
  async deleteAccount(
    @CurrentUser() user: any,
    @Body() body: { password: string },
  ) {
    return this.usersService.deleteAccount(user.id, body.password);
  }
}
