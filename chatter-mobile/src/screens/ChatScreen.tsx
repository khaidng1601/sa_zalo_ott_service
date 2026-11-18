import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AvatarBadge } from '../components/AvatarBadge';
import { EmotionSheet } from '../components/EmotionSheet';
import { MessageBubble } from '../components/MessageBubble';
import { ZaloStickerItem } from '../constants/emotions';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { resolveMediaUrl } from '../services/config';
import { graphqlRequest } from '../services/graphql';
import {
  formatFileSize,
  uploadConversationFile,
  UploadedAttachment,
} from '../services/uploads';
import { ZaloColors } from '../theme/zaloTheme';
import {
  ChatMessage,
  getConversationDisplayName,
  getConversationPartner,
  GraphQLMessageKind,
} from '../types/chat';
import { AppStackParamList } from '../types/navigation';

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

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

export const ChatScreen: React.FC<Props> = ({ route, navigation }) => {
  const { conversationId, initialTitle } = route.params;
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const {
    conversations,
    onlineUserIds,
    typingByConversation,
    joinConversationRoom,
    emitTyping,
    subscribeMessages,
    refreshConversations,
  } = useRealtime();

  const currentUserId = currentUser?.id ?? '';

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId],
  );

  const displayTitle = conversation
    ? getConversationDisplayName(conversation, currentUserId)
    : initialTitle || 'Trò chuyện';

  const partner = conversation
    ? getConversationPartner(conversation, currentUserId)
    : undefined;

  const isGroup = conversation?.type === 'GROUP';
  const myRole = conversation?.members.find(
    (m) => m.userId === currentUserId,
  )?.role;
  const canManageGroup = Boolean(
    isGroup && (myRole === 'OWNER' || myRole === 'ADMIN'),
  );

  const isPartnerOnline = Boolean(
    partner && onlineUserIds.has(partner.userId),
  );

  const typingNames = Object.values(
    typingByConversation[conversationId] ?? {},
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [stagedAttachments, setStagedAttachments] = useState<
    UploadedAttachment[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [emotionOpen, setEmotionOpen] = useState(false);

  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
    }, 80);
  }, []);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await graphqlRequest<{
        messages: {
          items: ChatMessage[];
          hasMore: boolean;
          nextCursor?: string | null;
        };
      }>(MESSAGES_QUERY, {
        conversationId,
        limit: 30,
      });
      setMessages(data.messages.items ?? []);
      setHasMore(Boolean(data.messages.hasMore));
      setNextCursor(data.messages.nextCursor ?? null);
      scrollToEnd(false);

      void graphqlRequest(
        'mutation MarkRead($conversationId: String!) { markConversationRead(conversationId: $conversationId) }',
        { conversationId },
      ).catch(() => undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể tải lịch sử tin nhắn.',
      );
    } finally {
      setLoading(false);
    }
  }, [conversationId, scrollToEnd]);

  useEffect(() => {
    joinConversationRoom(conversationId);
    void loadMessages();
  }, [conversationId, joinConversationRoom, loadMessages]);

  useEffect(() => {
    const unsubscribe = subscribeMessages(({ type, message }) => {
      if (message.conversationId !== conversationId) return;

      setMessages((prev) => {
        const exists = prev.some((m) => m.id === message.id);
        if (type === 'created') {
          if (exists) {
            return prev.map((m) => (m.id === message.id ? message : m));
          }
          return [...prev, message];
        }
        if (type === 'updated' || type === 'deleted') {
          return prev.map((m) =>
            m.id === message.id ? { ...m, ...message } : m,
          );
        }
        return prev;
      });

      if (type === 'created') {
        scrollToEnd(true);
      }
    });

    return unsubscribe;
  }, [conversationId, subscribeMessages, scrollToEnd]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      emitTyping(conversationId, false);
    };
  }, [conversationId, emitTyping]);

  const loadOlder = async () => {
    if (!hasMore || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await graphqlRequest<{
        messages: {
          items: ChatMessage[];
          hasMore: boolean;
          nextCursor?: string | null;
        };
      }>(MESSAGES_QUERY, {
        conversationId,
        before: nextCursor,
        limit: 25,
      });
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const older = (data.messages.items ?? []).filter(
          (m) => !seen.has(m.id),
        );
        return [...older, ...prev];
      });
      setHasMore(Boolean(data.messages.hasMore));
      setNextCursor(data.messages.nextCursor ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể tải tin nhắn cũ hơn.',
      );
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleChangeText = (val: string) => {
    setText(val);
    emitTyping(conversationId, val.trim().length > 0);
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      emitTyping(conversationId, false);
    }, 2000);
  };

  const stageUploadedAssets = (uploadedList: UploadedAttachment[]) => {
    if (uploadedList.length === 0) return;
    setStagedAttachments((prev) => {
      if (prev.length > 0 && prev[0].kind !== uploadedList[0].kind) {
        return uploadedList;
      }
      if (uploadedList[0].kind === 'video') {
        return [uploadedList[0]];
      }
      return [...prev, ...uploadedList].slice(0, 5);
    });
  };

  const handlePickImages = async () => {
    setEmotionOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền Thư viện ảnh.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    setError('');
    try {
      const uploaded: UploadedAttachment[] = [];
      for (const asset of result.assets) {
        const item = await uploadConversationFile(conversationId, {
          uri: asset.uri,
          name: asset.fileName,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        });
        uploaded.push(item);
      }
      stageUploadedAssets(uploaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải ảnh lên thất bại.');
    } finally {
      setUploading(false);
    }
  };

  const handleCaptureCamera = async () => {
    setEmotionOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền Camera', 'Vui lòng cấp quyền Camera để chụp ảnh.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    setError('');
    try {
      const item = await uploadConversationFile(conversationId, {
        uri: asset.uri,
        name: asset.fileName || `camera_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        size: asset.fileSize,
      });
      stageUploadedAssets([item]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải ảnh chụp thất bại.');
    } finally {
      setUploading(false);
    }
  };

  const handlePickVideo = async () => {
    setEmotionOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền Thư viện video.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    setError('');
    try {
      const item = await uploadConversationFile(conversationId, {
        uri: asset.uri,
        name: asset.fileName || `video_${Date.now()}.mp4`,
        mimeType: asset.mimeType || 'video/mp4',
        size: asset.fileSize,
      });
      stageUploadedAssets([item]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải video thất bại.');
    } finally {
      setUploading(false);
    }
  };

  const handlePickDocument = async () => {
    setEmotionOpen(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/json',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
      ],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    setError('');
    try {
      const item = await uploadConversationFile(conversationId, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      });
      stageUploadedAssets([item]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tải tài liệu thất bại.');
    } finally {
      setUploading(false);
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
    setSending(true);
    setError('');
    try {
      const res = await graphqlRequest<{ sendMessage: ChatMessage }>(
        SEND_MESSAGE_MUTATION,
        {
          input: {
            conversationId,
            kind: payload.kind,
            text: payload.text,
            stickerCode: payload.stickerCode,
            attachments: payload.attachments,
            replyToId: replyTo?.id,
          },
        },
      );
      const created = res.sendMessage;
      setMessages((prev) =>
        prev.some((m) => m.id === created.id) ? prev : [...prev, created],
      );
      setReplyTo(null);
      emitTyping(conversationId, false);
      void refreshConversations(true);
      scrollToEnd(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi tin nhắn.');
      throw err;
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (sending || uploading) return;

    if (stagedAttachments.length > 0) {
      const kindMap: Record<UploadedAttachment['kind'], GraphQLMessageKind> = {
        image: 'IMAGE',
        video: 'VIDEO',
        document: 'DOCUMENT',
      };
      const kind = kindMap[stagedAttachments[0].kind];
      const attachments = stagedAttachments.map((att) => ({
        storageKey: att.storageKey,
        originalName: att.originalName,
        mimeType: att.mimeType,
      }));
      const caption = text.trim() || undefined;
      await dispatchMessage({
        kind,
        text: caption,
        attachments,
      });
      setStagedAttachments([]);
      setText('');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;
    await dispatchMessage({ kind: 'TEXT', text: trimmed });
    setText('');
  };

  const handleSelectSticker = async (sticker: ZaloStickerItem) => {
    setEmotionOpen(false);
    await dispatchMessage({
      kind: 'EMOTION',
      stickerCode: sticker.code,
      text: sticker.emoji,
    });
  };

  const handleSelectEmoji = async (emoji: string) => {
    if (text.trim().length > 0 || stagedAttachments.length > 0) {
      setText((prev) => `${prev}${emoji}`);
      return;
    }
    setEmotionOpen(false);
    await dispatchMessage({
      kind: 'EMOTION',
      text: emoji,
    });
  };

  const handleToggleReaction = async (msg: ChatMessage, emoji: string) => {
    const mine = msg.reactions.find((r) => r.userId === currentUserId);
    try {
      if (mine?.emoji === emoji) {
        const res = await graphqlRequest<{
          removeMessageReaction: Pick<ChatMessage, 'id' | 'reactions'>;
        }>(REMOVE_REACTION_MUTATION, { messageId: msg.id });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, reactions: res.removeMessageReaction.reactions }
              : m,
          ),
        );
      } else {
        const res = await graphqlRequest<{
          reactToMessage: Pick<ChatMessage, 'id' | 'reactions'>;
        }>(REACT_MUTATION, { messageId: msg.id, emoji });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, reactions: res.reactToMessage.reactions }
              : m,
          ),
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể thả biểu cảm.',
      );
    }
  };

  const handleRecall = async (messageId: string) => {
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
        err instanceof Error ? err.message : 'Không thể thu hồi tin nhắn.',
      );
    }
  };

  const headerSubtitle =
    typingNames.length > 0
      ? `${typingNames[0]} đang nhập...`
      : isGroup
        ? `${conversation?.members.length ?? 0} thành viên`
        : isPartnerOnline
          ? 'Đang hoạt động'
          : 'Nhắn tin thời gian thực';

  const canSend =
    !sending &&
    !uploading &&
    (text.trim().length > 0 || stagedAttachments.length > 0);

  return (
    <View style={styles.root}>
      {/* Zalo Chat Header */}
      <LinearGradient
        colors={[ZaloColors.gradientStart, ZaloColors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>

        <AvatarBadge
          name={displayTitle}
          avatarUrl={partner?.avatarUrl}
          size={38}
          isOnline={isPartnerOnline}
          isGroup={Boolean(isGroup)}
        />

        <View style={styles.headerTextWrap}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {displayTitle}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {headerSubtitle}
          </Text>
        </View>

        {isGroup && (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('GroupInfo', { conversationId })
            }
            hitSlop={10}
            style={styles.headerActionBtn}
          >
            <Ionicons
              name="information-circle-outline"
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        )}
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {error !== '' && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError('')}>
              <Ionicons name="close" size={18} color={ZaloColors.danger} />
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={ZaloColors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={
              messages.length === 0
                ? styles.emptyListContent
                : styles.messagesContent
            }
            ListHeaderComponent={
              hasMore ? (
                <TouchableOpacity
                  style={styles.loadOlderBtn}
                  disabled={loadingOlder}
                  onPress={() => void loadOlder()}
                >
                  {loadingOlder ? (
                    <ActivityIndicator
                      size="small"
                      color={ZaloColors.primary}
                    />
                  ) : (
                    <Text style={styles.loadOlderText}>
                      Tải tin nhắn cũ hơn
                    </Text>
                  )}
                </TouchableOpacity>
              ) : undefined
            }
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Text style={styles.emptyTitle}>Bắt đầu cuộc trò chuyện</Text>
                <Text style={styles.emptySubtitle}>
                  Hãy gửi văn bản, hình ảnh, video, tài liệu hoặc Sticker Zalo
                  đầu tiên!
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                currentUserId={currentUserId}
                isGroup={Boolean(isGroup)}
                canManageGroup={canManageGroup}
                onReply={(target) => setReplyTo(target)}
                onToggleReaction={(target, emoji) =>
                  void handleToggleReaction(target, emoji)
                }
                onRecall={(id) => void handleRecall(id)}
              />
            )}
          />
        )}

        {/* Typing Indicator Bar */}
        {typingNames.length > 0 && (
          <View style={styles.typingStrip}>
            <Text style={styles.typingStripText}>
              💬 {typingNames.join(', ')} đang soạn tin nhắn...
            </Text>
          </View>
        )}

        {/* Reply Preview Strip */}
        {replyTo && (
          <View style={styles.replyComposerStrip}>
            <View style={styles.replyComposerInfo}>
              <Text style={styles.replyComposerTitle}>
                Đang trả lời {replyTo.senderDisplayName || 'tin nhắn'}
              </Text>
              <Text numberOfLines={1} style={styles.replyComposerSnippet}>
                {replyTo.text || `[${replyTo.kind}]`}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={20}
                color={ZaloColors.textMuted}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Staged Attachments Preview Strip */}
        {(stagedAttachments.length > 0 || uploading) && (
          <View style={styles.stagedStrip}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stagedScroll}
            >
              {stagedAttachments.map((att) => (
                <View key={att.storageKey} style={styles.stagedCard}>
                  {att.kind === 'image' ? (
                    <Image
                      source={{ uri: resolveMediaUrl(att.url) }}
                      style={styles.stagedThumb}
                    />
                  ) : (
                    <View style={styles.stagedFileBadge}>
                      <Ionicons
                        name={
                          att.kind === 'video'
                            ? 'videocam'
                            : 'document-text'
                        }
                        size={18}
                        color={ZaloColors.primary}
                      />
                      <Text numberOfLines={1} style={styles.stagedFileName}>
                        {att.originalName}
                      </Text>
                      <Text style={styles.stagedFileSize}>
                        {formatFileSize(att.sizeBytes)}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.stagedRemoveBtn}
                    onPress={() =>
                      setStagedAttachments((prev) =>
                        prev.filter((x) => x.storageKey !== att.storageKey),
                      )
                    }
                  >
                    <Ionicons name="close" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
              {uploading && (
                <View style={styles.uploadingIndicator}>
                  <ActivityIndicator size="small" color={ZaloColors.primary} />
                  <Text style={styles.uploadingText}>Đang tải tệp...</Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* Composer Media Toolbar (5 Payload Controls) */}
        <View style={styles.composerContainer}>
          <View style={styles.mediaToolbar}>
            <TouchableOpacity
              style={[
                styles.toolBtn,
                emotionOpen && styles.toolBtnActive,
              ]}
              onPress={() => {
                Keyboard.dismiss();
                setEmotionOpen((prev) => !prev);
              }}
            >
              <Ionicons
                name="happy-outline"
                size={22}
                color={
                  emotionOpen ? ZaloColors.primary : ZaloColors.textSecondary
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              disabled={uploading}
              onPress={() => void handlePickImages()}
            >
              <Ionicons
                name="image-outline"
                size={22}
                color={ZaloColors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              disabled={uploading}
              onPress={() => void handleCaptureCamera()}
            >
              <Ionicons
                name="camera-outline"
                size={22}
                color={ZaloColors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              disabled={uploading}
              onPress={() => void handlePickVideo()}
            >
              <Ionicons
                name="videocam-outline"
                size={22}
                color={ZaloColors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              disabled={uploading}
              onPress={() => void handlePickDocument()}
            >
              <Ionicons
                name="attach-outline"
                size={23}
                color={ZaloColors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.inputRow,
              {
                paddingBottom: emotionOpen
                  ? 8
                  : Math.max(insets.bottom, 8),
              },
            ]}
          >
            <TextInput
              value={text}
              onChangeText={handleChangeText}
              onFocus={() => setEmotionOpen(false)}
              placeholder={
                stagedAttachments.length > 0
                  ? 'Thêm chú thích cho tệp đính kèm...'
                  : 'Tin nhắn...'
              }
              placeholderTextColor={ZaloColors.textMuted}
              multiline
              maxLength={4000}
              style={styles.textInput}
            />

            <TouchableOpacity
              disabled={!canSend}
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={() => void handleSend()}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {emotionOpen && (
          <View style={{ paddingBottom: insets.bottom }}>
            <EmotionSheet
              onSelectSticker={(sticker) => void handleSelectSticker(sticker)}
              onSelectEmoji={(emoji) => void handleSelectEmoji(emoji)}
              onClose={() => setEmotionOpen(false)}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ZaloColors.chatBackground,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 1,
  },
  headerActionBtn: {
    padding: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ZaloColors.dangerSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    color: ZaloColors.danger,
    fontWeight: '600',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  messagesContent: {
    paddingVertical: 10,
  },
  emptyTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: ZaloColors.textSecondary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: ZaloColors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  loadOlderBtn: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: ZaloColors.border,
  },
  loadOlderText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: ZaloColors.primary,
  },
  typingStrip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  typingStripText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: ZaloColors.primaryDark,
  },
  replyComposerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F0F6FF',
    borderTopWidth: 1,
    borderTopColor: '#D5E5FF',
  },
  replyComposerInfo: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: ZaloColors.primary,
    paddingLeft: 9,
    marginRight: 10,
  },
  replyComposerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: ZaloColors.primary,
  },
  replyComposerSnippet: {
    fontSize: 12,
    color: ZaloColors.textSecondary,
  },
  stagedStrip: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: ZaloColors.divider,
    paddingVertical: 8,
  },
  stagedScroll: {
    paddingHorizontal: 12,
    gap: 10,
    alignItems: 'center',
  },
  stagedCard: {
    position: 'relative',
  },
  stagedThumb: {
    width: 62,
    height: 62,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  stagedFileBadge: {
    width: 135,
    height: 62,
    borderRadius: 10,
    backgroundColor: ZaloColors.primarySoft,
    padding: 8,
    justifyContent: 'center',
  },
  stagedFileName: {
    fontSize: 11.5,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
    marginTop: 2,
  },
  stagedFileSize: {
    fontSize: 10,
    color: ZaloColors.textSecondary,
  },
  stagedRemoveBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  uploadingText: {
    fontSize: 12,
    color: ZaloColors.primary,
    fontWeight: '600',
  },
  composerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: ZaloColors.border,
  },
  mediaToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 6,
    gap: 4,
  },
  toolBtn: {
    width: 38,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: {
    backgroundColor: ZaloColors.primarySoft,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 4,
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 105,
    backgroundColor: '#F3F6FA',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
    color: ZaloColors.textPrimary,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ZaloColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#B8CBE5',
  },
});
