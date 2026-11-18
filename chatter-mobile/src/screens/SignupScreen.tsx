import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ServerConfigModal } from '../components/ServerConfigModal';
import { useAuth } from '../context/AuthContext';
import { ZaloColors } from '../theme/zaloTheme';
import { AuthStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

export const SignupScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { register, apiBaseUrl, updateServerUrl } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [serverModalOpen, setServerModalOpen] = useState(false);

  const handleSignup = async () => {
    if (!displayName.trim()) {
      setError('Vui lòng nhập tên hiển thị của bạn.');
      return;
    }
    if (!email.trim()) {
      setError('Vui lòng nhập địa chỉ email.');
      return;
    }
    if (password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await register({
        email,
        password,
        displayName,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Đăng ký tài khoản thất bại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[ZaloColors.gradientStart, ZaloColors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroBanner, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.heroTopRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.serverPill}
            onPress={() => setServerModalOpen(true)}
          >
            <Ionicons name="server-outline" size={14} color="#FFFFFF" />
            <Text numberOfLines={1} style={styles.serverPillText}>
              {apiBaseUrl.replace(/^https?:\/\//i, '')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.heroTitle}>Tạo tài khoản mới</Text>
        <Text style={styles.heroSubtitle}>
          Tham gia Chatter Zalo OTT để nhắn tin, chia sẻ ảnh, video và tài liệu
        </Text>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {error !== '' && (
              <View style={styles.errorAlert}>
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={ZaloColors.danger}
                />
                <Text style={styles.errorAlertText}>{error}</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Tên hiển thị</Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="person-outline"
                size={18}
                color={ZaloColors.textMuted}
              />
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Nguyễn Văn A"
                style={styles.input}
              />
            </View>

            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={ZaloColors.textMuted}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="name@chatter.vn"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.input}
              />
            </View>

            <Text style={styles.fieldLabel}>Mật khẩu (tối thiểu 8 ký tự)</Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={ZaloColors.textMuted}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Nhập mật khẩu"
                secureTextEntry
                autoCapitalize="none"
                style={styles.input}
              />
            </View>

            <Text style={styles.fieldLabel}>Xác nhận mật khẩu</Text>
            <View style={styles.inputBox}>
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color={ZaloColors.textMuted}
              />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Nhập lại mật khẩu"
                secureTextEntry
                autoCapitalize="none"
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.disabledBtn]}
              disabled={submitting}
              onPress={() => void handleSignup()}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Đăng ký tài khoản</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.switchLinkText}>
                Đã có tài khoản?{' '}
                <Text style={styles.switchLinkHighlight}>Đăng nhập</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
  flex: {
    flex: 1,
  },
  heroBanner: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '72%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
  },
  serverPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E6ECF3',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ZaloColors.dangerSoft,
    padding: 11,
    borderRadius: 11,
    marginBottom: 14,
  },
  errorAlertText: {
    flex: 1,
    color: ZaloColors.danger,
    fontSize: 12.5,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: ZaloColors.textSecondary,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: ZaloColors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#F8FAFC',
    marginBottom: 13,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    color: ZaloColors.textPrimary,
    paddingVertical: 0,
  },
  submitBtn: {
    backgroundColor: ZaloColors.primary,
    borderRadius: 12,
    paddingVertical: 13.5,
    alignItems: 'center',
    marginTop: 4,
  },
  disabledBtn: {
    opacity: 0.65,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  switchLink: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  switchLinkText: {
    fontSize: 13.5,
    color: ZaloColors.textSecondary,
  },
  switchLinkHighlight: {
    color: ZaloColors.primary,
    fontWeight: '700',
  },
});
