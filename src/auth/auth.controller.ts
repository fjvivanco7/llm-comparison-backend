import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return await this.authService.login(dto);
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
}