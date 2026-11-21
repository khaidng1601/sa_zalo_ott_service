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
import {
  detectExpoHostIp,
  getDefaultApiBaseUrl,
  normalizeBaseUrl,
  ServerPingResult,
  testServerConnection,
} from '../services/config';
import { getCustomApiUrl } from '../services/storage';
import { ZaloColors } from '../theme/zaloTheme';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
  currentUrl: string;
  onSaveUrl: (customUrl: string | null) => Promise<void>;
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  visible,
  onClose,
  currentUrl,
  onSaveUrl,
}) => {
  const [draftUrl, setDraftUrl] = useState(currentUrl);
  const [pinging, setPinging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pingResult, setPingResult] = useState<ServerPingResult | null>(null);

  const lanIp = detectExpoHostIp();
  const defaultUrl = getDefaultApiBaseUrl();

  const presets = [
    ...(lanIp
      ? [
          {
            label: `LAN Docker Nginx (${lanIp}:3000)`,
            url: `http://${lanIp}:3000`,
          },
          {
            label: `LAN Backend trực tiếp (${lanIp}:4000)`,
            url: `http://${lanIp}:4000`,
          },
        ]
      : []),
    {
      label: 'Android Emulator (10.0.2.2:3000)',
      url: 'http://10.0.2.2:3000',
    },
    {
      label: 'iOS Simulator / Localhost (:3000)',
      url: 'http://localhost:3000',
    },
  ];

  useEffect(() => {
    if (visible) {
      setDraftUrl(getCustomApiUrl() || currentUrl);
      setPingResult(null);
    }
  }, [visible, currentUrl]);

  const handlePing = async () => {
    const candidate = normalizeBaseUrl(draftUrl);
    if (!candidate) return;
    setPinging(true);
    setPingResult(null);
    try {
      const res = await testServerConnection(candidate);
      setPingResult(res);
    } finally {
      setPinging(false);
    }
  };

  const handleSave = async () => {
    const normalized = normalizeBaseUrl(draftUrl);
    setSaving(true);
    try {
      if (!normalized || normalized === defaultUrl) {
        await onSaveUrl(null);
      } else {
        await onSaveUrl(normalized);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    setSaving(true);
    try {
      await onSaveUrl(null);
      setDraftUrl(defaultUrl);
      setPingResult(null);
      onClose();
    } finally {
      setSaving(false);
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
            <View style={styles.headerLeft}>
              <Ionicons
                name="server-outline"
                size={20}
                color={ZaloColors.primary}
              />
              <Text style={styles.title}>Cấu hình Máy chủ Backend</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={ZaloColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.helperText}>
              Nhập địa chỉ gốc của máy chủ (hỗ trợ cả cổng Nginx{' '}
              <Text style={styles.code}>:3000</Text>, cổng NestJS trực tiếp{' '}
              <Text style={styles.code}>:4000</Text> hoặc IP AWS EC2). Ứng dụng
              sẽ tự nối tới <Text style={styles.code}>/graphql</Text>,{' '}
              <Text style={styles.code}>/uploads</Text> và{' '}
              <Text style={styles.code}>/socket.io/</Text>.
            </Text>

            <Text style={styles.label}>URL Máy chủ</Text>
            <TextInput
              value={draftUrl}
              onChangeText={setDraftUrl}
              placeholder="http://192.168.1.100:3000"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
            />

            <Text style={styles.label}>Chọn nhanh cấu hình gợi ý:</Text>
            <View style={styles.presetWrap}>
              {presets.map((preset) => (
                <TouchableOpacity
                  key={preset.url}
                  style={[
                    styles.presetChip,
                    normalizeBaseUrl(draftUrl) === preset.url &&
                      styles.presetChipActive,
                  ]}
                  onPress={() => {
                    setDraftUrl(preset.url);
                    setPingResult(null);
                  }}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      normalizeBaseUrl(draftUrl) === preset.url &&
                        styles.presetChipTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {pingResult && (
              <View
                style={[
                  styles.pingBox,
                  pingResult.ok ? styles.pingOk : styles.pingErr,
                ]}
              >
                <Ionicons
                  name={pingResult.ok ? 'checkmark-circle' : 'alert-circle'}
                  size={18}
                  color={pingResult.ok ? ZaloColors.success : ZaloColors.danger}
                />
                <Text
                  style={[
                    styles.pingText,
                    {
                      color: pingResult.ok
                        ? ZaloColors.success
                        : ZaloColors.danger,
                    },
                  ]}
                >
                  {pingResult.message}
                </Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => void handlePing()}
                disabled={pinging || !draftUrl.trim()}
              >
                {pinging ? (
                  <ActivityIndicator size="small" color={ZaloColors.primary} />
                ) : (
                  <>
                    <Ionicons
                      name="pulse-outline"
                      size={17}
                      color={ZaloColors.primary}
                    />
                    <Text style={styles.secondaryBtnText}>Kiểm tra kết nối</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => void handleSave()}
                disabled={saving}
              >
                <Text style={styles.primaryBtnText}>Lưu cấu hình</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => void handleResetDefault()}
              disabled={saving}
            >
              <Text style={styles.resetBtnText}>
                Khôi phục mặc định tự động ({defaultUrl})
              </Text>
            </TouchableOpacity>
          </ScrollView>
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
    maxHeight: '85%',
    paddingBottom: 26,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: ZaloColors.divider,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: ZaloColors.textSecondary,
    marginBottom: 14,
  },
  code: {
    fontWeight: '700',
    color: ZaloColors.primaryDark,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: ZaloColors.textPrimary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: ZaloColors.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14.5,
    color: ZaloColors.textPrimary,
    backgroundColor: '#F8FAFC',
    marginBottom: 14,
  },
  presetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: ZaloColors.primarySoft,
    borderColor: ZaloColors.primary,
  },
  presetChipText: {
    fontSize: 12,
    color: ZaloColors.textSecondary,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: ZaloColors.primary,
  },
  pingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    borderRadius: 11,
    marginBottom: 14,
  },
  pingOk: {
    backgroundColor: ZaloColors.successSoft,
  },
  pingErr: {
    backgroundColor: ZaloColors.dangerSoft,
  },
  pingText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ZaloColors.primary,
    backgroundColor: ZaloColors.primarySoft,
  },
  secondaryBtnText: {
    color: ZaloColors.primary,
    fontWeight: '700',
    fontSize: 13.5,
  },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: ZaloColors.primary,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
  resetBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  resetBtnText: {
    fontSize: 12.5,
    color: ZaloColors.textMuted,
    fontWeight: '600',
  },
});
