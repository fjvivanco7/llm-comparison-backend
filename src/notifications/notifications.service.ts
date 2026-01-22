import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, UserRole } from '@prisma/client';
import {
  CreateNotificationDto,
  GetNotificationsQueryDto,
  NotificationListResponseDto,
  NotificationResponseDto,
} from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crear una notificación
   */
  async create(dto: CreateNotificationDto): Promise<NotificationResponseDto> {
    this.logger.log(`Creando notificación para usuario ${dto.userId}: ${dto.type}`);

    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        data: dto.data || {},
      },
    });

    return this.mapToResponseDto(notification);
  }

  /**
   * Crear múltiples notificaciones (para notificar a todos los evaluadores)
   */
  async createMany(notifications: CreateNotificationDto[]): Promise<NotificationResponseDto[]> {
    this.logger.log(`Creando ${notifications.length} notificaciones`);

    const created = await this.prisma.notification.createManyAndReturn({
      data: notifications.map((n) => ({
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data || {},
      })),
    });

    return created.map((n) => this.mapToResponseDto(n));
  }

  /**
   * Obtener notificaciones de un usuario con paginación
   */
  async findAll(
    userId: number,
    query: GetNotificationsQueryDto,
  ): Promise<NotificationListResponseDto> {
    const { page = 1, limit = 20, unreadOnly, type } = query;
    const skip = (page - 1) * limit;

    // Construir filtro
    const where: any = { userId };
    if (unreadOnly) {
      where.isRead = false;
    }
    if (type) {
      where.type = type;
    }

    // Obtener datos en paralelo
    const [total, unreadCount, notifications] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: notifications.map((n) => this.mapToResponseDto(n)),
      meta: {
        total,
        unreadCount,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Obtener contador de notificaciones no leídas
   */
  async getUnreadCount(userId: number): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Marcar una notificación como leída
   */
  async markAsRead(notificationId: number, userId: number): Promise<NotificationResponseDto> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Marcar todas las notificaciones como leídas
   */
  async markAllAsRead(userId: number): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    this.logger.log(`${result.count} notificaciones marcadas como leídas para usuario ${userId}`);

    return { count: result.count };
  }

  /**
   * Eliminar una notificación
   */
  async delete(notificationId: number, userId: number): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  /**
   * Eliminar todas las notificaciones leídas de un usuario
   */
  async deleteAllRead(userId: number): Promise<{ count: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { userId, isRead: true },
    });

    return { count: result.count };
  }

  // ============================================
  // MÉTODOS DE NEGOCIO PARA CREAR NOTIFICACIONES
  // ============================================

  /**
   * Notificar al usuario que su código fue evaluado
   */
  async notifyCodeEvaluated(params: {
    codeOwnerId: number;
    codeId: number;
    evaluatorName: string;
    llmName: string;
    score: number;
  }): Promise<NotificationResponseDto> {
    const { codeOwnerId, codeId, evaluatorName, llmName, score } = params;

    return this.create({
      userId: codeOwnerId,
      type: NotificationType.CODE_EVALUATED,
      title: 'Tu código ha sido evaluado',
      message: `${evaluatorName} ha evaluado tu código generado por ${llmName}. Puntuación: ${score.toFixed(1)}/5`,
      data: {
        codeId,
        evaluatorName,
        llmName,
        score,
      },
    });
  }

  /**
   * Notificar a todos los evaluadores que hay nuevo código para evaluar
   */
  async notifyNewCodeToEvaluate(params: {
    queryId: number;
    userPrompt: string;
    developerName: string;
    codesCount: number;
  }): Promise<NotificationResponseDto[]> {
    const { queryId, userPrompt, developerName, codesCount } = params;

    // Obtener todos los evaluadores
    const evaluators = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.EVALUATOR, UserRole.ADMIN] },
      },
      select: { id: true },
    });

    if (evaluators.length === 0) {
      this.logger.warn('No hay evaluadores para notificar');
      return [];
    }

    // Crear notificaciones para todos los evaluadores
    const notifications: CreateNotificationDto[] = evaluators.map((evaluator) => ({
      userId: evaluator.id,
      type: NotificationType.NEW_CODE_TO_EVALUATE,
      title: 'Nuevo código disponible para evaluar',
      message: `${developerName} ha generado ${codesCount} código(s) para evaluar: "${userPrompt.substring(0, 50)}${userPrompt.length > 50 ? '...' : ''}"`,
      data: {
        queryId,
        userPrompt: userPrompt.substring(0, 100),
        developerName,
        codesCount,
      },
    }));

    return this.createMany(notifications);
  }

  /**
   * Mapear modelo de Prisma a DTO
   */
  private mapToResponseDto(notification: any): NotificationResponseDto {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data as Record<string, any>,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    };
  }
}
