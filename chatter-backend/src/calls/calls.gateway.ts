import { Logger } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service.js';
import { AuthTokenService } from '../auth/auth-token.service.js';
import { User } from '../users/entities/user.entity.js';
import {
  CallsService,
  DirectCall,
  DirectCallMode,
} from './calls.service.js';

interface CallSocket extends Socket {
  data: {
    user?: User;
  };
}

interface CallSignal {
  type: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

interface CallAck {
  ok: boolean;
  callId?: string;
  message?: string;
}

@WebSocketGateway({
  namespace: '/calls',
  path: '/socket.io/',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class CallsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server?: Namespace;

  private readonly logger = new Logger(CallsGateway.name);
  private readonly socketsByUser = new Map<string, Set<string>>();
  private readonly ringingTimeouts = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly authService: AuthService,
    private readonly callsService: CallsService,
  ) {}

  async handleConnection(client: CallSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const claims = this.authTokenService.verify(token);
      const user = await this.authService.getAuthenticatedUser(claims.sub);
      client.data.user = user;

      const sockets = this.socketsByUser.get(user.id) ?? new Set<string>();
      sockets.add(client.id);
      this.socketsByUser.set(user.id, sockets);
      await client.join(`user:${user.id}`);
      client.emit('call.ice-servers', this.callsService.getIceServers(user.id));
    } catch (error) {
      this.logger.debug(
        `Rejected call socket connection: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: CallSocket): Promise<void> {
    const user = client.data.user;
    if (!user) return;

    const sockets = this.socketsByUser.get(user.id);
    sockets?.delete(client.id);
    if (sockets && sockets.size > 0) return;
    this.socketsByUser.delete(user.id);

    try {
      for (const call of await this.callsService.disconnectUser(user.id)) {
        this.clearRingingTimeout(call.id);
        this.emitToParticipants(call, 'call.ended', {
          callId: call.id,
          reason: 'disconnect',
        });
        this.emitCallHistoryUpdated(call);
      }
    } catch (error) {
      this.logger.error(
        `Failed to persist disconnected call history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @SubscribeMessage('call.invite')
  async invite(
    @ConnectedSocket() client: CallSocket,
    @MessageBody()
    payload: {
      conversationId?: string;
      targetUserId?: string;
      mode?: DirectCallMode;
    },
  ): Promise<CallAck> {
    const user = client.data.user;
    if (
      !user ||
      typeof payload?.conversationId !== 'string' ||
      typeof payload.targetUserId !== 'string' ||
      (payload.mode !== 'audio' && payload.mode !== 'video')
    ) {
      return { ok: false, message: 'Invalid call request.' };
    }
    if (!this.socketsByUser.get(payload.targetUserId)?.size) {
      return { ok: false, message: 'Người nhận hiện không trực tuyến.' };
    }

    try {
      await this.authService.getAuthenticatedUser(payload.targetUserId);
      const call = await this.callsService.startCall(
        user.id,
        payload.targetUserId,
        payload.conversationId,
        payload.mode,
      );
      this.startRingingTimeout(call);
      this.server?.to(`user:${call.calleeId}`).emit('call.incoming', {
        callId: call.id,
        conversationId: call.conversationId,
        callerId: call.callerId,
        mode: call.mode,
      });
      client.emit('call.outgoing', {
        callId: call.id,
        conversationId: call.conversationId,
        targetUserId: call.calleeId,
        mode: call.mode,
      });
      return { ok: true, callId: call.id };
    } catch (error) {
      return this.toAckError(error);
    }
  }

  @SubscribeMessage('call.accept')
  accept(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() payload: { callId?: string },
  ): Promise<CallAck> {
    return this.withCallAction(client, payload?.callId, (call, user) => {
      const accepted = this.callsService.acceptCall(call.id, user.id);
      this.clearRingingTimeout(call.id);
      this.server
        ?.to(`user:${accepted.callerId}`)
        .emit('call.accepted', { callId: accepted.id });
      return { ok: true, callId: accepted.id };
    });
  }

  @SubscribeMessage('call.reject')
  reject(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() payload: { callId?: string },
  ): Promise<CallAck> {
    return this.withCallAction(client, payload?.callId, async (call, user) => {
      const rejected = await this.callsService.rejectCall(call.id, user.id);
      this.clearRingingTimeout(call.id);
      this.emitToParticipants(rejected, 'call.rejected', {
        callId: rejected.id,
      });
      this.emitCallHistoryUpdated(rejected);
      return { ok: true, callId: rejected.id };
    });
  }

  @SubscribeMessage('call.cancel')
  cancel(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() payload: { callId?: string },
  ): Promise<CallAck> {
    return this.withCallAction(client, payload?.callId, async (call, user) => {
      const cancelled = await this.callsService.cancelCall(call.id, user.id);
      this.clearRingingTimeout(call.id);
      this.emitToParticipants(cancelled, 'call.ended', {
        callId: cancelled.id,
        reason: 'cancelled',
      });
      this.emitCallHistoryUpdated(cancelled);
      return { ok: true, callId: cancelled.id };
    });
  }

  @SubscribeMessage('call.end')
  end(
    @ConnectedSocket() client: CallSocket,
    @MessageBody() payload: { callId?: string },
  ): Promise<CallAck> {
    return this.withCallAction(client, payload?.callId, async (call, user) => {
      const ended = await this.callsService.endCall(call.id, user.id);
      this.clearRingingTimeout(ended.id);
      this.emitToParticipants(ended, 'call.ended', {
        callId: ended.id,
        reason: 'hangup',
      });
      this.emitCallHistoryUpdated(ended);
      return { ok: true, callId: ended.id };
    });
  }

  @SubscribeMessage('call.signal')
  signal(
    @ConnectedSocket() client: CallSocket,
    @MessageBody()
    payload: { callId?: string; signal?: CallSignal },
  ): CallAck {
    const user = client.data.user;
    if (!user || typeof payload?.callId !== 'string') {
      return { ok: false, message: 'Invalid call signal.' };
    }
    if (!this.isCallSignal(payload.signal)) {
      return { ok: false, message: 'Invalid call signal.' };
    }

    try {
      const targetUserId = this.callsService.getSignalTarget(
        payload.callId,
        user.id,
      );
      this.server?.to(`user:${targetUserId}`).emit('call.signal', {
        callId: payload.callId,
        signal: payload.signal,
      });
      return { ok: true, callId: payload.callId };
    } catch (error) {
      return this.toAckError(error);
    }
  }

  private async withCallAction(
    client: CallSocket,
    callId: string | undefined,
    action: (call: DirectCall, user: User) => CallAck | Promise<CallAck>,
  ): Promise<CallAck> {
    const user = client.data.user;
    if (!user || typeof callId !== 'string') {
      return { ok: false, message: 'Invalid call request.' };
    }
    try {
      const call = this.callsService.getCallForParticipant(callId, user.id);
      return await action(call, user);
    } catch (error) {
      return this.toAckError(error);
    }
  }

  private startRingingTimeout(call: DirectCall): void {
    const timeout = setTimeout(() => {
      void this.finishTimedOutCall(call.id);
    }, 45_000);
    this.ringingTimeouts.set(call.id, timeout);
  }

  private async finishTimedOutCall(callId: string): Promise<void> {
    this.ringingTimeouts.delete(callId);
    try {
      const ended = await this.callsService.timeoutCall(callId);
      if (!ended) return;
      this.emitToParticipants(ended, 'call.ended', {
        callId: ended.id,
        reason: 'timeout',
      });
      this.emitCallHistoryUpdated(ended);
    } catch (error) {
      this.logger.error(
        `Failed to persist timed-out call history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private clearRingingTimeout(callId: string): void {
    const timeout = this.ringingTimeouts.get(callId);
    if (!timeout) return;
    clearTimeout(timeout);
    this.ringingTimeouts.delete(callId);
  }

  private emitToParticipants(
    call: DirectCall,
    event: string,
    payload: unknown,
  ): void {
    this.server?.to(`user:${call.callerId}`).emit(event, payload);
    this.server?.to(`user:${call.calleeId}`).emit(event, payload);
  }

  private emitCallHistoryUpdated(call: DirectCall): void {
    if (!call.endReason || !call.endedAt) return;
    this.emitToParticipants(call, 'call.history.updated', {
      callId: call.id,
      conversationId: call.conversationId,
      callerId: call.callerId,
      calleeId: call.calleeId,
      mode: call.mode,
      outcome: call.endReason,
      startedAt: call.createdAt,
      connectedAt: call.acceptedAt ?? null,
      endedAt: call.endedAt,
      durationSeconds: call.durationSeconds ?? 0,
    });
  }

  private isCallSignal(value: unknown): value is CallSignal {
    if (!value || typeof value !== 'object') return false;
    const signal = value as Partial<CallSignal>;
    if (signal.type === 'offer' || signal.type === 'answer') {
      return typeof signal.sdp === 'string' && signal.sdp.length <= 32_000;
    }
    if (signal.type === 'candidate') {
      return (
        typeof signal.candidate === 'string' &&
        signal.candidate.length <= 2_000 &&
        (signal.sdpMid === undefined ||
          signal.sdpMid === null ||
          typeof signal.sdpMid === 'string') &&
        (signal.sdpMLineIndex === undefined ||
          signal.sdpMLineIndex === null ||
          Number.isInteger(signal.sdpMLineIndex))
      );
    }
    return false;
  }

  private toAckError(error: unknown): CallAck {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof response === 'object' &&
              response !== null &&
              'message' in response
            ? response.message
            : error.message;
      return {
        ok: false,
        message: Array.isArray(message) ? message.join(', ') : String(message),
      };
    }
    throw error;
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
