import { io, Socket } from "socket.io-client";
import { getAccessToken } from "./graphql";

const SOCKET_URL = (process.env.REACT_APP_WS_URL ?? "").trim() || undefined;

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
  const token = typeof getAccessToken === "function" ? getAccessToken() : null;
  if (!token) return null;

  const socket = SOCKET_URL
    ? io(SOCKET_URL, {
        path: "/socket.io/",
        auth: { token },
        transports: ["websocket", "polling"],
      })
    : io({
        path: "/socket.io/",
        auth: { token },
        transports: ["websocket", "polling"],
      });

  socket.on("message.created", (msg: TMessage) => {
    handlers.onMessageCreated?.(msg);
  });
  socket.on("message.updated", (msg: TMessage) => {
    handlers.onMessageUpdated?.(msg);
  });
  socket.on("message.deleted", (msg: TMessage) => {
    handlers.onMessageDeleted?.(msg);
  });
  socket.on("conversation.updated", (payload: { conversationId: string }) => {
    handlers.onConversationUpdated?.(payload);
  });
  socket.on("typing.updated", (payload: TypingEventPayload) => {
    handlers.onTypingUpdated?.(payload);
  });
  socket.on("presence.snapshot", (payload: { onlineUserIds: string[] }) => {
    handlers.onPresenceSnapshot?.(payload);
  });
  socket.on("presence.updated", (payload: PresenceUpdatePayload) => {
    handlers.onPresenceUpdated?.(payload);
  });

  return {
    socket,
    joinConversation: (conversationId: string) => {
      socket.emit("conversation.join", { conversationId });
    },
    setTyping: (conversationId: string, isTyping: boolean) => {
      socket.emit(isTyping ? "typing.start" : "typing.stop", { conversationId });
    },
    disconnect: () => {
      socket.disconnect();
    },
  };
};
