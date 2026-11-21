import React, { useCallback, useEffect, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AvatarBadge } from '../components/AvatarBadge';
import { ServerConfigModal } from '../components/ServerConfigModal';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { graphqlRequest } from '../services/graphql';
import { formatFileSize, uploadAvatarFile } from '../services/uploads';
import { ZaloColors } from '../theme/zaloTheme';
import { CurrentUserProfile, MyActivitySummary } from '../types/chat';

const MY_SUMMARY_QUERY = `
  query MyActivitySummary {
    myActivitySummary(days: 7) {
      days
      messagesSent
      reactionsAdded
      filesUploaded
      totalUploadedBytes
      groupsJoined
      directChatsCount
    }
  }
`;

export const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    setCurrentUser,
    logout,
    apiBaseUrl,
    updateServerUrl,
  } = useAuth();
  const { isSocketConnected } = useRealtime();

  const [displayName, setDisplayName] = useState(
    currentUser?.displayName ?? '',
  );
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [summary, setSummary] = useState<MyActivitySummary | null>(null);
  const [serverModalOpen, setServerModalOpen] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.displayName);
      setAvatarUrl(currentUser.avatarUrl ?? '');
    }
  }, [currentUser]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await graphqlRequest<{
        myActivitySummary: MyActivitySummary;
      }>(MY_SUMMARY_QUERY);
      setSummary(res.myActivitySummary);
    } catch {
      // Optional summary card
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handlePickAvatar = async () => {
    setFeedback(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Cần quyền truy cập',
        'Vui lòng cấp quyền Thư viện ảnh để đổi ảnh đại diện.',
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    setUploadingAvatar(true);
    try {
      const uploaded = await uploadAvatarFile({
        uri: asset.uri,
        name: asset.fileName,
        mimeType: asset.mimeType,
        size: asset.fileSize,
        webFile: (asset as { file?: File }).file,
      });
      setAvatarUrl(uploaded.url);
      const updated = await graphqlRequest<{
        updateMyProfile: CurrentUserProfile;
      }>(
        `mutation UpdateProfile($input: UpdateProfileInput!) {
          updateMyProfile(input: $input) {
            id email displayName avatarUrl status role lastSeenAt
          }
        }`,
        {
          input: {
            displayName: displayName.trim() || currentUser?.displayName || '',
            avatarUrl: uploaded.url,
          },
        },
      );
      setCurrentUser(updated.updateMyProfile);
      setFeedback({ type: 'ok', text: 'Đã cập nhật ảnh đại diện mới.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error ? err.message : 'Tải ảnh đại diện thất bại.',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      setFeedback({ type: 'err', text: 'Tên hiển thị không được để trống.' });
      return;
    }
    setSavingProfile(true);
    setFeedback(null);
    try {
      const res = await graphqlRequest<{ updateMyProfile: CurrentUserProfile }>(
        `mutation UpdateProfile($input: UpdateProfileInput!) {
          updateMyProfile(input: $input) {
            id email displayName avatarUrl status role lastSeenAt
          }
        }`,
        {
          input: {
            displayName: displayName.trim(),
            avatarUrl: avatarUrl.trim(),
          },
        },
      );
      setCurrentUser(res.updateMyProfile);
      setFeedback({ type: 'ok', text: 'Đã lưu thông tin cá nhân.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Cập nhật thất bại.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || newPassword.length < 8) {
      setFeedback({
        type: 'err',
        text: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới từ 8 ký tự.',
      });
      return;
    }
    setSavingPassword(true);
    setFeedback(null);
    try {
      await graphqlRequest(
        `mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
          changeMyPassword(currentPassword: $currentPassword, newPassword: $newPassword)
        }`,
        { currentPassword, newPassword },
      );
      setCurrentPassword('');
      setNewPassword('');
      setFeedback({ type: 'ok', text: 'Đổi mật khẩu thành công.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Đổi mật khẩu thất bại.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[ZaloColors.gradientStart, ZaloColors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.profileHero, { paddingTop: insets.top + 14 }]}
      >
        <View style={styles.heroRow}>
          <TouchableOpacity
            onPress={() => void handlePickAvatar()}
            disabled={uploadingAvatar}
            style={styles.avatarWrap}
          >
            <AvatarBadge
              name={currentUser?.displayName || 'U'}
              avatarUrl={avatarUrl}
              size={68}
              isOnline={isSocketConnected}
            />
            <View style={styles.cameraBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.heroInfo}>
            <Text numberOfLines={1} style={styles.heroName}>
              {currentUser?.displayName}
            </Text>
            <Text numberOfLines={1} style={styles.heroEmail}>
              {currentUser?.email}
            </Text>
            <View style={styles.badgeRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {currentUser?.role === 'ADMIN'
                    ? 'System Admin'
                    : 'Thành viên'}
                </Text>
              </View>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {isSocketConnected ? 'Socket.IO Live' : 'Đang kết nối lại'}
                </Text>
              </View>
            </View>
          </View>
        </View>
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
              style={[
                styles.feedbackText,
                {
                  color:
                    feedback.type === 'ok'
                      ? ZaloColors.success
                      : ZaloColors.danger,
                },
              ]}
            >
              {feedback.text}
            </Text>
          </View>
        )}

        {/* 7-Day Activity Summary */}
        {summary && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hoạt động 7 ngày gần nhất</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{summary.messagesSent}</Text>
                <Text style={styles.statLabel}>Tin nhắn</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{summary.reactionsAdded}</Text>
                <Text style={styles.statLabel}>Biểu cảm</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{summary.filesUploaded}</Text>
                <Text style={styles.statLabel}>Tệp tải lên</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>
                  {formatFileSize(summary.totalUploadedBytes)}
                </Text>
                <Text style={styles.statLabel}>Dung lượng</Text>
              </View>
            </View>
          </View>
        )}

        {/* Profile Edit */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hồ sơ cá nhân</Text>
          <Text style={styles.label}>Tên hiển thị</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            style={styles.input}
            placeholder="Nhập tên hiển thị"
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            disabled={savingProfile}
            onPress={() => void handleSaveProfile()}
          >
            {savingProfile ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Lưu hồ sơ</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Change Password */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Đổi mật khẩu</Text>
          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholder="Mật khẩu hiện tại"
            style={[styles.input, { marginBottom: 10 }]}
          />
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
            style={styles.input}
          />
          <TouchableOpacity
            style={styles.outlineBtn}
            disabled={savingPassword}
            onPress={() => void handleChangePassword()}
          >
            <Text style={styles.outlineBtnText}>Cập nhật mật khẩu</Text>
          </TouchableOpacity>
        </View>

        {/* Server Endpoint & Logout */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.serverRow}
            onPress={() => setServerModalOpen(true)}
          >
            <View style={styles.serverRowLeft}>
              <Ionicons
                name="server-outline"
                size={20}
                color={ZaloColors.primary}
              />
              <View>
                <Text style={styles.serverRowTitle}>Máy chủ kết nối</Text>
                <Text style={styles.serverRowSub}>{apiBaseUrl}</Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={ZaloColors.textMuted}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => void logout()}
          >
            <Ionicons
              name="log-out-outline"
              size={19}
              color={ZaloColors.danger}
            />
            <Text style={styles.logoutText}>Đăng xuất khỏi thiết bị</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ServerConfigModal
        visible={serverModalOpen}
        onClose={() => setServerModalOpen(false)}
        currentUrl={apiBaseUrl}
        onSaveUrl={updateServerUrl}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ZaloColors.listBackground,
  },
  profileHero: {
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrap: {
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ZaloColors.primaryDark,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
  },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
  feedbackText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6ECF3',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCell: {
    width: '48%',
    backgroundColor: ZaloColors.primarySoft,
    borderRadius: 12,
    padding: 11,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: ZaloColors.primaryDark,
  },
  statLabel: {
    fontSize: 11.5,
    color: ZaloColors.textSecondary,
    marginTop: 2,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: ZaloColors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: ZaloColors.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: ZaloColors.textPrimary,
    backgroundColor: '#F8FAFC',
  },
  primaryBtn: {
    backgroundColor: ZaloColors.primary,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: ZaloColors.primary,
    backgroundColor: ZaloColors.primarySoft,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  outlineBtnText: {
    color: ZaloColors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: ZaloColors.divider,
  },
  serverRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  serverRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
  },
  serverRowSub: {
    fontSize: 12,
    color: ZaloColors.textSecondary,
    marginTop: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 14,
  },
  logoutText: {
    color: ZaloColors.danger,
    fontWeight: '700',
    fontSize: 14.5,
  },
});
