import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { graphqlRequest } from '../services/graphql';
import { ChatRealtimeClient, connectChatSocket } from '../services/realtime';
import { ChatMessage, Conversation } from '../types/chat';
import { useAuth } from './AuthContext';

export interface RealtimeMessageBusEvent {
  type: 'created' | 'updated' | 'deleted';
  message: ChatMessage;
}

type MessageBusListener = (event: RealtimeMessageBusEvent) => void;

const MY_CONVERSATIONS_QUERY = `
  query MyConversations {
    myConversations {
      id
      type
      title
      createdBy
      createdAt
      lastMessageAt
      lastMessagePreview
      closedAt
      members {
        userId
        displayName
        email
        avatarUrl
        isOnline
        role
      }
    }
  }
`;

interface RealtimeContextValue {
  isSocketConnected: boolean;
  conversations: Conversation[];
  isLoadingConversations: boolean;
  conversationsError: string;
  onlineUserIds: Set<string>;
  typingByConversation: Record<string, Record<string, string>>;
  refreshConversations: (silent?: boolean) => Promise<Conversation[]>;
  joinConversationRoom: (conversationId: string) => void;
  emitTyping: (conversationId: string, isTyping: boolean) => void;
  subscribeMessages: (listener: MessageBusListener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(
  undefined,
);

const buildMessagePreview = (msg: ChatMessage): string => {
  if (msg.isDeleted) return 'Tin nhắn đã thu hồi';
  switch (msg.kind) {
    case 'IMAGE':
      return '[Hình ảnh]';
    case 'VIDEO':
      return '[Video]';
    case 'DOCUMENT':
      return `[Tài liệu] ${msg.attachments?.[0]?.originalName ?? ''}`.trim();
    case 'EMOTION':
      return '[Sticker / Biểu cảm]';
    default:
      return msg.text || '';
  }
};

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { currentUser, apiBaseUrl } = useAuth();
  const currentUserId = currentUser?.id ?? null;

  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationsError, setConversationsError] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, Record<string, string>>
  >({});

  const clientRef = useRef<ChatRealtimeClient | null>(null);
  const listenersRef = useRef<Set<MessageBusListener>>(new Set());
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  const notifyMessageListeners = useCallback(
    (event: RealtimeMessageBusEvent) => {
      listenersRef.current.forEach((listener) => {
        try {
          listener(event);
        } catch {
          // Ignore subscriber errors
        }
      });
    },
    [],
  );

  const refreshConversations = useCallback(
    async (silent = false): Promise<Conversation[]> => {
      if (!currentUserId) {
        setConversations([]);
        return [];
      }
      if (!silent) {
        setIsLoadingConversations(true);
      }
      try {
        const data = await graphqlRequest<{ myConversations: Conversation[] }>(
          MY_CONVERSATIONS_QUERY,
        );
        const list = data.myConversations ?? [];
        setConversations(list);
        setConversationsError('');

        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          for (const conv of list) {
            for (const member of conv.members) {
              if (member.isOnline) {
                next.add(member.userId);
              }
            }
          }
          return next;
        });

        return list;
      } catch (err) {
        setConversationsError(
          err instanceof Error
            ? err.message
            : 'Không thể tải danh sách trò chuyện.',
        );
        return [];
      } finally {
        if (!silent) {
          setIsLoadingConversations(false);
        }
      }
    },
    [currentUserId],
  );

  useEffect(() => {
    if (!currentUserId) {
      setConversations([]);
      setOnlineUserIds(new Set());
      setTypingByConversation({});
      setIsSocketConnected(false);
      return;
    }

    void refreshConversations();

    const client = connectChatSocket<ChatMessage>({
      onConnectionChange: (connected) => {
        setIsSocketConnected(connected);
      },
      onMessageCreated: (msg) => {
        notifyMessageListeners({ type: 'created', message: msg });
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === msg.conversationId);
          if (!exists) {
            void refreshConversations(true);
            return prev;
          }
          const preview = buildMessagePreview(msg);
          const updated = prev.map((c) =>
            c.id === msg.conversationId
              ? {
                  ...c,
                  lastMessageAt: msg.createdAt,
                  lastMessagePreview: preview,
                }
              : c,
          );
          return [...updated].sort((a, b) => {
            const ta = new Date(a.lastMessageAt || a.createdAt).getTime();
            const tb = new Date(b.lastMessageAt || b.createdAt).getTime();
            return tb - ta;
          });
        });
      },
      onMessageUpdated: (msg) => {
        notifyMessageListeners({ type: 'updated', message: msg });
      },
      onMessageDeleted: (msg) => {
        notifyMessageListeners({ type: 'deleted', message: msg });
        setConversations((prev) =>
          prev.map((c) =>
            c.id === msg.conversationId
              ? { ...c, lastMessagePreview: 'Tin nhắn đã thu hồi' }
              : c,
          ),
        );
      },
      onConversationUpdated: () => {
        void refreshConversations(true);
      },
      onTypingUpdated: ({ conversationId, userId, displayName, isTyping }) => {
        if (userId === currentUserId) return;
        const timerKey = `${conversationId}:${userId}`;
        if (typingTimersRef.current[timerKey]) {
          clearTimeout(typingTimersRef.current[timerKey]);
          delete typingTimersRef.current[timerKey];
        }

        setTypingByConversation((prev) => {
          const convMap = { ...(prev[conversationId] ?? {}) };
          if (isTyping) {
            convMap[userId] = displayName;
          } else {
            delete convMap[userId];
          }
          return { ...prev, [conversationId]: convMap };
        });

        if (isTyping) {
          typingTimersRef.current[timerKey] = setTimeout(() => {
            setTypingByConversation((prev) => {
              const convMap = { ...(prev[conversationId] ?? {}) };
              delete convMap[userId];
              return { ...prev, [conversationId]: convMap };
            });
          }, 4500);
        }
      },
      onPresenceSnapshot: ({ onlineUserIds: ids }) => {
        setOnlineUserIds(new Set(ids));
      },
      onPresenceUpdated: ({ userId, isOnline }) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          if (isOnline) next.add(userId);
          else next.delete(userId);
          return next;
        });
      },
    });

    clientRef.current = client;

    return () => {
      Object.values(typingTimersRef.current).forEach(clearTimeout);
      typingTimersRef.current = {};
      client?.disconnect();
      clientRef.current = null;
      setIsSocketConnected(false);
    };
  }, [currentUserId, apiBaseUrl, refreshConversations, notifyMessageListeners]);

  useEffect(() => {
    if (!currentUserId) return;
    const sub = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          void refreshConversations(true);
        }
      },
    );
    return () => sub.remove();
  }, [currentUserId, refreshConversations]);

  const joinConversationRoom = useCallback((conversationId: string) => {
    clientRef.current?.joinConversation(conversationId);
  }, []);

  const emitTyping = useCallback((conversationId: string, isTyping: boolean) => {
    clientRef.current?.setTyping(conversationId, isTyping);
  }, []);

  const subscribeMessages = useCallback((listener: MessageBusListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      isSocketConnected,
      conversations,
      isLoadingConversations,
      conversationsError,
      onlineUserIds,
      typingByConversation,
      refreshConversations,
      joinConversationRoom,
      emitTyping,
      subscribeMessages,
    }),
    [
      isSocketConnected,
      conversations,
      isLoadingConversations,
      conversationsError,
      onlineUserIds,
      typingByConversation,
      refreshConversations,
      joinConversationRoom,
      emitTyping,
      subscribeMessages,
    ],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = (): RealtimeContextValue => {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used inside RealtimeProvider');
  }
  return ctx;
};
