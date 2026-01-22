import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationResponseDto } from './dto/notification.dto';
import { UserRole } from '@prisma/client';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  userRole?: UserRole;
}

@WebSocketGateway({
  cors: {
    origin: '*', // En producción, especificar el dominio del frontend
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private connectedUsers = new Map<number, Set<string>>(); // userId -> Set<socketId>

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway inicializado');
  }

  /**
   * Manejar conexión de cliente
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extraer token del handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Cliente sin token intentando conectar: ${client.id}`);
        client.emit('error', { message: 'Token no proporcionado' });
        client.disconnect();
        return;
      }

      // Verificar JWT
      const payload = await this.verifyToken(token);

      if (!payload) {
        client.emit('error', { message: 'Token inválido' });
        client.disconnect();
        return;
      }

      // Guardar userId en el socket
      const userId: number = payload.sub;
      const userRole: UserRole = payload.role;
      client.userId = userId;
      client.userRole = userRole;

      // Registrar conexión
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      this.connectedUsers.get(userId)!.add(client.id);

      // Unir al room del usuario
      client.join(`user:${userId}`);

      // Si es evaluador, unir al room de evaluadores
      if (userRole === UserRole.EVALUATOR || userRole === UserRole.ADMIN) {
        client.join('evaluators');
      }

      this.logger.log(
        `Usuario ${userId} conectado (socket: ${client.id}, role: ${userRole})`,
      );

      // Enviar contador de notificaciones no leídas
      const unreadCount = await this.notificationsService.getUnreadCount(userId);
      client.emit('unread_count', { count: unreadCount });
    } catch (error) {
      this.logger.error(`Error en conexión: ${error.message}`);
      client.emit('error', { message: 'Error de autenticación' });
      client.disconnect();
    }
  }

  /**
   * Manejar desconexión de cliente
   */
  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
        }
      }
      this.logger.log(`Usuario ${client.userId} desconectado (socket: ${client.id})`);
    }
  }

  /**
   * Verificar token JWT
   */
  private async verifyToken(token: string): Promise<any> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'your-secret-key');
      const payload = this.jwtService.verify(token, { secret });

      // Verificar que la sesión existe
      const session = await this.prisma.userSession.findFirst({
        where: {
          token,
          userId: payload.sub,
          expiresAt: { gt: new Date() },
        },
      });

      if (!session) {
        return null;
      }

      // Obtener rol del usuario
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { role: true },
      });

      return { ...payload, role: user?.role };
    } catch (error) {
      this.logger.error(`Error verificando token: ${error.message}`);
      return null;
    }
  }

  // ============================================
  // EVENTOS DEL CLIENTE
  // ============================================

  /**
   * Cliente solicita marcar notificación como leída
   */
  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { notificationId: number },
  ) {
    if (!client.userId) {
      return { error: 'No autenticado' };
    }

    try {
      const notification = await this.notificationsService.markAsRead(
        data.notificationId,
        client.userId,
      );

      // Emitir actualización del contador
      const unreadCount = await this.notificationsService.getUnreadCount(client.userId);
      this.emitToUser(client.userId, 'unread_count', { count: unreadCount });

      return { success: true, notification };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Cliente solicita marcar todas como leídas
   */
  @SubscribeMessage('mark_all_as_read')
  async handleMarkAllAsRead(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) {
      return { error: 'No autenticado' };
    }

    try {
      const result = await this.notificationsService.markAllAsRead(client.userId);

      // Emitir actualización del contador
      this.emitToUser(client.userId, 'unread_count', { count: 0 });

      return { success: true, count: result.count };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Cliente solicita el contador de no leídas
   */
  @SubscribeMessage('get_unread_count')
  async handleGetUnreadCount(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) {
      return { error: 'No autenticado' };
    }

    const count = await this.notificationsService.getUnreadCount(client.userId);
    return { count };
  }

  // ============================================
  // MÉTODOS PARA EMITIR NOTIFICACIONES
  // ============================================

  /**
   * Emitir evento a un usuario específico
   */
  emitToUser(userId: number, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emitir notificación a un usuario
   */
  sendNotificationToUser(userId: number, notification: NotificationResponseDto) {
    this.logger.log(`Enviando notificación a usuario ${userId}: ${notification.type}`);
    this.emitToUser(userId, 'new_notification', notification);

    // También actualizar el contador
    this.notificationsService.getUnreadCount(userId).then((count) => {
      this.emitToUser(userId, 'unread_count', { count });
    });
  }

  /**
   * Emitir notificación a todos los evaluadores
   */
  sendNotificationToEvaluators(notifications: NotificationResponseDto[]) {
    this.logger.log(`Enviando notificación a ${notifications.length} evaluadores`);

    for (const notification of notifications) {
      this.sendNotificationToUser(notification.userId, notification);
    }
  }

  /**
   * Verificar si un usuario está conectado
   */
  isUserConnected(userId: number): boolean {
    return this.connectedUsers.has(userId) && this.connectedUsers.get(userId)!.size > 0;
  }

  /**
   * Obtener número de usuarios conectados
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }
}
