import { Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Connection } from 'mongoose';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service.js';
import { AuthTokenService } from '../auth/auth-token.service.js';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';

interface AuthenticatedSocket extends Socket {
  data: {
    user?: User;
  };
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  path: '/socket.io/',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server?: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly socketsByUser = new Map<string, Set<string>>();

  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const claims = this.authTokenService.verify(token);
      const user = await this.authService.getAuthenticatedUser(claims.sub);
      client.data.user = user;

      const userSockets = this.socketsByUser.get(user.id) ?? new Set<string>();
      const wasOffline = userSockets.size === 0;
      userSockets.add(client.id);
      this.socketsByUser.set(user.id, userSockets);

      await client.join(`user:${user.id}`);

      const memberships = await this.connection
        .collection('conversationMembers')
        .find({ userId: user.id, status: 'active' })
        .project({ conversationId: 1 })
        .toArray();

      for (const m of memberships) {
        if (m.conversationId) {
          await client.join(`conversation:${String(m.conversationId)}`);
        }
      }

      await this.usersService.touchLastSeen(user.id);

      client.emit('presence.snapshot', {
        onlineUserIds: Array.from(this.socketsByUser.keys()),
      });

      if (wasOffline) {
        this.server?.emit('presence.updated', {
          userId: user.id,
          isOnline: true,
          lastSeenAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.debug(
        `Rejected socket connection: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const user = client.data.user;
    if (!user) return;

    const userSockets = this.socketsByUser.get(user.id);
    if (userSockets) {
      userSockets.delete(client.id);
      if (userSockets.size === 0) {
        this.socketsByUser.delete(user.id);
        const now = new Date();
        await this.usersService.touchLastSeen(user.id);
        this.server?.emit('presence.updated', {
          userId: user.id,
          isOnline: false,
          lastSeenAt: now.toISOString(),
        });
      }
    }
  }

  @SubscribeMessage('conversation.join')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId?: string },
  ): Promise<{ ok: boolean }> {
    const user = client.data.user;
    const conversationId = payload?.conversationId;
    if (!user || !conversationId || !/^[a-f\d]{24}$/i.test(conversationId)) {
      return { ok: false };
    }

    const membership = await this.connection
      .collection('conversationMembers')
      .findOne({
        conversationId,
        userId: user.id,
        status: 'active',
      });

    if (!membership) return { ok: false };
    await client.join(`conversation:${conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing.start')
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId?: string },
  ): Promise<void> {
    await this.broadcastTyping(client, payload?.conversationId, true);
  }

  @SubscribeMessage('typing.stop')
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId?: string },
  ): Promise<void> {
    await this.broadcastTyping(client, payload?.conversationId, false);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    if (!this.server) return;
    const uniqueIds = [...new Set(userIds)];
    for (const userId of uniqueIds) {
      this.server.to(`user:${userId}`).emit(event, payload);
    }
  }

  isUserOnline(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }

  private async broadcastTyping(
    client: AuthenticatedSocket,
    conversationId: string | undefined,
    isTyping: boolean,
  ): Promise<void> {
    const user = client.data.user;
    if (!user || !conversationId || !/^[a-f\d]{24}$/i.test(conversationId)) {
      return;
    }

    const room = `conversation:${conversationId}`;
    if (!client.rooms.has(room)) {
      const membership = await this.connection
        .collection('conversationMembers')
        .findOne({
          conversationId,
          userId: user.id,
          status: 'active',
        });
      if (!membership) return;
      await client.join(room);
    }

    client.to(room).emit('typing.updated', {
      conversationId,
      userId: user.id,
      displayName: user.displayName,
      isTyping,
    });
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string') {
      const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
      if (match) return match[1];
    }

    return null;
  }
}
