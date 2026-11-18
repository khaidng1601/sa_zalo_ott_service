import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AvatarBadge } from '../components/AvatarBadge';
import { CreateChatModal } from '../components/CreateChatModal';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { ZaloColors } from '../theme/zaloTheme';
import {
  Conversation,
  getConversationDisplayName,
  getConversationPartner,
} from '../types/chat';
import { AppStackParamList } from '../types/navigation';

type FilterType = 'all' | 'direct' | 'group';

const formatConversationTimestamp = (iso?: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  });
};

export const ConversationsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { currentUser } = useAuth();
  const {
    isSocketConnected,
    conversations,
    isLoadingConversations,
    conversationsError,
    onlineUserIds,
    typingByConversation,
    refreshConversations,
  } = useRealtime();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const currentUserId = currentUser?.id ?? '';

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conv) => {
      if (filter === 'direct' && conv.type !== 'DIRECT') return false;
      if (filter === 'group' && conv.type !== 'GROUP') return false;
      if (!query) return true;
      const name = getConversationDisplayName(conv, currentUserId).toLowerCase();
      return name.includes(query);
    });
  }, [conversations, filter, search, currentUserId]);

  const renderItem = ({ item }: { item: Conversation }) => {
    const title = getConversationDisplayName(item, currentUserId);
    const partner = getConversationPartner(item, currentUserId);
    const isOnline =
      item.type === 'DIRECT'
        ? Boolean(partner && onlineUserIds.has(partner.userId))
        : item.members.some(
            (m) => m.userId !== currentUserId && onlineUserIds.has(m.userId),
          );

    const typingNames = Object.values(typingByConversation[item.id] ?? {});
    const subtitle =
      typingNames.length > 0
        ? `${typingNames[0]} đang nhập...`
        : item.lastMessagePreview ||
          (item.type === 'GROUP'
            ? `${item.members.length} thành viên`
            : 'Nhấn để bắt đầu trò chuyện');

    return (
      <TouchableOpacity
        style={styles.convRow}
        activeOpacity={0.75}
        onPress={() =>
          navigation.navigate('Chat', {
            conversationId: item.id,
            initialTitle: title,
          })
        }
      >
        <AvatarBadge
          name={title}
          avatarUrl={partner?.avatarUrl}
          size={52}
          isOnline={isOnline}
          isGroup={item.type === 'GROUP'}
        />

        <View style={styles.convBody}>
          <View style={styles.convHeaderRow}>
            <View style={styles.convTitleWrap}>
              {item.type === 'GROUP' && (
                <View style={styles.groupTag}>
                  <Text style={styles.groupTagText}>NHÓM</Text>
                </View>
              )}
              <Text numberOfLines={1} style={styles.convTitle}>
                {title}
              </Text>
            </View>
            <Text style={styles.convTime}>
              {formatConversationTimestamp(
                item.lastMessageAt || item.createdAt,
              )}
            </Text>
          </View>

          <Text
            numberOfLines={1}
            style={[
              styles.convSubtitle,
              typingNames.length > 0 && styles.convTypingText,
            ]}
          >
            {subtitle}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      {/* Zalo Signature Top Search Header */}
      <LinearGradient
        colors={[ZaloColors.gradientStart, ZaloColors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.topBar, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.9)" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm kiếm cuộc trò chuyện..."
            placeholderTextColor="rgba(255,255,255,0.78)"
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons
                name="close-circle"
                size={17}
                color="rgba(255,255,255,0.85)"
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.socketBadge} accessibilityLabel="Trạng thái realtime">
          <View
            style={[
              styles.socketDot,
              {
                backgroundColor: isSocketConnected ? '#4ADE80' : '#FBBF24',
              },
            ]}
          />
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setCreateModalOpen(true)}
        >
          <Ionicons name="add" size={25} color="#FFFFFF" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Filter Bar */}
      <View style={styles.filterBar}>
        {(
          [
            { key: 'all', label: 'Tất cả' },
            { key: 'direct', label: 'Cá nhân' },
            { key: 'group', label: 'Nhóm' },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.filterChip,
              filter === tab.key && styles.filterChipActive,
            ]}
            onPress={() => setFilter(tab.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === tab.key && styles.filterChipTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {conversationsError !== '' && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{conversationsError}</Text>
          <TouchableOpacity onPress={() => void refreshConversations()}>
            <Text style={styles.retryLink}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoadingConversations && conversations.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={ZaloColors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={isLoadingConversations}
              onRefresh={() => void refreshConversations()}
              tintColor={ZaloColors.primary}
            />
          }
          contentContainerStyle={
            filteredConversations.length === 0 ? styles.emptyContainer : undefined
          }
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={48}
                color={ZaloColors.textMuted}
              />
              <Text style={styles.emptyTitle}>Chưa có cuộc trò chuyện</Text>
              <Text style={styles.emptyDesc}>
                Nhấn dấu + ở góc trên bên phải để nhắn tin 1-1 hoặc tạo nhóm mới.
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => setCreateModalOpen(true)}
              >
                <Text style={styles.emptyActionBtnText}>Bắt đầu trò chuyện</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <CreateChatModal
        visible={createModalOpen}
        currentUserId={currentUserId}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(conversationId, title) => {
          void refreshConversations(true);
          navigation.navigate('Chat', {
            conversationId,
            initialTitle: title,
          });
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 11,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 11,
    height: 38,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 0,
  },
  socketBadge: {
    width: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socketDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: ZaloColors.divider,
    backgroundColor: '#FFFFFF',
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: ZaloColors.primarySoft,
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: ZaloColors.textSecondary,
  },
  filterChipTextActive: {
    color: ZaloColors.primary,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ZaloColors.dangerSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12.5,
    color: ZaloColors.danger,
  },
  retryLink: {
    fontSize: 12.5,
    fontWeight: '700',
    color: ZaloColors.primary,
    marginLeft: 10,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: ZaloColors.divider,
    backgroundColor: '#FFFFFF',
  },
  convBody: {
    flex: 1,
  },
  convHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  convTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupTag: {
    backgroundColor: ZaloColors.primarySoft,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  groupTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: ZaloColors.primary,
  },
  convTitle: {
    flexShrink: 1,
    fontSize: 15.5,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
  },
  convTime: {
    fontSize: 11.5,
    color: ZaloColors.textMuted,
  },
  convSubtitle: {
    fontSize: 13.5,
    color: ZaloColors.textSecondary,
  },
  convTypingText: {
    color: ZaloColors.primary,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 13,
    color: ZaloColors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  emptyActionBtn: {
    marginTop: 16,
    backgroundColor: ZaloColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
});
