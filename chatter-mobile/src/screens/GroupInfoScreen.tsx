import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AvatarBadge } from '../components/AvatarBadge';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { graphqlRequest } from '../services/graphql';
import { ZaloColors } from '../theme/zaloTheme';
import { DirectoryUser } from '../types/chat';
import { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'GroupInfo'>;

const roleLabel = (role: string): string => {
  if (role === 'OWNER') return 'Chủ nhóm';
  if (role === 'ADMIN') return 'Quản trị viên';
  return 'Thành viên';
};

export const GroupInfoScreen: React.FC<Props> = ({ route, navigation }) => {
  const { conversationId } = route.params;
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { conversations, onlineUserIds, refreshConversations } = useRealtime();

  const currentUserId = currentUser?.id ?? '';
  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId],
  );

  const myMember = conversation?.members.find(
    (m) => m.userId === currentUserId,
  );
  const isOwner = myMember?.role === 'OWNER';
  const isManager = isOwner || myMember?.role === 'ADMIN';

  const [titleDraft, setTitleDraft] = useState(conversation?.title ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DirectoryUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (conversation?.title) {
      setTitleDraft(conversation.title);
    }
  }, [conversation?.title]);

  useEffect(() => {
    if (!isManager || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      graphqlRequest<{ searchUsers: DirectoryUser[] }>(
        'query SearchUsers($query: String) { searchUsers(query: $query, limit: 8) { id displayName email avatarUrl } }',
        { query: searchQuery.trim() },
      )
        .then((res) => {
          const existingIds = new Set(
            conversation?.members.map((m) => m.userId) ?? [],
          );
          setSearchResults(
            (res.searchUsers ?? []).filter((u) => !existingIds.has(u.id)),
          );
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, isManager, conversation?.members]);

  const handleRenameGroup = async () => {
    if (!titleDraft.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      await graphqlRequest(
        'mutation RenameGroup($conversationId: String!, $title: String!) { updateGroupTitle(conversationId: $conversationId, title: $title) { id title } }',
        { conversationId, title: titleDraft.trim() },
      );
      await refreshConversations(true);
      setFeedback({ type: 'ok', text: 'Đã cập nhật tên nhóm.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không thể đổi tên nhóm.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await graphqlRequest(
        'mutation AddMember($conversationId: String!, $userId: String!) { addGroupMember(conversationId: $conversationId, userId: $userId) { userId } }',
        { conversationId, userId },
      );
      setSearchQuery('');
      setSearchResults([]);
      await refreshConversations(true);
      setFeedback({ type: 'ok', text: 'Đã thêm thành viên vào nhóm.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không thể thêm thành viên.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAdmin = async (userId: string, makeAdmin: boolean) => {
    setBusy(true);
    setFeedback(null);
    try {
      await graphqlRequest(
        'mutation SetAdmin($conversationId: String!, $userId: String!, $isAdmin: Boolean!) { setGroupAdmin(conversationId: $conversationId, userId: $userId, isAdmin: $isAdmin) { userId role } }',
        { conversationId, userId, isAdmin: makeAdmin },
      );
      await refreshConversations(true);
      setFeedback({ type: 'ok', text: 'Đã cập nhật quyền quản trị viên.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Cập nhật quyền thất bại.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await graphqlRequest(
        'mutation RemoveMember($conversationId: String!, $userId: String!) { removeGroupMember(conversationId: $conversationId, userId: $userId) { userId } }',
        { conversationId, userId },
      );
      await refreshConversations(true);
      setFeedback({ type: 'ok', text: 'Đã xóa thành viên khỏi nhóm.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không thể xóa thành viên.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert('Rời nhóm', 'Bạn có chắc chắn muốn rời khỏi nhóm này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Rời nhóm',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await graphqlRequest(
              'mutation LeaveGroup($conversationId: String!) { leaveGroup(conversationId: $conversationId) { userId } }',
              { conversationId },
            );
            await refreshConversations(true);
            navigation.popToTop();
          } catch (err) {
            setFeedback({
              type: 'err',
              text: err instanceof Error ? err.message : 'Không thể rời nhóm.',
            });
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (!conversation) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ZaloColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[ZaloColors.gradientStart, ZaloColors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thông tin nhóm</Text>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {feedback && (
          <View
            style={[
              styles.feedbackBox,
              feedback.type === 'ok' ? styles.feedbackOk : styles.feedbackErr,
            ]}
          >
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: '700',
                color:
                  feedback.type === 'ok'
                    ? ZaloColors.success
                    : ZaloColors.danger,
              }}
            >
              {feedback.text}
            </Text>
          </View>
        )}

        {/* Group Summary & Rename */}
        <View style={styles.card}>
          <View style={styles.groupHero}>
            <AvatarBadge
              name={conversation.title || 'Nhóm'}
              size={64}
              isGroup
            />
            <Text style={styles.groupName}>
              {conversation.title || 'Nhóm chưa đặt tên'}
            </Text>
            <Text style={styles.groupCount}>
              {conversation.members.length} thành viên
            </Text>
          </View>

          {isManager && (
            <View style={styles.renameRow}>
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                placeholder="Tên nhóm..."
                style={styles.input}
              />
              <TouchableOpacity
                disabled={busy}
                style={styles.saveSmallBtn}
                onPress={() => void handleRenameGroup()}
              >
                <Text style={styles.saveSmallBtnText}>Lưu tên</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Add Member */}
        {isManager && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Thêm thành viên mới</Text>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Tìm theo tên hoặc email..."
              autoCapitalize="none"
              style={styles.input}
            />
            {searchResults.map((u) => (
              <View key={u.id} style={styles.memberRow}>
                <AvatarBadge
                  name={u.displayName}
                  avatarUrl={u.avatarUrl}
                  size={38}
                />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{u.displayName}</Text>
                  <Text style={styles.memberRole}>{u.email}</Text>
                </View>
                <TouchableOpacity
                  disabled={busy}
                  style={styles.addSmallBtn}
                  onPress={() => void handleAddMember(u.id)}
                >
                  <Text style={styles.addSmallBtnText}>+ Thêm</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Members List */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Danh sách thành viên ({conversation.members.length})
          </Text>
          {conversation.members.map((member) => {
            const online = onlineUserIds.has(member.userId);
            const isSelf = member.userId === currentUserId;
            const canRemove =
              !isSelf &&
              ((isOwner && member.role !== 'OWNER') ||
                (isManager && member.role === 'MEMBER'));

            return (
              <View key={member.userId} style={styles.memberRow}>
                <AvatarBadge
                  name={member.displayName}
                  avatarUrl={member.avatarUrl}
                  size={40}
                  isOnline={online}
                />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.displayName} {isSelf ? '(Bạn)' : ''}
                  </Text>
                  <Text style={styles.memberRole}>
                    {roleLabel(member.role)}
                  </Text>
                </View>

                <View style={styles.memberActions}>
                  {isOwner && !isSelf && member.role !== 'OWNER' && (
                    <TouchableOpacity
                      disabled={busy}
                      style={styles.roleActionBtn}
                      onPress={() =>
                        void handleToggleAdmin(
                          member.userId,
                          member.role !== 'ADMIN',
                        )
                      }
                    >
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={16}
                        color={ZaloColors.primary}
                      />
                    </TouchableOpacity>
                  )}

                  {canRemove && (
                    <TouchableOpacity
                      disabled={busy}
                      style={styles.removeActionBtn}
                      onPress={() => void handleRemoveMember(member.userId)}
                    >
                      <Ionicons
                        name="person-remove-outline"
                        size={16}
                        color={ZaloColors.danger}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {!isOwner && (
          <TouchableOpacity
            disabled={busy}
            style={styles.leaveBtn}
            onPress={handleLeaveGroup}
          >
            <Ionicons
              name="exit-outline"
              size={19}
              color={ZaloColors.danger}
            />
            <Text style={styles.leaveBtnText}>Rời khỏi nhóm</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ZaloColors.listBackground,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 32,
  },
  feedbackBox: {
    padding: 11,
    borderRadius: 12,
    marginBottom: 12,
  },
  feedbackOk: {
    backgroundColor: ZaloColors.successSoft,
  },
  feedbackErr: {
    backgroundColor: ZaloColors.dangerSoft,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6ECF3',
  },
  groupHero: {
    alignItems: 'center',
    marginBottom: 12,
  },
  groupName: {
    fontSize: 17.5,
    fontWeight: '800',
    color: ZaloColors.textPrimary,
    marginTop: 10,
    textAlign: 'center',
  },
  groupCount: {
    fontSize: 12.5,
    color: ZaloColors.textSecondary,
    marginTop: 3,
  },
  renameRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: ZaloColors.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    backgroundColor: '#F8FAFC',
    color: ZaloColors.textPrimary,
  },
  saveSmallBtn: {
    backgroundColor: ZaloColors.primary,
    paddingHorizontal: 14,
    borderRadius: 11,
    justifyContent: 'center',
  },
  saveSmallBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
    marginBottom: 10,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: ZaloColors.divider,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
  },
  memberRole: {
    fontSize: 12,
    color: ZaloColors.textSecondary,
    marginTop: 1,
  },
  addSmallBtn: {
    backgroundColor: ZaloColors.primarySoft,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addSmallBtnText: {
    color: ZaloColors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  memberActions: {
    flexDirection: 'row',
    gap: 6,
  },
  roleActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: ZaloColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: ZaloColors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  leaveBtnText: {
    color: ZaloColors.danger,
    fontWeight: '700',
    fontSize: 14.5,
  },
});
