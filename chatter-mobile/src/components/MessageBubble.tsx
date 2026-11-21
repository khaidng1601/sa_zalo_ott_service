import React, { useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { findStickerByCode, REACTION_EMOJIS } from '../constants/emotions';
import { resolveMediaUrl } from '../services/config';
import { formatFileSize } from '../services/uploads';
import { ZaloColors } from '../theme/zaloTheme';
import { ChatMessage } from '../types/chat';
import { AvatarBadge } from './AvatarBadge';
import { VideoAttachmentPlayer } from './VideoAttachmentPlayer';

interface MessageBubbleProps {
  message: ChatMessage;
  currentUserId: string;
  isGroup: boolean;
  canManageGroup: boolean;
  onReply: (message: ChatMessage) => void;
  onToggleReaction: (message: ChatMessage, emoji: string) => void;
  onRecall: (messageId: string) => void;
}

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const getDocBadgeLabel = (fileName: string, mimeType: string): string => {
  const ext = fileName.split('.').pop()?.toUpperCase() ?? '';
  if (ext && ext.length <= 5) return ext;
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word')) return 'DOCX';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'XLSX';
  if (mimeType.includes('zip')) return 'ZIP';
  return 'FILE';
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUserId,
  isGroup,
  canManageGroup,
  onReply,
  onToggleReaction,
  onRecall,
}) => {
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    uri: string;
    name: string;
  } | null>(null);

  const isMine = message.senderId === currentUserId;
  const canRecall = !message.isDeleted && (isMine || canManageGroup);
  const isStandaloneEmotion = message.kind === 'EMOTION' && !message.isDeleted;

  const groupedReactions = message.reactions.reduce<
    Record<string, { count: number; mine: boolean }>
  >((acc, r) => {
    if (!acc[r.emoji]) {
      acc[r.emoji] = { count: 0, mine: false };
    }
    acc[r.emoji].count += 1;
    if (r.userId === currentUserId) {
      acc[r.emoji].mine = true;
    }
    return acc;
  }, {});

  const handleOpenDocument = async (rawUrl: string) => {
    const resolved = resolveMediaUrl(rawUrl);
    if (!resolved) return;
    const downloadUrl = resolved.includes('?')
      ? `${resolved}&download=1`
      : `${resolved}?download=1`;
    try {
      await WebBrowser.openBrowserAsync(downloadUrl);
    } catch {
      await Linking.openURL(downloadUrl).catch(() => undefined);
    }
  };

  const handleCopyText = async () => {
    if (message.text) {
      await Clipboard.setStringAsync(message.text);
    }
    setActionSheetOpen(false);
  };

  const renderContent = () => {
    if (message.isDeleted) {
      return (
        <Text style={styles.recalledText}>Tin nhắn đã được thu hồi</Text>
      );
    }

    if (message.kind === 'EMOTION') {
      const sticker = findStickerByCode(message.stickerCode);
      if (sticker) {
        return (
          <LinearGradient
            colors={[sticker.gradient[0], sticker.gradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.stickerBubble}
          >
            <Text style={styles.stickerEmojiLarge}>{sticker.emoji}</Text>
            <Text style={[styles.stickerCaption, { color: sticker.accent }]}>
              {sticker.label}
            </Text>
          </LinearGradient>
        );
      }
      return (
        <Text style={styles.jumboEmoji}>{message.text || '😊'}</Text>
      );
    }

    return (
      <View style={styles.payloadWrap}>
        {message.kind === 'IMAGE' && message.attachments.length > 0 && (
          <View
            style={[
              styles.imageGrid,
              message.text ? { marginBottom: 8 } : null,
            ]}
          >
            {message.attachments.map((att) => {
              const uri = resolveMediaUrl(att.url);
              if (!uri) return null;
              const isSingle = message.attachments.length === 1;
              return (
                <TouchableOpacity
                  key={att.storageKey}
                  activeOpacity={0.88}
                  onPress={() =>
                    setLightboxImage({ uri, name: att.originalName })
                  }
                >
                  <Image
                    source={{ uri }}
                    style={
                      isSingle ? styles.singleImage : styles.gridImageItem
                    }
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {message.kind === 'VIDEO' &&
          message.attachments.map((att) => (
            <View
              key={att.storageKey}
              style={message.text ? { marginBottom: 8 } : null}
            >
              <VideoAttachmentPlayer
                url={att.url}
                originalName={att.originalName}
                sizeBytes={att.sizeBytes}
              />
            </View>
          ))}

        {message.kind === 'DOCUMENT' &&
          message.attachments.map((att) => (
            <TouchableOpacity
              key={att.storageKey}
              activeOpacity={0.8}
              style={[
                styles.docCard,
                isMine ? styles.docCardMine : styles.docCardPeer,
                message.text ? { marginBottom: 8 } : null,
              ]}
              onPress={() => void handleOpenDocument(att.url)}
            >
              <View style={styles.docBadge}>
                <Text style={styles.docBadgeText}>
                  {getDocBadgeLabel(att.originalName, att.mimeType)}
                </Text>
              </View>
              <View style={styles.docMeta}>
                <Text numberOfLines={1} style={styles.docTitle}>
                  {att.originalName}
                </Text>
                <Text style={styles.docSize}>
                  {formatFileSize(att.sizeBytes)} · Nhấn để mở/tải
                </Text>
              </View>
              <Ionicons
                name="download-outline"
                size={20}
                color={ZaloColors.primary}
              />
            </TouchableOpacity>
          ))}

        {Boolean(message.text) && (
          <Text style={styles.messageText}>{message.text}</Text>
        )}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowPeer,
      ]}
    >
      {!isMine && (
        <View style={styles.avatarCol}>
          <AvatarBadge
            name={message.senderDisplayName || 'U'}
            avatarUrl={message.senderAvatarUrl}
            size={32}
          />
        </View>
      )}

      <View
        style={[
          styles.bubbleColumn,
          isMine ? styles.alignEnd : styles.alignStart,
        ]}
      >
        {!isMine && isGroup && (
          <Text style={styles.senderName}>
            {message.senderDisplayName || 'Thành viên'}
          </Text>
        )}

        <View
          style={[
            styles.bubbleWithBtnRow,
            isMine ? styles.rowMine : styles.rowPeer,
          ]}
        >
          <Pressable
            onLongPress={() => {
              if (!message.isDeleted) {
                setActionSheetOpen(true);
              }
            }}
            delayLongPress={220}
            style={[
              styles.bubbleShell,
              isStandaloneEmotion
                ? styles.emotionShell
                : isMine
                  ? styles.sentShell
                  : styles.receivedShell,
            ]}
          >
            {message.replyTo && !message.isDeleted && (
              <View style={styles.replyBanner}>
                <Text style={styles.replyAuthor}>
                  {message.replyTo.senderDisplayName || 'Tin nhắn'}
                </Text>
                <Text numberOfLines={1} style={styles.replySnippet}>
                  {message.replyTo.isDeleted
                    ? 'Tin nhắn đã thu hồi'
                    : message.replyTo.text || `[${message.replyTo.kind}]`}
                </Text>
              </View>
            )}

            {renderContent()}

            <Text
              style={[
                styles.timestamp,
                isMine ? styles.timestampMine : styles.timestampPeer,
              ]}
            >
              {formatTime(message.createdAt)}
            </Text>
          </Pressable>

          {!message.isDeleted && (
            <TouchableOpacity
              onPress={() => setActionSheetOpen(true)}
              hitSlop={8}
              style={styles.quickActionTrigger}
            >
              <Ionicons
                name="happy-outline"
                size={16}
                color={ZaloColors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>

        {Object.keys(groupedReactions).length > 0 && (
          <View style={styles.reactionsBar}>
            {Object.entries(groupedReactions).map(([emoji, info]) => (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.reactionPill,
                  info.mine && styles.reactionPillMine,
                ]}
                onPress={() => onToggleReaction(message, emoji)}
              >
                <Text style={styles.reactionEmojiText}>
                  {emoji} {info.count > 1 ? info.count : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Message Reaction & Action Sheet */}
      <Modal
        visible={actionSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setActionSheetOpen(false)}
        >
          <Pressable style={styles.actionCard} onPress={() => undefined}>
            <View style={styles.reactionPickerRow}>
              {REACTION_EMOJIS.map((emoji) => {
                const isSelected = message.reactions.some(
                  (r) => r.userId === currentUserId && r.emoji === emoji,
                );
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.reactionChoice,
                      isSelected && styles.reactionChoiceSelected,
                    ]}
                    onPress={() => {
                      setActionSheetOpen(false);
                      onToggleReaction(message, emoji);
                    }}
                  >
                    <Text style={styles.reactionChoiceEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.menuList}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setActionSheetOpen(false);
                  onReply(message);
                }}
              >
                <Ionicons
                  name="return-up-back-outline"
                  size={20}
                  color={ZaloColors.primary}
                />
                <Text style={styles.menuText}>Trả lời tin nhắn</Text>
              </TouchableOpacity>

              {Boolean(message.text) && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => void handleCopyText()}
                >
                  <Ionicons
                    name="copy-outline"
                    size={19}
                    color={ZaloColors.textPrimary}
                  />
                  <Text style={styles.menuText}>Sao chép văn bản</Text>
                </TouchableOpacity>
              )}

              {canRecall && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setActionSheetOpen(false);
                    onRecall(message.id);
                  }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={19}
                    color={ZaloColors.danger}
                  />
                  <Text style={[styles.menuText, { color: ZaloColors.danger }]}>
                    Thu hồi tin nhắn
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fullscreen Lightbox Modal for Images */}
      <Modal
        visible={Boolean(lightboxImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxImage(null)}
      >
        <View style={styles.lightboxBackdrop}>
          <View style={styles.lightboxHeader}>
            <Text numberOfLines={1} style={styles.lightboxTitle}>
              {lightboxImage?.name}
            </Text>
            <TouchableOpacity
              onPress={() => setLightboxImage(null)}
              style={styles.lightboxCloseBtn}
            >
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {lightboxImage && (
            <Image
              source={{ uri: lightboxImage.uri }}
              style={styles.lightboxFullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 5,
    paddingHorizontal: 10,
  },
  rowMine: {
    flexDirection: 'row-reverse',
  },
  rowPeer: {
    flexDirection: 'row',
  },
  avatarCol: {
    marginRight: 8,
    marginBottom: 4,
  },
  bubbleColumn: {
    maxWidth: '80%',
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  alignStart: {
    alignItems: 'flex-start',
  },
  senderName: {
    fontSize: 11.5,
    fontWeight: '600',
    color: ZaloColors.textSecondary,
    marginBottom: 3,
    marginLeft: 4,
  },
  bubbleWithBtnRow: {
    alignItems: 'center',
    gap: 6,
  },
  bubbleShell: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 6,
  },
  sentShell: {
    backgroundColor: ZaloColors.bubbleSent,
    borderWidth: 1,
    borderColor: ZaloColors.bubbleSentBorder,
  },
  receivedShell: {
    backgroundColor: ZaloColors.bubbleReceived,
    borderWidth: 1,
    borderColor: ZaloColors.bubbleReceivedBorder,
  },
  emotionShell: {
    backgroundColor: 'transparent',
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  replyBanner: {
    borderLeftWidth: 3,
    borderLeftColor: ZaloColors.primary,
    backgroundColor: 'rgba(0, 104, 255, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 6,
  },
  replyAuthor: {
    fontSize: 11.5,
    fontWeight: '700',
    color: ZaloColors.primary,
  },
  replySnippet: {
    fontSize: 12,
    color: ZaloColors.textSecondary,
  },
  recalledText: {
    fontStyle: 'italic',
    fontSize: 13.5,
    color: ZaloColors.textMuted,
    paddingVertical: 2,
  },
  payloadWrap: {
    minWidth: 48,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    color: ZaloColors.textPrimary,
  },
  stickerBubble: {
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 132,
  },
  stickerEmojiLarge: {
    fontSize: 44,
    marginBottom: 4,
  },
  stickerCaption: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  jumboEmoji: {
    fontSize: 46,
    paddingHorizontal: 4,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  singleImage: {
    width: 225,
    height: 185,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
  },
  gridImageItem: {
    width: 108,
    height: 108,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 11,
    minWidth: 220,
  },
  docCardMine: {
    backgroundColor: 'rgba(0, 104, 255, 0.09)',
  },
  docCardPeer: {
    backgroundColor: '#F1F5F9',
  },
  docBadge: {
    width: 40,
    height: 40,
    borderRadius: 9,
    backgroundColor: ZaloColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 10.5,
  },
  docMeta: {
    flex: 1,
  },
  docTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
  },
  docSize: {
    fontSize: 11,
    color: ZaloColors.textSecondary,
    marginTop: 2,
  },
  timestamp: {
    fontSize: 10.5,
    color: ZaloColors.textMuted,
    marginTop: 3,
  },
  timestampMine: {
    textAlign: 'right',
  },
  timestampPeer: {
    textAlign: 'left',
  },
  quickActionTrigger: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: -5,
    marginHorizontal: 6,
  },
  reactionPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#DCE4EE',
  },
  reactionPillMine: {
    backgroundColor: '#E5F0FF',
    borderColor: ZaloColors.primary,
  },
  reactionEmojiText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: ZaloColors.textPrimary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: ZaloColors.overlay,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
  },
  reactionPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: ZaloColors.divider,
  },
  reactionChoice: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionChoiceSelected: {
    backgroundColor: ZaloColors.primarySoft,
  },
  reactionChoiceEmoji: {
    fontSize: 22,
  },
  menuList: {
    paddingTop: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 6,
  },
  menuText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: ZaloColors.textPrimary,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
  },
  lightboxHeader: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lightboxTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
  },
  lightboxCloseBtn: {
    padding: 6,
  },
  lightboxFullImage: {
    width: '100%',
    height: '78%',
  },
});
