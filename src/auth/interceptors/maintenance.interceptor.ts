import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

export const SKIP_MAINTENANCE_KEY = 'skipMaintenance';

/**
 * Decorador para excluir rutas del modo mantenimiento.
 * Usar en controladores o métodos que deben funcionar siempre (ej: login, health).
 */
export const SkipMaintenance = () => SetMetadata(SKIP_MAINTENANCE_KEY, true);

/**
 * Interceptor que verifica si el sistema está en modo mantenimiento.
 * Se ejecuta DESPUÉS de los guards, cuando el usuario ya está autenticado.
 * Solo bloquea a usuarios con rol USER (desarrolladores).
 * Los EVALUATOR y ADMIN pueden acceder normalmente.
 */
@Injectable()
export class MaintenanceInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    // Verificar si la ruta tiene el decorador @SkipMaintenance()
    const skipMaintenance = this.reflector.getAllAndOverride<boolean>(
      SKIP_MAINTENANCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipMaintenance) {
      return next.handle();
    }

    // Obtener la configuración de modo mantenimiento
    const setting = await this.prisma.appSettings.findUnique({
      where: { key: 'maintenanceMode' },
    });

    const isMaintenanceMode = setting?.value === 'true';

    // Si no está en modo mantenimiento, continuar
    if (!isMaintenanceMode) {
      return next.handle();
    }

    // Obtener el usuario de la request (ya autenticado por JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Si no hay usuario, permitir (rutas públicas)
    if (!user) {
      return next.handle();
    }

    // Bloquear a usuarios USER y EVALUATOR, solo ADMIN puede acceder
    if (user.role === UserRole.USER || user.role === UserRole.EVALUATOR) {
      throw new ServiceUnavailableException(
        'El sistema está en modo mantenimiento. Por favor, intenta más tarde.',
      );
    }

    // Solo ADMIN puede acceder en modo mantenimiento
    return next.handle();
  }
}
