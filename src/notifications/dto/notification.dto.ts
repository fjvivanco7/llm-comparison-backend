import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { NotificationType } from '@prisma/client';

// ============================================
// DTOs DE RESPUESTA
// ============================================

export class NotificationResponseDto {
  @ApiProperty({ description: 'ID de la notificación' })
  id: number;

  @ApiProperty({ description: 'ID del usuario' })
  userId: number;

  @ApiProperty({ enum: NotificationType, description: 'Tipo de notificación' })
  type: NotificationType;

  @ApiProperty({ description: 'Título de la notificación' })
  title: string;

  @ApiProperty({ description: 'Mensaje de la notificación' })
  message: string;

  @ApiPropertyOptional({ description: 'Datos adicionales (codeId, queryId, etc.)' })
  data?: Record<string, any>;

  @ApiProperty({ description: 'Si la notificación ha sido leída' })
  isRead: boolean;

  @ApiProperty({ description: 'Fecha de creación' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Fecha de lectura' })
  readAt?: Date;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  data: NotificationResponseDto[];

  @ApiProperty()
  meta: {
    total: number;
    unreadCount: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ============================================
// DTOs DE CONSULTA
// ============================================

export class GetNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'Página actual', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Límite por página', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filtrar solo no leídas' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ enum: NotificationType, description: 'Filtrar por tipo' })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

// ============================================
// DTOs PARA CREAR NOTIFICACIONES (INTERNO)
// ============================================

export class CreateNotificationDto {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
}

// ============================================
// DTOs PARA WEBSOCKET
// ============================================

export class WsAuthPayload {
  @ApiProperty({ description: 'Token JWT' })
  @IsString()
  token: string;
}

export class MarkAsReadDto {
  @ApiProperty({ description: 'ID de la notificación' })
  @IsInt()
  notificationId: number;
}
