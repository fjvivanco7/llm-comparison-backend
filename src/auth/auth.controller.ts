import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { VerifyTwoFactorDto, DisableTwoFactorDto, TwoFactorLoginDto } from './dto/two-factor.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  /**
   * Registro de nuevo usuario
   */
  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 registros por hora
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar nuevo usuario',
    description: 'Crea una cuenta nueva, envía email de verificación y retorna un token JWT',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'El email ya está registrado',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos, intenta más tarde',
  })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return await this.authService.register(dto);
  }

  /**
   * Login de usuario
   */
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 intentos por 15 minutos
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description: 'Autentica un usuario y retorna un token JWT',
  })
  @ApiResponse({
    status: 200,
    description: 'Login exitoso',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos de login, intenta en 15 minutos',
  })
  async login(@Body() dto: LoginDto, @Req() req: any): Promise<AuthResponseDto> {
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || 'Unknown';
    return await this.authService.login(dto, deviceInfo, ipAddress);
  }

  /**
   * Verificar email con token
   */
  @Get('verify-email')
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 10 intentos por hora
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar email',
    description: 'Verifica el email del usuario usando el token enviado por correo',
  })
  @ApiQuery({
    name: 'token',
    description: 'Token de verificación recibido por email',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Email verificado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Token inválido o expirado',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos, intenta más tarde',
  })
  async verifyEmail(@Query('token') token: string) {
    return await this.authService.verifyEmail(token);
  }

  /**
   * Reenviar email de verificación
   */
  @Post('resend-verification')
  @Throttle({ default: { limit: 2, ttl: 3600000 } }) // 2 reenvíos por hora
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reenviar email de verificación',
    description: 'Envía un nuevo email de verificación al usuario',
  })
  @ApiResponse({
    status: 200,
    description: 'Email de verificación enviado',
  })
  @ApiResponse({
    status: 400,
    description: 'Email ya verificado o usuario no encontrado',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos, intenta en 1 hora',
  })
  async resendVerification(@Body() body: { email: string }) {
    return await this.authService.resendVerificationEmail(body.email);
  }

  /**
   * Obtener perfil del usuario autenticado
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener perfil del usuario',
    description: 'Retorna la información del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil del usuario',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async getProfile(@CurrentUser() user: any) {
    return user;
  }

  /**
   * Solicitar recuperación de contraseña
   */
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 solicitudes por hora
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar recuperación de contraseña',
    description: 'Envía un email con instrucciones para restablecer la contraseña',
  })
  @ApiResponse({
    status: 200,
    description: 'Email de recuperación enviado (si el email existe)',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos, intenta más tarde',
  })
  async forgotPassword(@Body() body: { email: string }) {
    return await this.authService.forgotPassword(body.email);
  }

  /**
   * Restablecer contraseña con token
   */
  @Post('reset-password')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 intentos por hora
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer contraseña',
    description: 'Establece una nueva contraseña usando el token recibido por email',
  })
  @ApiResponse({
    status: 200,
    description: 'Contraseña restablecida exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Token inválido o expirado',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos, intenta más tarde',
  })
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return await this.authService.resetPassword(body.token, body.newPassword);
  }

  // ============================================
  // 2FA ENDPOINTS
  // ============================================

  /**
   * Generar QR code para activar 2FA
   */
  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Configurar 2FA',
    description: 'Genera el código QR y secreto para configurar la autenticación de dos factores',
  })
  @ApiResponse({ status: 200, description: 'QR code generado' })
  @ApiResponse({ status: 400, description: '2FA ya está activado' })
  async setup2FA(@CurrentUser() user: any) {
    return await this.twoFactorService.generateSetup(user.id);
  }

  /**
   * Verificar código y activar 2FA
   */
  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activar 2FA',
    description: 'Verifica el código del autenticador y activa 2FA',
  })
  @ApiResponse({ status: 200, description: '2FA activado, retorna códigos de respaldo' })
  @ApiResponse({ status: 400, description: 'Código inválido' })
  async enable2FA(@CurrentUser() user: any, @Body() dto: VerifyTwoFactorDto) {
    return await this.twoFactorService.verifyAndEnable(user.id, dto.code);
  }

  /**
   * Desactivar 2FA
   */
  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desactivar 2FA',
    description: 'Desactiva la autenticación de dos factores',
  })
  @ApiResponse({ status: 200, description: '2FA desactivado' })
  @ApiResponse({ status: 401, description: 'Código 2FA inválido' })
  async disable2FA(@CurrentUser() user: any, @Body() dto: DisableTwoFactorDto) {
    return await this.twoFactorService.disable(user.id, dto.password, dto.code);
  }

  /**
   * Regenerar códigos de respaldo
   */
  @Post('2fa/backup-codes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerar códigos de respaldo',
    description: 'Genera nuevos códigos de respaldo (invalida los anteriores)',
  })
  @ApiResponse({ status: 200, description: 'Nuevos códigos de respaldo generados' })
  @ApiResponse({ status: 401, description: 'Código 2FA inválido' })
  async regenerateBackupCodes(@CurrentUser() user: any, @Body() dto: VerifyTwoFactorDto) {
    return await this.twoFactorService.regenerateBackupCodes(user.id, dto.code);
  }

  /**
   * Verificar 2FA durante login (segundo paso)
   */
  @Post('2fa/verify')
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar código 2FA',
    description: 'Segundo paso del login cuando 2FA está activado',
  })
  @ApiResponse({ status: 200, description: 'Login completado', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Código 2FA inválido' })
  async verify2FALogin(@Body() dto: TwoFactorLoginDto, @Req() req: any) {
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || 'Unknown';
    return await this.authService.verify2FALogin(dto.tempToken, dto.code, deviceInfo, ipAddress);
  }

  /**
   * Verificar estado de 2FA del usuario
   */
  @Get('2fa/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Estado de 2FA',
    description: 'Verifica si el usuario tiene 2FA activado',
  })
  @ApiResponse({ status: 200, description: 'Estado de 2FA' })
  async get2FAStatus(@CurrentUser() user: any) {
    const enabled = await this.twoFactorService.is2FAEnabled(user.id);
    return { twoFactorEnabled: enabled };
  }
}