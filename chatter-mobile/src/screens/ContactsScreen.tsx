import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
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
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { graphqlRequest } from '../services/graphql';
import { ZaloColors } from '../theme/zaloTheme';
import { DirectoryUser } from '../types/chat';
import { AppStackParamList } from '../types/navigation';

export const ContactsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { currentUser } = useAuth();
  const { onlineUserIds, refreshConversations } = useRealtime();

  const [contacts, setContacts] = useState<DirectoryUser[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadData = useCallback(
    async (searchText: string) => {
      setIsLoading(true);
      try {
        const [contactsRes, searchRes] = await Promise.all([
          graphqlRequest<{ myContacts: DirectoryUser[] }>(
            `query MyContacts {
              myContacts {
                id
                displayName
                email
                avatarUrl
                lastSeenAt
                isContact
              }
            }`,
          ),
          graphqlRequest<{ searchUsers: DirectoryUser[] }>(
            `query SearchUsers($query: String) {
              searchUsers(query: $query, limit: 30) {
                id
                displayName
                email
                avatarUrl
                lastSeenAt
                isContact
              }
            }`,
            { query: searchText || undefined },
          ),
        ]);
        setContacts(contactsRes.myContacts ?? []);
        setDirectory(
          (searchRes.searchUsers ?? []).filter(
            (u) => u.id !== currentUser?.id,
          ),
        );
        setError('');
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Không thể tải danh bạ người dùng.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [currentUser?.id],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query, loadData]);

  const handleToggleContact = async (user: DirectoryUser) => {
    setBusyUserId(user.id);
    setError('');
    try {
      if (user.isContact) {
        await graphqlRequest(
          'mutation RemoveContact($userId: String!) { removeContact(userId: $userId) }',
          { userId: user.id },
        );
      } else {
        await graphqlRequest(
          'mutation AddContact($userId: String!) { addContact(userId: $userId) { id } }',
          { userId: user.id },
        );
      }
      await loadData(query.trim());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể cập nhật danh bạ.',
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const handleOpenChat = async (user: DirectoryUser) => {
    setBusyUserId(user.id);
    setError('');
    try {
      const res = await graphqlRequest<{
        openDirectConversation: { id: string };
      }>(
        'mutation OpenDirect($userId: String!) { openDirectConversation(userId: $userId) { id } }',
        { userId: user.id },
      );
      void refreshConversations(true);
      navigation.navigate('Chat', {
        conversationId: res.openDirectConversation.id,
        initialTitle: user.displayName,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể mở trò chuyện.',
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const renderUserItem = (user: DirectoryUser) => {
    const isOnline = onlineUserIds.has(user.id);
    const isBusy = busyUserId === user.id;

    return (
      <View key={user.id} style={styles.userCard}>
        <AvatarBadge
          name={user.displayName}
          avatarUrl={user.avatarUrl}
          size={46}
          isOnline={isOnline}
        />
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.userName}>
              {user.displayName}
            </Text>
            {isOnline && (
              <View style={styles.onlineChip}>
                <Text style={styles.onlineChipText}>Online</Text>
              </View>
            )}
          </View>
          <Text numberOfLines={1} style={styles.userEmail}>
            {user.email}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            disabled={isBusy}
            style={[
              styles.contactBtn,
              user.isContact && styles.contactBtnSaved,
            ]}
            onPress={() => void handleToggleContact(user)}
          >
            <Ionicons
              name={
                user.isContact ? 'person-remove-outline' : 'person-add-outline'
              }
              size={16}
              color={
                user.isContact ? ZaloColors.textSecondary : ZaloColors.primary
              }
            />
          </TouchableOpacity>

          <TouchableOpacity
            disabled={isBusy}
            style={styles.chatBtn}
            onPress={() => void handleOpenChat(user)}
          >
            <Ionicons name="chatbubble-outline" size={16} color="#FFFFFF" />
            <Text style={styles.chatBtnText}>Nhắn tin</Text>
          </TouchableOpacity>
        </View>
      </View>
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
        <Text style={styles.headerTitle}>Danh bạ & Tìm bạn</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={17} color="rgba(255,255,255,0.9)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm theo tên hoặc email..."
            placeholderTextColor="rgba(255,255,255,0.78)"
            autoCapitalize="none"
            style={styles.searchInput}
          />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => void loadData(query.trim())}
            tintColor={ZaloColors.primary}
          />
        }
      >
        {error !== '' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.sectionHeader}>
          Bạn bè đã lưu ({contacts.length})
        </Text>
        {contacts.length === 0 ? (
          <Text style={styles.emptyHint}>
            Chưa có liên hệ nào trong danh bạ của bạn.
          </Text>
        ) : (
          contacts.map(renderUserItem)
        )}

        <Text style={[styles.sectionHeader, { marginTop: 18 }]}>
          Danh mục người dùng hệ thống ({directory.length})
        </Text>
        {isLoading && directory.length === 0 ? (
          <ActivityIndicator
            style={{ marginTop: 20 }}
            color={ZaloColors.primary}
          />
        ) : directory.length === 0 ? (
          <Text style={styles.emptyHint}>Không tìm thấy tài khoản nào.</Text>
        ) : (
          directory.map(renderUserItem)
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
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 28,
  },
  errorBox: {
    backgroundColor: ZaloColors.dangerSoft,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    color: ZaloColors.danger,
    fontSize: 12.5,
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: ZaloColors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: ZaloColors.textMuted,
    paddingVertical: 10,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E6ECF3',
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    flexShrink: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
  },
  onlineChip: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  onlineChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  userEmail: {
    fontSize: 12,
    color: ZaloColors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  contactBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: ZaloColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactBtnSaved: {
    backgroundColor: '#F1F5F9',
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ZaloColors.primary,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
  },
  chatBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
