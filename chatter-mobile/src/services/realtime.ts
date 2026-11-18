import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl } from './config';
import { getAccessToken } from './storage';

export interface TypingEventPayload {
  conversationId: string;
  userId: string;
  displayName: string;
  isTyping: boolean;
}

export interface PresenceUpdatePayload {
  userId: string;
  isOnline: boolean;
  lastSeenAt?: string;
}

export interface RealtimeHandlers<TMessage = unknown> {
  onConnectionChange?: (connected: boolean) => void;
  onMessageCreated?: (message: TMessage) => void;
  onMessageUpdated?: (message: TMessage) => void;
  onMessageDeleted?: (message: TMessage) => void;
  onConversationUpdated?: (payload: { conversationId: string }) => void;
  onTypingUpdated?: (payload: TypingEventPayload) => void;
  onPresenceSnapshot?: (payload: { onlineUserIds: string[] }) => void;
  onPresenceUpdated?: (payload: PresenceUpdatePayload) => void;
}

export interface ChatRealtimeClient {
  socket: Socket;
  joinConversation: (conversationId: string) => void;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  disconnect: () => void;
}

export const connectChatSocket = <TMessage = unknown>(
  handlers: RealtimeHandlers<TMessage>,
): ChatRealtimeClient | null => {
  const token = getAccessToken();
  if (!token) return null;

  const baseUrl = getSocketBaseUrl();
  const socket = io(baseUrl, {
    path: '/socket.io/',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1200,
    reconnectionDelayMax: 6000,
  });

  socket.on('connect', () => {
    handlers.onConnectionChange?.(true);
  });

  socket.on('disconnect', () => {
    handlers.onConnectionChange?.(false);
  });

  socket.on('connect_error', () => {
    handlers.onConnectionChange?.(false);
  });

  socket.on('message.created', (msg: TMessage) => {
    handlers.onMessageCreated?.(msg);
  });

  socket.on('message.updated', (msg: TMessage) => {
    handlers.onMessageUpdated?.(msg);
  });

  socket.on('message.deleted', (msg: TMessage) => {
    handlers.onMessageDeleted?.(msg);
  });

  socket.on('conversation.updated', (payload: { conversationId: string }) => {
    handlers.onConversationUpdated?.(payload);
  });

  socket.on('typing.updated', (payload: TypingEventPayload) => {
    handlers.onTypingUpdated?.(payload);
  });

  socket.on('presence.snapshot', (payload: { onlineUserIds: string[] }) => {
    handlers.onPresenceSnapshot?.(payload);
  });

  socket.on('presence.updated', (payload: PresenceUpdatePayload) => {
    handlers.onPresenceUpdated?.(payload);
  });

  return {
    socket,
    joinConversation: (conversationId: string) => {
      socket.emit('conversation.join', { conversationId });
    },
    setTyping: (conversationId: string, isTyping: boolean) => {
      socket.emit(isTyping ? 'typing.start' : 'typing.stop', { conversationId });
    },
    disconnect: () => {
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
};
