import { io, Socket } from "socket.io-client";
import { getAccessToken } from "./graphql";

export type DirectCallMode = "audio" | "video";

export interface IncomingCall {
  callId: string;
  conversationId: string;
  callerId: string;
  mode: DirectCallMode;
}

export interface OutgoingCall {
  callId: string;
  conversationId: string;
  targetUserId: string;
  mode: DirectCallMode;
}

export interface CallSignal {
  type: "offer" | "answer" | "candidate";
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface CallIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface CallHistoryEntry {
  callId: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  mode: DirectCallMode;
  outcome: "rejected" | "cancelled" | "hangup" | "timeout" | "disconnect";
  startedAt: string;
  connectedAt?: string | null;
  endedAt: string;
  durationSeconds: number;
}

export interface CallAck {
  ok: boolean;
  callId?: string;
  message?: string;
}

export interface CallRealtimeHandlers {
  onIncoming?: (call: IncomingCall) => void;
  onOutgoing?: (call: OutgoingCall) => void;
  onAccepted?: (payload: { callId: string }) => void;
  onRejected?: (payload: { callId: string }) => void;
  onEnded?: (payload: { callId: string; reason: string }) => void;
  onSignal?: (payload: { callId: string; signal: CallSignal }) => void;
  onIceServers?: (servers: CallIceServer[]) => void;
  onHistoryUpdated?: (entry: CallHistoryEntry) => void;
}

export interface CallRealtimeClient {
  socket: Socket;
  invite: (
    conversationId: string,
    targetUserId: string,
    mode: DirectCallMode,
  ) => Promise<CallAck>;
  accept: (callId: string) => Promise<CallAck>;
  reject: (callId: string) => Promise<CallAck>;
  cancel: (callId: string) => Promise<CallAck>;
  end: (callId: string) => Promise<CallAck>;
  signal: (callId: string, signal: CallSignal) => void;
  disconnect: () => void;
}

const SOCKET_URL = (process.env.REACT_APP_WS_URL ?? "").trim() || undefined;

export const connectCallSocket = (
  handlers: CallRealtimeHandlers,
): CallRealtimeClient | null => {
  const token = getAccessToken();
  if (!token) return null;

  const socket = SOCKET_URL
    ? io(`${SOCKET_URL}/calls`, {
        path: "/socket.io/",
        auth: { token },
        transports: ["websocket", "polling"],
      })
    : io("/calls", {
        path: "/socket.io/",
        auth: { token },
        transports: ["websocket", "polling"],
      });

  socket.on("call.incoming", (call: IncomingCall) =>
    handlers.onIncoming?.(call),
  );
  socket.on("call.outgoing", (call: OutgoingCall) =>
    handlers.onOutgoing?.(call),
  );
  socket.on("call.accepted", (payload: { callId: string }) =>
    handlers.onAccepted?.(payload),
  );
  socket.on("call.rejected", (payload: { callId: string }) =>
    handlers.onRejected?.(payload),
  );
  socket.on("call.ended", (payload: { callId: string; reason: string }) =>
    handlers.onEnded?.(payload),
  );
  socket.on(
    "call.signal",
    (payload: { callId: string; signal: CallSignal }) =>
      handlers.onSignal?.(payload),
  );
  socket.on("call.ice-servers", (servers: CallIceServer[]) =>
    handlers.onIceServers?.(servers),
  );
  socket.on("call.history.updated", (entry: CallHistoryEntry) =>
    handlers.onHistoryUpdated?.(entry),
  );

  const emitAck = (
    event: string,
    payload: object,
  ): Promise<CallAck> =>
    new Promise((resolve) => {
      socket
        .timeout(5000)
        .emit(event, payload, (err: unknown, response: CallAck) => {
          if (err) {
            resolve({
              ok: false,
              message: "Không thể kết nối máy chủ cuộc gọi.",
            });
            return;
          }
          resolve(response);
        });
    });

  return {
    socket,
    invite: (conversationId, targetUserId, mode) =>
      emitAck("call.invite", { conversationId, targetUserId, mode }),
    accept: (callId) => emitAck("call.accept", { callId }),
    reject: (callId) => emitAck("call.reject", { callId }),
    cancel: (callId) => emitAck("call.cancel", { callId }),
    end: (callId) => emitAck("call.end", { callId }),
    signal: (callId, signal) => socket.emit("call.signal", { callId, signal }),
    disconnect: () => socket.disconnect(),
  };
};
