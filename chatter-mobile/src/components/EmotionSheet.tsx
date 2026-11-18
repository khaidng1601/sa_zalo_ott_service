import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  QUICK_EMOJIS,
  ZALO_STICKERS,
  ZaloStickerItem,
} from '../constants/emotions';
import { ZaloColors } from '../theme/zaloTheme';

interface EmotionSheetProps {
  onSelectSticker: (sticker: ZaloStickerItem) => void;
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

export const EmotionSheet: React.FC<EmotionSheetProps> = ({
  onSelectSticker,
  onSelectEmoji,
  onClose,
}) => {
  const [tab, setTab] = useState<'stickers' | 'emojis'>('stickers');

  return (
    <View style={styles.container}>
      <View style={styles.tabHeader}>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'stickers' && styles.tabBtnActive]}
            onPress={() => setTab('stickers')}
          >
            <Text
              style={[
                styles.tabText,
                tab === 'stickers' && styles.tabTextActive,
              ]}
            >
              Sticker Zalo (12)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'emojis' && styles.tabBtnActive]}
            onPress={() => setTab('emojis')}
          >
            <Text
              style={[styles.tabText, tab === 'emojis' && styles.tabTextActive]}
            >
              Biểu cảm nhanh
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Ionicons name="chevron-down" size={20} color={ZaloColors.textMuted} />
        </TouchableOpacity>
      </View>

      {tab === 'stickers' ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.stickerGrid}
          showsVerticalScrollIndicator={false}
        >
          {ZALO_STICKERS.map((sticker) => (
            <TouchableOpacity
              key={sticker.code}
              style={styles.stickerCell}
              activeOpacity={0.78}
              onPress={() => onSelectSticker(sticker)}
            >
              <LinearGradient
                colors={[sticker.gradient[0], sticker.gradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.stickerCard}
              >
                <Text style={styles.stickerEmoji}>{sticker.emoji}</Text>
                <Text
                  numberOfLines={1}
                  style={[styles.stickerLabel, { color: sticker.accent }]}
                >
                  {sticker.label}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emojiGrid}>
          {QUICK_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={styles.emojiBtn}
              onPress={() => onSelectEmoji(emoji)}
            >
              <Text style={styles.emojiChar}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: ZaloColors.border,
    maxHeight: 255,
  },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: ZaloColors.divider,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: {
    backgroundColor: ZaloColors.primarySoft,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: ZaloColors.textSecondary,
  },
  tabTextActive: {
    color: ZaloColors.primary,
    fontWeight: '700',
  },
  scrollArea: {
    maxHeight: 205,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  stickerCell: {
    width: '33.33%',
    padding: 5,
  },
  stickerCard: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  stickerLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  emojiBtn: {
    width: '12.5%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  emojiChar: {
    fontSize: 25,
  },
});
