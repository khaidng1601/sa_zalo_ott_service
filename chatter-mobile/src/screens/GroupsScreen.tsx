import React, { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
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
import { Conversation } from '../types/chat';
import { AppStackParamList } from '../types/navigation';

const roleBadgeText = (role?: string): string => {
  if (role === 'OWNER') return 'Chủ nhóm';
  if (role === 'ADMIN') return 'Quản trị viên';
  return 'Thành viên';
};

export const GroupsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { currentUser } = useAuth();
  const {
    conversations,
    isLoadingConversations,
    onlineUserIds,
    refreshConversations,
  } = useRealtime();

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const currentUserId = currentUser?.id ?? '';

  const groups = useMemo(
    () => conversations.filter((c) => c.type === 'GROUP'),
    [conversations],
  );

  const renderGroup = ({ item }: { item: Conversation }) => {
    const myMember = item.members.find((m) => m.userId === currentUserId);
    const onlineCount = item.members.filter((m) =>
      onlineUserIds.has(m.userId),
    ).length;

    return (
      <TouchableOpacity
        style={styles.groupCard}
        activeOpacity={0.78}
        onPress={() =>
          navigation.navigate('Chat', {
            conversationId: item.id,
            initialTitle: item.title || 'Nhóm trò chuyện',
          })
        }
      >
        <AvatarBadge
          name={item.title || 'Nhóm'}
          size={50}
          isGroup
          isOnline={onlineCount > 1}
        />
        <View style={styles.groupBody}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.groupTitle}>
              {item.title || 'Nhóm chưa đặt tên'}
            </Text>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>
                {roleBadgeText(myMember?.role)}
              </Text>
            </View>
          </View>
          <Text style={styles.groupStats}>
            {item.members.length} thành viên · {onlineCount} đang online
          </Text>
          {Boolean(item.lastMessagePreview) && (
            <Text numberOfLines={1} style={styles.lastPreview}>
              {item.lastMessagePreview}
            </Text>
          )}
        </View>
        <TouchableOpacity
          hitSlop={8}
          style={styles.infoIconBtn}
          onPress={() =>
            navigation.navigate('GroupInfo', { conversationId: item.id })
          }
        >
          <Ionicons
            name="settings-outline"
            size={19}
            color={ZaloColors.primary}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[ZaloColors.gradientStart, ZaloColors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.topBar, { paddingTop: insets.top + 10 }]}
      >
        <View>
          <Text style={styles.headerTitle}>Nhóm của bạn ({groups.length})</Text>
          <Text style={styles.headerSub}>
            Quản lý nhóm, phân quyền Admin & trò chuyện nhóm
          </Text>
        </View>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => setCreateGroupOpen(true)}
        >
          <Ionicons name="add" size={18} color={ZaloColors.primary} />
          <Text style={styles.createBtnText}>Tạo nhóm</Text>
        </TouchableOpacity>
      </LinearGradient>

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroup}
        contentContainerStyle={
          groups.length === 0 ? styles.emptyWrap : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={isLoadingConversations}
            onRefresh={() => void refreshConversations()}
            tintColor={ZaloColors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons
              name="people-circle-outline"
              size={54}
              color={ZaloColors.textMuted}
            />
            <Text style={styles.emptyTitle}>Chưa tham gia nhóm nào</Text>
            <Text style={styles.emptyDesc}>
              Tạo nhóm để thảo luận đồ án, chia sẻ hình ảnh, video và tài liệu
              cùng lúc với nhiều thành viên.
            </Text>
            <TouchableOpacity
              style={styles.emptyPrimaryBtn}
              onPress={() => setCreateGroupOpen(true)}
            >
              <Text style={styles.emptyPrimaryBtnText}>Tạo nhóm ngay</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <CreateChatModal
        visible={createGroupOpen}
        initialMode="group"
        currentUserId={currentUserId}
        onClose={() => setCreateGroupOpen(false)}
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
    backgroundColor: ZaloColors.listBackground,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  createBtnText: {
    color: ZaloColors.primary,
    fontWeight: '700',
    fontSize: 12.5,
  },
  listContent: {
    padding: 14,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 13,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E6ECF3',
  },
  groupBody: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  groupTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
  },
  rolePill: {
    backgroundColor: ZaloColors.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  rolePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: ZaloColors.primary,
  },
  groupStats: {
    fontSize: 12,
    color: ZaloColors.textSecondary,
    marginTop: 3,
  },
  lastPreview: {
    fontSize: 12.5,
    color: ZaloColors.textMuted,
    marginTop: 2,
  },
  infoIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ZaloColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flexGrow: 1,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 13,
    color: ZaloColors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  emptyPrimaryBtn: {
    marginTop: 16,
    backgroundColor: ZaloColors.primary,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
});
