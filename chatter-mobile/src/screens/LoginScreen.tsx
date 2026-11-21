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
import { DEMO_ACCOUNTS } from '../constants/demoAccounts';
import { useAuth } from '../context/AuthContext';
import { ZaloColors } from '../theme/zaloTheme';
import { AuthStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { login, apiBaseUrl, updateServerUrl } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [serverModalOpen, setServerModalOpen] = useState(false);

  const performLogin = async (targetEmail: string, targetPassword: string) => {
    if (!targetEmail.trim() || !targetPassword) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await login(targetEmail, targetPassword);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.',
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
        style={[styles.heroBanner, { paddingTop: insets.top + 20 }]}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.brandBadge}>
            <Ionicons name="chatbubbles" size={26} color={ZaloColors.primary} />
          </View>
          <TouchableOpacity
            style={styles.serverPill}
            onPress={() => setServerModalOpen(true)}
          >
            <Ionicons name="server-outline" size={14} color="#FFFFFF" />
            <Text numberOfLines={1} style={styles.serverPillText}>
              {apiBaseUrl.replace(/^https?:\/\//i, '')}
            </Text>
            <Ionicons name="settings-outline" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.brandTitle}>Chatter Zalo OTT</Text>
        <Text style={styles.brandSubtitle}>
          Nhắn tin đa phương tiện thời gian thực trên di động
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
            <Text style={styles.cardTitle}>Đăng nhập tài khoản</Text>

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

            <Text style={styles.fieldLabel}>Email đăng nhập</Text>
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

            <Text style={styles.fieldLabel}>Mật khẩu</Text>
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
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={styles.input}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color={ZaloColors.textMuted}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.disabledBtn]}
              disabled={submitting}
              onPress={() => void performLogin(email, password)}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Đăng nhập</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={() => navigation.navigate('Signup')}
            >
              <Text style={styles.switchLinkText}>
                Chưa có tài khoản?{' '}
                <Text style={styles.switchLinkHighlight}>Đăng ký ngay</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.demoDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.demoDividerLabel}>
                Đăng nhập nhanh tài khoản Demo (1 chạm)
              </Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.demoGrid}>
              {DEMO_ACCOUNTS.map((acc) => (
                <TouchableOpacity
                  key={acc.email}
                  disabled={submitting}
                  style={styles.demoChip}
                  onPress={() => {
                    setEmail(acc.email);
                    setPassword(acc.password);
                    void performLogin(acc.email, acc.password);
                  }}
                >
                  <Text numberOfLines={1} style={styles.demoName}>
                    {acc.label}
                  </Text>
                  <Text style={styles.demoRole}>{acc.roleBadge}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
    paddingHorizontal: 22,
    paddingBottom: 34,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
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
    flexShrink: 1,
  },
  brandTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  brandSubtitle: {
    fontSize: 13.5,
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
    marginBottom: 14,
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
    marginBottom: 14,
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
  demoDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: ZaloColors.divider,
  },
  demoDividerLabel: {
    fontSize: 11.5,
    color: ZaloColors.textMuted,
    fontWeight: '600',
  },
  demoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  demoChip: {
    width: '48%',
    backgroundColor: ZaloColors.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#D4E6FF',
  },
  demoName: {
    fontSize: 13,
    fontWeight: '700',
    color: ZaloColors.primaryDark,
  },
  demoRole: {
    fontSize: 11,
    color: ZaloColors.primary,
    marginTop: 2,
    fontWeight: '600',
  },
});
