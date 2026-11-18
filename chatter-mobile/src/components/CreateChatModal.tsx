import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { graphqlRequest } from '../services/graphql';
import { ZaloColors } from '../theme/zaloTheme';
import { DirectoryUser } from '../types/chat';
import { AvatarBadge } from './AvatarBadge';

interface CreateChatModalProps {
  visible: boolean;
  initialMode?: 'direct' | 'group';
  currentUserId: string;
  onClose: () => void;
  onCreated: (conversationId: string, title?: string) => void;
}

export const CreateChatModal: React.FC<CreateChatModalProps> = ({
  visible,
  initialMode = 'direct',
  currentUserId,
  onClose,
  onCreated,
}) => {
  const [mode, setMode] = useState<'direct' | 'group'>(initialMode);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<DirectoryUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setSearchQuery('');
      setGroupTitle('');
      setSelectedUsers([]);
      setError('');
    }
  }, [visible, initialMode]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setLoadingUsers(true);
      graphqlRequest<{ searchUsers: DirectoryUser[] }>(
        `query SearchUsers($query: String) {
          searchUsers(query: $query, limit: 25) {
            id
            displayName
            email
            avatarUrl
          }
        }`,
        { query: searchQuery.trim() || undefined },
      )
        .then((res) => {
          setDirectoryUsers(
            (res.searchUsers ?? []).filter((u) => u.id !== currentUserId),
          );
        })
        .catch(() => undefined)
        .finally(() => setLoadingUsers(false));
    }, 220);

    return () => clearTimeout(timer);
  }, [visible, searchQuery, currentUserId]);

  const handleOpenDirect = async (target: DirectoryUser) => {
    setSubmitting(true);
    setError('');
    try {
      const res = await graphqlRequest<{
        openDirectConversation: { id: string };
      }>(
        `mutation OpenDirect($userId: String!) {
          openDirectConversation(userId: $userId) { id }
        }`,
        { userId: target.id },
      );
      onCreated(res.openDirectConversation.id, target.displayName);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể mở cuộc trò chuyện.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGroupMember = (user: DirectoryUser) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      if (exists) {
        return prev.filter((u) => u.id !== user.id);
      }
      return [...prev, user];
    });
  };

  const handleCreateGroup = async () => {
    if (!groupTitle.trim()) {
      setError('Vui lòng nhập tên nhóm.');
      return;
    }
    if (selectedUsers.length === 0) {
      setError('Vui lòng chọn ít nhất 1 thành viên.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await graphqlRequest<{ createGroup: { id: string } }>(
        `mutation CreateGroup($input: CreateGroupInput!) {
          createGroup(input: $input) { id }
        }`,
        {
          input: {
            title: groupTitle.trim(),
            memberIds: selectedUsers.map((u) => u.id),
          },
        },
      );
      onCreated(res.createGroup.id, groupTitle.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo nhóm mới.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {mode === 'direct' ? 'Bắt đầu trò chuyện' : 'Tạo nhóm Zalo OTT'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={ZaloColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modeSwitchRow}>
            <TouchableOpacity
              style={[
                styles.modeTab,
                mode === 'direct' && styles.modeTabActive,
              ]}
              onPress={() => {
                setMode('direct');
                setError('');
              }}
            >
              <Ionicons
                name="person-outline"
                size={15}
                color={
                  mode === 'direct'
                    ? ZaloColors.primary
                    : ZaloColors.textSecondary
                }
              />
              <Text
                style={[
                  styles.modeTabText,
                  mode === 'direct' && styles.modeTabTextActive,
                ]}
              >
                Chat 1-1
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeTab,
                mode === 'group' && styles.modeTabActive,
              ]}
              onPress={() => {
                setMode('group');
                setError('');
              }}
            >
              <Ionicons
                name="people-outline"
                size={16}
                color={
                  mode === 'group'
                    ? ZaloColors.primary
                    : ZaloColors.textSecondary
                }
              />
              <Text
                style={[
                  styles.modeTabText,
                  mode === 'group' && styles.modeTabTextActive,
                ]}
              >
                Tạo nhóm
              </Text>
            </TouchableOpacity>
          </View>

          {error !== '' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {mode === 'group' && (
            <View style={styles.groupInputWrap}>
              <TextInput
                value={groupTitle}
                onChangeText={setGroupTitle}
                placeholder="Nhập tên nhóm (ví dụ: Nhóm Đồ Án KTPM)"
                style={styles.input}
              />
              {selectedUsers.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.selectedChipsScroll}
                >
                  {selectedUsers.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.selectedChip}
                      onPress={() => toggleGroupMember(u)}
                    >
                      <Text style={styles.selectedChipText}>
                        {u.displayName} ✕
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={17} color={ZaloColors.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Tìm theo tên hoặc email..."
              autoCapitalize="none"
              style={styles.searchInput}
            />
          </View>

          <ScrollView
            style={styles.userList}
            keyboardShouldPersistTaps="handled"
          >
            {loadingUsers ? (
              <ActivityIndicator
                style={{ marginVertical: 24 }}
                color={ZaloColors.primary}
              />
            ) : directoryUsers.length === 0 ? (
              <Text style={styles.emptyText}>
                Không tìm thấy người dùng phù hợp.
              </Text>
            ) : (
              directoryUsers.map((user) => {
                const isSelected = selectedUsers.some((u) => u.id === user.id);
                return (
                  <TouchableOpacity
                    key={user.id}
                    disabled={submitting}
                    style={styles.userRow}
                    onPress={() =>
                      mode === 'direct'
                        ? void handleOpenDirect(user)
                        : toggleGroupMember(user)
                    }
                  >
                    <AvatarBadge
                      name={user.displayName}
                      avatarUrl={user.avatarUrl}
                      size={42}
                    />
                    <View style={styles.userMeta}>
                      <Text style={styles.userName}>{user.displayName}</Text>
                      <Text style={styles.userEmail}>{user.email}</Text>
                    </View>
                    {mode === 'group' ? (
                      <Ionicons
                        name={
                          isSelected ? 'checkbox' : 'square-outline'
                        }
                        size={22}
                        color={
                          isSelected
                            ? ZaloColors.primary
                            : ZaloColors.textMuted
                        }
                      />
                    ) : (
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={20}
                        color={ZaloColors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {mode === 'group' && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  submitting && { opacity: 0.65 },
                ]}
                disabled={submitting}
                onPress={() => void handleCreateGroup()}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    Tạo nhóm ({selectedUsers.length} thành viên)
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: ZaloColors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '86%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: ZaloColors.divider,
  },
  title: {
    fontSize: 16.5,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
  },
  modeSwitchRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
  },
  modeTabActive: {
    backgroundColor: ZaloColors.primarySoft,
    borderWidth: 1,
    borderColor: ZaloColors.primary,
  },
  modeTabText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: ZaloColors.textSecondary,
  },
  modeTabTextActive: {
    color: ZaloColors.primary,
    fontWeight: '700',
  },
  errorBox: {
    marginHorizontal: 18,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: ZaloColors.dangerSoft,
  },
  errorText: {
    color: ZaloColors.danger,
    fontSize: 12.5,
    fontWeight: '600',
  },
  groupInputWrap: {
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: ZaloColors.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#F8FAFC',
    color: ZaloColors.textPrimary,
  },
  selectedChipsScroll: {
    marginTop: 8,
  },
  selectedChip: {
    backgroundColor: ZaloColors.primarySoft,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginRight: 6,
  },
  selectedChipText: {
    fontSize: 12,
    color: ZaloColors.primary,
    fontWeight: '700',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: ZaloColors.textPrimary,
    paddingVertical: 0,
  },
  userList: {
    marginTop: 8,
    maxHeight: 310,
    paddingHorizontal: 18,
  },
  emptyText: {
    textAlign: 'center',
    color: ZaloColors.textMuted,
    paddingVertical: 24,
    fontSize: 13.5,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ZaloColors.divider,
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
  },
  userEmail: {
    fontSize: 12,
    color: ZaloColors.textSecondary,
    marginTop: 1,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  submitBtn: {
    backgroundColor: ZaloColors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14.5,
  },
});
