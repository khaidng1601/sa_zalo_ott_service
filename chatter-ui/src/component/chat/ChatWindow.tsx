import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  InputBase,
  Popover,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import CallRoundedIcon from "@mui/icons-material/CallRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import EmojiEmotionsOutlinedIcon from "@mui/icons-material/EmojiEmotionsOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import ReplyRoundedIcon from "@mui/icons-material/ReplyRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SmartDisplayOutlinedIcon from "@mui/icons-material/SmartDisplayOutlined";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import {
  findStickerByCode,
  QUICK_EMOJIS,
  REACTION_EMOJIS,
  ZALO_STICKERS,
} from "../../constants/emotions";
import { graphqlRequest } from "../../services/graphql";
import { CallHistoryEntry } from "../../services/calls";
import {
  formatFileSize,
  uploadConversationFile,
  UploadedAttachment,
} from "../../services/uploads";
import {
  ChatMessage,
  Conversation,
  getInitials,
  GraphQLMessageKind,
} from "../../types/chat";

const MESSAGES_QUERY = `
  query ConversationMessages($conversationId: String!, $before: String, $limit: Int) {
    messages(conversationId: $conversationId, before: $before, limit: $limit) {
      hasMore
      nextCursor
      items {
        id
        conversationId
        senderId
        senderDisplayName
        senderAvatarUrl
        kind
        text
        stickerCode
        isDeleted
        deletedAt
        createdAt
        replyToId
        replyTo {
          id
          senderId
          senderDisplayName
          kind
          text
          stickerCode
          isDeleted
        }
        attachments {
          storageKey
          originalName
          mimeType
          sizeBytes
          uploadedAt
          url
        }
        reactions {
          userId
          displayName
          emoji
          createdAt
        }
      }
    }
  }
`;

const SEND_MESSAGE_MUTATION = `
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      id
      conversationId
      senderId
      senderDisplayName
      senderAvatarUrl
      kind
      text
      stickerCode
      isDeleted
      deletedAt
      createdAt
      replyToId
      replyTo {
        id
        senderId
        senderDisplayName
        kind
        text
        stickerCode
        isDeleted
      }
      attachments {
        storageKey
        originalName
        mimeType
        sizeBytes
        uploadedAt
        url
      }
      reactions {
        userId
        displayName
        emoji
        createdAt
      }
    }
  }
`;

const REACT_MUTATION = `
  mutation ReactToMessage($messageId: String!, $emoji: String!) {
    reactToMessage(messageId: $messageId, emoji: $emoji) {
      id
      conversationId
      reactions { userId displayName emoji createdAt }
    }
  }
`;

const REMOVE_REACTION_MUTATION = `
  mutation RemoveReaction($messageId: String!) {
    removeMessageReaction(messageId: $messageId) {
      id
      conversationId
      reactions { userId displayName emoji createdAt }
    }
  }
`;

const DELETE_MESSAGE_MUTATION = `
  mutation RecallMessage($messageId: String!) {
    deleteMessage(messageId: $messageId) {
      id
      conversationId
      isDeleted
      deletedAt
      text
      stickerCode
      attachments { storageKey }
      reactions { userId emoji }
    }
  }
`;

const CALL_HISTORY_QUERY = `
  query CallHistory($conversationId: String!, $limit: Int) {
    callHistory(conversationId: $conversationId, limit: $limit) {
      callId
      conversationId
      callerId
      calleeId
      mode
      outcome
      startedAt
      connectedAt
      endedAt
      durationSeconds
    }
  }
`;

interface ChatWindowProps {
  conversation: Conversation;
  currentUserId: string;
  canManageGroup: boolean;
  incomingEventMessage?: {
    type: "created" | "updated" | "deleted";
    message: ChatMessage;
    seq: number;
  } | null;
  callHistoryEvent?: { entry: CallHistoryEntry; seq: number } | null;
  typingUsers: string[];
  onEmitTyping?: (conversationId: string, isTyping: boolean) => void;
  onConversationActivity?: () => void;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

const getCallHistoryLabel = (
  entry: CallHistoryEntry,
  currentUserId: string,
): string => {
  const isCaller = entry.callerId === currentUserId;
  const callType = entry.mode === "video" ? "video" : "thoại";
  switch (entry.outcome) {
    case "rejected":
      return isCaller
        ? `Cuộc gọi ${callType} bị từ chối`
        : `Bạn đã từ chối cuộc gọi ${callType}`;
    case "cancelled":
      return isCaller
        ? `Bạn đã hủy cuộc gọi ${callType}`
        : `Người gọi đã hủy cuộc gọi ${callType}`;
    case "timeout":
      return isCaller
        ? `Không có người nghe cuộc gọi ${callType}`
        : `Cuộc gọi ${callType} nhỡ`;
    case "disconnect":
      return `Cuộc gọi ${callType} bị ngắt`;
    case "hangup":
      return `Cuộc gọi ${callType} đã kết thúc`;
  }
};

const getDocBadgeLabel = (fileName: string, mimeType: string): string => {
  const ext = fileName.split(".").pop()?.toUpperCase() ?? "";
  if (ext && ext.length <= 5) return ext;
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word")) return "DOCX";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "XLSX";
  if (mimeType.includes("zip")) return "ZIP";
  return "FILE";
};

const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  currentUserId,
  canManageGroup,
  incomingEventMessage,
  callHistoryEvent,
  typingUsers,
  onEmitTyping,
  onConversationActivity,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [callHistory, setCallHistory] = useState<CallHistoryEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [stagedAttachments, setStagedAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    name: string;
  } | null>(null);

  const [emotionAnchor, setEmotionAnchor] = useState<HTMLElement | null>(null);
  const [emotionTab, setEmotionTab] = useState<0 | 1>(0);
  const [reactionTarget, setReactionTarget] = useState<{
    anchor: HTMLElement;
    message: ChatMessage;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView?.({ behavior, block: "end" });
    }, 40);
  }, []);

  const loadInitialMessages = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setCallHistory([]);
    try {
      const data = await graphqlRequest<{
        messages: {
          items: ChatMessage[];
          hasMore: boolean;
          nextCursor?: string | null;
        };
      }>(MESSAGES_QUERY, {
        conversationId: conversation.id,
        limit: 30,
      });
      setMessages(data?.messages?.items ?? []);
      setHasMore(Boolean(data?.messages?.hasMore));
      setNextCursor(data?.messages?.nextCursor ?? null);
      scrollToBottom("auto");

      if (conversation.type === "DIRECT") {
        try {
          const historyData = await graphqlRequest<{
            callHistory: CallHistoryEntry[];
          }>(CALL_HISTORY_QUERY, {
            conversationId: conversation.id,
            limit: 100,
          });
          setCallHistory(historyData.callHistory);
        } catch (historyError) {
          setError(
            historyError instanceof Error
              ? historyError.message
              : "Không thể tải lịch sử cuộc gọi.",
          );
        }
      }

      void graphqlRequest(
        "mutation MarkRead($conversationId: String!) { markConversationRead(conversationId: $conversationId) }",
        { conversationId: conversation.id },
      ).catch(() => undefined);
    } catch (loadErr) {
      setError(
        loadErr instanceof Error ? loadErr.message : "Không thể tải tin nhắn.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [conversation.id, conversation.type, scrollToBottom]);

  useEffect(() => {
    setReplyTo(null);
    setStagedAttachments([]);
    setText("");
    void loadInitialMessages();
  }, [loadInitialMessages]);

  useEffect(() => {
    if (!incomingEventMessage) return;
    const { type, message } = incomingEventMessage;
    if (message.conversationId !== conversation.id) return;

    setMessages((prev) => {
      const exists = prev.some((m) => m.id === message.id);
      if (type === "created") {
        if (exists) {
          return prev.map((m) => (m.id === message.id ? message : m));
        }
        return [...prev, message];
      }
      if (type === "updated" || type === "deleted") {
        return prev.map((m) =>
          m.id === message.id ? { ...m, ...message } : m,
        );
      }
      return prev;
    });

    if (type === "created") {
      scrollToBottom("smooth");
    }
  }, [incomingEventMessage, conversation.id, scrollToBottom]);

  useEffect(() => {
    if (!callHistoryEvent) return;
    const { entry } = callHistoryEvent;
    if (entry.conversationId !== conversation.id) return;

    setCallHistory((previous) =>
      [entry, ...previous.filter((item) => item.callId !== entry.callId)]
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )
        .slice(0, 100),
    );
    scrollToBottom("smooth");
  }, [callHistoryEvent, conversation.id, scrollToBottom]);

  const loadOlderMessages = async () => {
    if (!hasMore || !nextCursor || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const data = await graphqlRequest<{
        messages: {
          items: ChatMessage[];
          hasMore: boolean;
          nextCursor?: string | null;
        };
      }>(MESSAGES_QUERY, {
        conversationId: conversation.id,
        before: nextCursor,
        limit: 25,
      });
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const olderUnique = data.messages.items.filter(
          (m) => !existingIds.has(m.id),
        );
        return [...olderUnique, ...prev];
      });
      setHasMore(data.messages.hasMore);
      setNextCursor(data.messages.nextCursor ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải tin nhắn cũ hơn.",
      );
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (onEmitTyping) {
      onEmitTyping(conversation.id, value.trim().length > 0);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onEmitTyping(conversation.id, false);
      }, 2000);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length === 0) return;

    setIsUploading(true);
    setError("");
    try {
      const uploadedList: UploadedAttachment[] = [];
      for (const file of files) {
        const uploaded = await uploadConversationFile(conversation.id, file);
        uploadedList.push(uploaded);
      }

      setStagedAttachments((prev) => {
        if (prev.length > 0 && prev[0].kind !== uploadedList[0].kind) {
          return uploadedList;
        }
        if (uploadedList[0].kind === "video") {
          return [uploadedList[0]];
        }
        return [...prev, ...uploadedList].slice(0, 5);
      });
    } catch (uploadErr) {
      setError(
        uploadErr instanceof Error
          ? uploadErr.message
          : "Không thể tải tệp lên.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const dispatchMessage = async (payload: {
    kind: GraphQLMessageKind;
    text?: string;
    stickerCode?: string;
    attachments?: Array<{
      storageKey: string;
      originalName: string;
      mimeType: string;
    }>;
  }) => {
    setIsSending(true);
    setError("");
    try {
      const data = await graphqlRequest<{ sendMessage: ChatMessage }>(
        SEND_MESSAGE_MUTATION,
        {
          input: {
            conversationId: conversation.id,
            kind: payload.kind,
            text: payload.text,
            stickerCode: payload.stickerCode,
            attachments: payload.attachments,
            replyToId: replyTo?.id,
          },
        },
      );
      const created = data.sendMessage;
      setMessages((prev) =>
        prev.some((m) => m.id === created.id) ? prev : [...prev, created],
      );
      setReplyTo(null);
      onEmitTyping?.(conversation.id, false);
      onConversationActivity?.();
      scrollToBottom("smooth");
    } catch (sendErr) {
      setError(
        sendErr instanceof Error
          ? sendErr.message
          : "Không thể gửi tin nhắn.",
      );
      throw sendErr;
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmitComposer = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (isSending || isUploading) return;

    if (stagedAttachments.length > 0) {
      const kindMap: Record<UploadedAttachment["kind"], GraphQLMessageKind> = {
        image: "IMAGE",
        video: "VIDEO",
        document: "DOCUMENT",
      };
      const kind = kindMap[stagedAttachments[0].kind];
      const attachmentsInput = stagedAttachments.map((att) => ({
        storageKey: att.storageKey,
        originalName: att.originalName,
        mimeType: att.mimeType,
      }));
      const caption = text.trim() || undefined;
      await dispatchMessage({
        kind,
        text: caption,
        attachments: attachmentsInput,
      });
      setStagedAttachments([]);
      setText("");
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;
    await dispatchMessage({ kind: "TEXT", text: trimmed });
    setText("");
  };

  const handleSendSticker = async (code: string, emoji: string) => {
    setEmotionAnchor(null);
    await dispatchMessage({
      kind: "EMOTION",
      stickerCode: code,
      text: emoji,
    });
  };

  const handleSendQuickEmoji = async (emoji: string) => {
    if (text.trim().length > 0 || stagedAttachments.length > 0) {
      setText((prev) => `${prev}${emoji}`);
      setEmotionAnchor(null);
      return;
    }
    setEmotionAnchor(null);
    await dispatchMessage({
      kind: "EMOTION",
      text: emoji,
    });
  };

  const handleToggleReaction = async (message: ChatMessage, emoji: string) => {
    setReactionTarget(null);
    const myReaction = message.reactions.find((r) => r.userId === currentUserId);
    try {
      if (myReaction?.emoji === emoji) {
        const res = await graphqlRequest<{
          removeMessageReaction: Pick<ChatMessage, "id" | "reactions">;
        }>(REMOVE_REACTION_MUTATION, { messageId: message.id });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, reactions: res.removeMessageReaction.reactions }
              : m,
          ),
        );
      } else {
        const res = await graphqlRequest<{
          reactToMessage: Pick<ChatMessage, "id" | "reactions">;
        }>(REACT_MUTATION, { messageId: message.id, emoji });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, reactions: res.reactToMessage.reactions }
              : m,
          ),
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể thả biểu cảm.",
      );
    }
  };

  const handleRecallMessage = async (messageId: string) => {
    try {
      const res = await graphqlRequest<{ deleteMessage: ChatMessage }>(
        DELETE_MESSAGE_MUTATION,
        { messageId },
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                isDeleted: true,
                deletedAt: res.deleteMessage.deletedAt,
                text: null,
                stickerCode: null,
                attachments: [],
                reactions: [],
              }
            : m,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể thu hồi tin nhắn.",
      );
    }
  };

  const renderMessageContent = (msg: ChatMessage, isMine: boolean) => {
    if (msg.isDeleted) {
      return (
        <Typography
          sx={{
            fontStyle: "italic",
            fontSize: 13,
            color: "#8b97a5",
            px: 1.75,
            py: 1.1,
          }}
        >
          Tin nhắn đã được thu hồi
        </Typography>
      );
    }

    if (msg.kind === "EMOTION") {
      const sticker = findStickerByCode(msg.stickerCode);
      if (sticker) {
        return (
          <Box
            sx={{
              background: sticker.bg,
              borderRadius: 3,
              px: 2.5,
              py: 1.75,
              textAlign: "center",
              minWidth: 140,
              boxShadow: "0 4px 14px rgba(15, 35, 65, 0.08)",
            }}
          >
            <Typography sx={{ fontSize: 44, lineHeight: 1.15 }}>
              {sticker.emoji}
            </Typography>
            <Typography
              sx={{
                fontSize: 12.5,
                fontWeight: 700,
                color: sticker.accent,
                mt: 0.5,
              }}
            >
              {sticker.label}
            </Typography>
          </Box>
        );
      }
      return (
        <Typography sx={{ fontSize: 44, lineHeight: 1.2, px: 1, py: 0.5 }}>
          {msg.text || "😊"}
        </Typography>
      );
    }

    return (
      <Box sx={{ px: 1.75, py: 1.2 }}>
        {msg.kind === "IMAGE" && msg.attachments.length > 0 && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                msg.attachments.length > 1 ? "repeat(2, minmax(0, 1fr))" : "1fr",
              gap: 1,
              mb: msg.text ? 1 : 0,
            }}
          >
            {msg.attachments.map((att) => (
              <Box
                key={att.storageKey}
                component="img"
                src={att.url}
                alt={att.originalName}
                onClick={() =>
                  setLightboxImage({ url: att.url, name: att.originalName })
                }
                sx={{
                  maxWidth: "100%",
                  maxHeight: 280,
                  borderRadius: 2,
                  objectFit: "cover",
                  cursor: "zoom-in",
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              />
            ))}
          </Box>
        )}

        {msg.kind === "VIDEO" &&
          msg.attachments.map((att) => (
            <Box key={att.storageKey} sx={{ mb: msg.text ? 1 : 0 }}>
              <Box
                component="video"
                controls
                preload="metadata"
                src={att.url}
                sx={{
                  width: "100%",
                  maxWidth: 360,
                  maxHeight: 260,
                  borderRadius: 2,
                  bgcolor: "#000",
                }}
              />
              <Typography sx={{ fontSize: 11, color: "#687787", mt: 0.4 }}>
                {att.originalName} · {formatFileSize(att.sizeBytes)}
              </Typography>
            </Box>
          ))}

        {msg.kind === "DOCUMENT" &&
          msg.attachments.map((att) => (
            <Box
              key={att.storageKey}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                p: 1.25,
                mb: msg.text ? 1 : 0.5,
                borderRadius: 2,
                bgcolor: isMine ? "rgba(8,102,255,0.08)" : "#f3f6fa",
                border: "1px solid rgba(8,102,255,0.14)",
                minWidth: { xs: 210, sm: 260 },
              }}
            >
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 2,
                  bgcolor: "#0866ff",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                {getDocBadgeLabel(att.originalName, att.mimeType)}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  noWrap
                  sx={{ fontSize: 13, fontWeight: 600, color: "#1e2b3a" }}
                  title={att.originalName}
                >
                  {att.originalName}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "#6a788a" }}>
                  {formatFileSize(att.sizeBytes)}
                </Typography>
              </Box>
              <Tooltip title="Tải xuống">
                <IconButton
                  component="a"
                  href={`${att.url}&download=1`}
                  download={att.originalName}
                  size="small"
                  sx={{ color: "#0866ff" }}
                >
                  <DownloadRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}

        {msg.text && (
          <Typography
            sx={{
              fontSize: 14,
              lineHeight: 1.45,
              color: "#1c2733",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {msg.text}
          </Typography>
        )}
      </Box>
    );
  };

  const timelineItems = [
    ...messages.map((message) => ({
      type: "message" as const,
      id: message.id,
      timestamp: message.createdAt,
      message,
    })),
    ...callHistory.map((entry) => ({
      type: "call" as const,
      id: entry.callId,
      timestamp: entry.startedAt,
      entry,
    })),
  ].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "#eef2f7",
      }}
    >
      {/* Messages Scroll Area */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: { xs: 1.5, sm: 3, md: 4 },
          py: 2.25,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        {error && (
          <Alert severity="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {hasMore && (
          <Box sx={{ textAlign: "center", py: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void loadOlderMessages()}
              disabled={isLoadingOlder}
              sx={{ borderRadius: 5, textTransform: "none", bgcolor: "#fff" }}
            >
              {isLoadingOlder ? "Đang tải..." : "Tải tin nhắn cũ hơn"}
            </Button>
          </Box>
        )}

        {isLoading ? (
          <Box sx={{ flex: 1, display: "grid", placeItems: "center" }}>
            <CircularProgress size={28} aria-label="Đang tải tin nhắn" />
          </Box>
        ) : timelineItems.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              color: "#7b8898",
              textAlign: "center",
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>
                Bắt đầu cuộc trò chuyện
              </Typography>
              <Typography sx={{ fontSize: 12.5, mt: 0.5 }}>
                Hãy gửi tin nhắn văn bản, hình ảnh, video, tài liệu hoặc sticker đầu tiên!
              </Typography>
            </Box>
          </Box>
        ) : (
          timelineItems.map((item) => {
            if (item.type === "call") {
              const entry = item.entry;
              const CallIcon =
                entry.mode === "video" ? VideocamRoundedIcon : CallRoundedIcon;
              return (
                <Box
                  key={`call-${entry.callId}`}
                  aria-label={getCallHistoryLabel(entry, currentUserId)}
                  sx={{
                    alignSelf: "center",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 5,
                    bgcolor: "#fff",
                    color: "#63748a",
                    boxShadow: "0 1px 3px rgba(16, 35, 58, 0.08)",
                  }}
                >
                  <CallIcon sx={{ color: "#0866ff", fontSize: 18 }} />
                  <Typography sx={{ fontSize: 12.5 }}>
                    {getCallHistoryLabel(entry, currentUserId)}
                    {entry.connectedAt
                      ? ` · ${formatDuration(entry.durationSeconds)}`
                      : ""}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: "#8291a3" }}>
                    {formatTime(entry.startedAt)}
                  </Typography>
                </Box>
              );
            }

            const msg = item.message;
            const isMine = msg.senderId === currentUserId;
            const canRecall = !msg.isDeleted && (isMine || canManageGroup);

            // Group reactions by emoji
            const groupedReactions = msg.reactions.reduce<
              Record<string, { count: number; names: string[]; mine: boolean }>
            >((acc, r) => {
              if (!acc[r.emoji]) {
                acc[r.emoji] = { count: 0, names: [], mine: false };
              }
              acc[r.emoji].count += 1;
              if (r.displayName) acc[r.emoji].names.push(r.displayName);
              if (r.userId === currentUserId) acc[r.emoji].mine = true;
              return acc;
            }, {});

            return (
              <Box
                key={msg.id}
                sx={{
                  display: "flex",
                  flexDirection: isMine ? "row-reverse" : "row",
                  alignItems: "flex-end",
                  gap: 1,
                  "&:hover .msg-actions": { opacity: 1 },
                }}
              >
                {!isMine && (
                  <Avatar
                    src={msg.senderAvatarUrl || undefined}
                    sx={{
                      width: 34,
                      height: 34,
                      bgcolor: "#5886c6",
                      fontSize: 12,
                      fontWeight: 600,
                      mb: 0.5,
                    }}
                  >
                    {getInitials(msg.senderDisplayName || "U")}
                  </Avatar>
                )}

                <Box
                  sx={{
                    maxWidth: { xs: "82%", sm: "68%" },
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isMine ? "flex-end" : "flex-start",
                  }}
                >
                  {!isMine && conversation.type === "GROUP" && (
                    <Typography
                      sx={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: "#5f6f82",
                        mb: 0.35,
                        ml: 0.5,
                      }}
                    >
                      {msg.senderDisplayName}
                    </Typography>
                  )}

                  <Box
                    sx={{
                      borderRadius: 3,
                      bgcolor:
                        msg.kind === "EMOTION" && !msg.isDeleted
                          ? "transparent"
                          : isMine
                            ? "#dbebff"
                            : "#ffffff",
                      boxShadow:
                        msg.kind === "EMOTION" && !msg.isDeleted
                          ? "none"
                          : "0 1px 3px rgba(16, 35, 58, 0.08)",
                      overflow: "hidden",
                    }}
                  >
                    {msg.replyTo && !msg.isDeleted && (
                      <Box
                        sx={{
                          mx: 1.25,
                          mt: 1,
                          px: 1.25,
                          py: 0.65,
                          borderLeft: "3px solid #0866ff",
                          borderRadius: 1,
                          bgcolor: "rgba(8,102,255,0.07)",
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: "#0866ff",
                          }}
                        >
                          {msg.replyTo.senderDisplayName || "Tin nhắn"}
                        </Typography>
                        <Typography
                          noWrap
                          sx={{ fontSize: 12, color: "#4e5e71", maxWidth: 280 }}
                        >
                          {msg.replyTo.isDeleted
                            ? "Tin nhắn đã thu hồi"
                            : msg.replyTo.text || `[${msg.replyTo.kind}]`}
                        </Typography>
                      </Box>
                    )}

                    {renderMessageContent(msg, isMine)}

                    <Box
                      sx={{
                        px: 1.5,
                        pb: 0.65,
                        display: "flex",
                        justifyContent: isMine ? "flex-end" : "flex-start",
                      }}
                    >
                      <Typography sx={{ fontSize: 10.5, color: "#8291a3" }}>
                        {formatTime(msg.createdAt)}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Active Reactions Bar */}
                  {Object.keys(groupedReactions).length > 0 && (
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 0.5,
                        mt: -0.75,
                        mx: 1,
                        zIndex: 1,
                      }}
                    >
                      {Object.entries(groupedReactions).map(([emoji, info]) => (
                        <Tooltip
                          key={emoji}
                          title={info.names.join(", ") || "Biểu cảm"}
                        >
                          <Chip
                            size="small"
                            label={`${emoji} ${info.count}`}
                            onClick={() => void handleToggleReaction(msg, emoji)}
                            sx={{
                              height: 22,
                              fontSize: 11.5,
                              bgcolor: info.mine ? "#e3f0ff" : "#fff",
                              border: info.mine
                                ? "1px solid #80b5ff"
                                : "1px solid #e1e6ed",
                              cursor: "pointer",
                            }}
                          />
                        </Tooltip>
                      ))}
                    </Box>
                  )}
                </Box>

                {/* Hover Action Buttons */}
                {!msg.isDeleted && (
                  <Stack
                    direction="row"
                    spacing={0.25}
                    className="msg-actions"
                    sx={{
                      opacity: { xs: 1, md: 0.2 },
                      transition: "opacity 0.15s",
                      mb: 0.5,
                    }}
                  >
                    <Tooltip title="Thả biểu cảm">
                      <IconButton
                        size="small"
                        aria-label="Thả biểu cảm"
                        onClick={(e) =>
                          setReactionTarget({
                            anchor: e.currentTarget,
                            message: msg,
                          })
                        }
                      >
                        <AddReactionOutlinedIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Trả lời">
                      <IconButton
                        size="small"
                        aria-label="Trả lời tin nhắn"
                        onClick={() => setReplyTo(msg)}
                      >
                        <ReplyRoundedIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                    {canRecall && (
                      <Tooltip title="Thu hồi tin nhắn">
                        <IconButton
                          size="small"
                          aria-label="Thu hồi tin nhắn"
                          onClick={() => void handleRecallMessage(msg.id)}
                        >
                          <DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                )}
              </Box>
            );
          })
        )}

        <div ref={bottomRef} />
      </Box>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <Box sx={{ px: 3, py: 0.5, bgcolor: "#eef2f7" }}>
          <Typography sx={{ fontSize: 12, color: "#5d6e82", fontStyle: "italic" }}>
            {typingUsers.join(", ")} đang soạn tin nhắn...
          </Typography>
        </Box>
      )}

      {/* Reply Banner */}
      {replyTo && (
        <Box
          sx={{
            px: 2.5,
            py: 1,
            bgcolor: "#f7faff",
            borderTop: "1px solid #dce6f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#0866ff" }}>
              Đang trả lời {replyTo.senderDisplayName || "tin nhắn"}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12.5, color: "#556577" }}>
              {replyTo.text || `[${replyTo.kind}]`}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setReplyTo(null)}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Staged Attachments Preview Bar */}
      {stagedAttachments.length > 0 && (
        <Box
          sx={{
            px: 2.5,
            py: 1,
            bgcolor: "#fff",
            borderTop: "1px solid #e6ebf2",
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            alignItems: "center",
          }}
        >
          {stagedAttachments.map((att) => (
            <Chip
              key={att.storageKey}
              icon={<DescriptionRoundedIcon />}
              label={`${att.originalName} (${formatFileSize(att.sizeBytes)})`}
              onDelete={() =>
                setStagedAttachments((prev) =>
                  prev.filter((item) => item.storageKey !== att.storageKey),
                )
              }
              color="primary"
              variant="outlined"
            />
          ))}
        </Box>
      )}

      {/* Composer Toolbar + Input */}
      <Box
        component="form"
        onSubmit={handleSubmitComposer}
        sx={{
          bgcolor: "#fff",
          borderTop: "1px solid #e5eaf0",
          px: { xs: 1, sm: 2 },
          py: 1,
        }}
      >
        <input
          ref={imageInputRef}
          type="file"
          hidden
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
        />
        <input
          ref={videoInputRef}
          type="file"
          hidden
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleFileSelect}
        />
        <input
          ref={docInputRef}
          type="file"
          hidden
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.json,.zip"
          onChange={handleFileSelect}
        />

        <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, alignItems: "center" }}>
          <Tooltip title="Biểu cảm & Sticker">
            <IconButton
              size="small"
              aria-label="Mở bảng biểu cảm và sticker"
              onClick={(e) => setEmotionAnchor(e.currentTarget)}
              sx={{ color: "#516275" }}
            >
              <EmojiEmotionsOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Gửi hình ảnh (tối đa 10 MB)">
            <IconButton
              size="small"
              aria-label="Tải hình ảnh lên"
              disabled={isUploading}
              onClick={() => imageInputRef.current?.click()}
              sx={{ color: "#516275" }}
            >
              <ImageOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Gửi video (tối đa 50 MB)">
            <IconButton
              size="small"
              aria-label="Tải video lên"
              disabled={isUploading}
              onClick={() => videoInputRef.current?.click()}
              sx={{ color: "#516275" }}
            >
              <SmartDisplayOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Đính kèm tài liệu PDF / Office / ZIP (tối đa 25 MB)">
            <IconButton
              size="small"
              aria-label="Đính kèm tài liệu"
              disabled={isUploading}
              onClick={() => docInputRef.current?.click()}
              sx={{ color: "#516275" }}
            >
              <AttachFileRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {isUploading && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", ml: 1 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: 12, color: "#0866ff" }}>
                Đang tải tệp lên...
              </Typography>
            </Stack>
          )}
        </Stack>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <InputBase
            fullWidth
            multiline
            maxRows={4}
            placeholder="Nhập tin nhắn, @ hoặc chọn tệp đính kèm..."
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmitComposer();
              }
            }}
            inputProps={{ "aria-label": "Nội dung tin nhắn" }}
            sx={{
              px: 1.75,
              py: 1,
              borderRadius: 2.5,
              bgcolor: "#f3f6fa",
              fontSize: 14,
            }}
          />
          <IconButton
            type="submit"
            color="primary"
            aria-label="Gửi tin nhắn"
            disabled={
              isSending ||
              isUploading ||
              (!text.trim() && stagedAttachments.length === 0)
            }
            sx={{
              width: 42,
              height: 42,
              bgcolor: "#0866ff",
              color: "#fff",
              "&:hover": { bgcolor: "#0654d4" },
              "&.Mui-disabled": { bgcolor: "#dbe3ee", color: "#95a3b5" },
            }}
          >
            {isSending ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <SendRoundedIcon fontSize="small" />
            )}
          </IconButton>
        </Box>
      </Box>

      {/* Reaction Picker Popover */}
      <Popover
        open={Boolean(reactionTarget)}
        anchorEl={reactionTarget?.anchor}
        onClose={() => setReactionTarget(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Stack direction="row" spacing={0.5} sx={{ p: 0.75 }}>
          {REACTION_EMOJIS.map((emoji) => (
            <IconButton
              key={emoji}
              size="small"
              onClick={() =>
                reactionTarget &&
                void handleToggleReaction(reactionTarget.message, emoji)
              }
              sx={{ fontSize: 20 }}
            >
              {emoji}
            </IconButton>
          ))}
        </Stack>
      </Popover>

      {/* Sticker & Quick Emoji Popover */}
      <Popover
        open={Boolean(emotionAnchor)}
        anchorEl={emotionAnchor}
        onClose={() => setEmotionAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ width: 320, p: 1.5 }}>
          <Tabs
            value={emotionTab}
            onChange={(_, v) => setEmotionTab(v)}
            variant="fullWidth"
            sx={{ minHeight: 36, mb: 1.25 }}
          >
            <Tab label="Sticker Zalo" sx={{ minHeight: 36, fontSize: 12.5 }} />
            <Tab label="Emoji nhanh" sx={{ minHeight: 36, fontSize: 12.5 }} />
          </Tabs>

          {emotionTab === 0 ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 1,
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {ZALO_STICKERS.map((s) => (
                <Box
                  key={s.code}
                  component="button"
                  type="button"
                  onClick={() => void handleSendSticker(s.code, s.emoji)}
                  sx={{
                    border: 0,
                    borderRadius: 2,
                    p: 1,
                    cursor: "pointer",
                    background: s.bg,
                    textAlign: "center",
                    "&:hover": { filter: "brightness(0.96)" },
                  }}
                >
                  <Typography sx={{ fontSize: 26 }}>{s.emoji}</Typography>
                  <Typography
                    noWrap
                    sx={{ fontSize: 10.5, fontWeight: 700, color: s.accent }}
                  >
                    {s.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(8, 1fr)",
                gap: 0.5,
              }}
            >
              {QUICK_EMOJIS.map((emoji) => (
                <IconButton
                  key={emoji}
                  size="small"
                  onClick={() => void handleSendQuickEmoji(emoji)}
                  sx={{ fontSize: 20 }}
                >
                  {emoji}
                </IconButton>
              ))}
            </Box>
          )}
        </Box>
      </Popover>

      {/* Image Lightbox Preview */}
      <Dialog
        open={Boolean(lightboxImage)}
        onClose={() => setLightboxImage(null)}
        maxWidth="lg"
      >
        <DialogContent sx={{ p: 1, bgcolor: "#0f1722", textAlign: "center" }}>
          {lightboxImage && (
            <Box
              component="img"
              src={lightboxImage.url}
              alt={lightboxImage.name}
              sx={{ maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain" }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default ChatWindow;
