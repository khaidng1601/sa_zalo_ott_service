import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveMediaUrl } from '../services/config';
import { ZaloColors } from '../theme/zaloTheme';
import { getInitials } from '../types/chat';

const AVATAR_PALETTE = [
  '#0068FF',
  '#0EA5E9',
  '#6366F1',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#8B5CF6',
];

const pickColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

interface AvatarBadgeProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  isOnline?: boolean;
  isGroup?: boolean;
}

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  name,
  avatarUrl,
  size = 48,
  isOnline = false,
  isGroup = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedUri = !imgFailed ? resolveMediaUrl(avatarUrl) : undefined;
  const bgColor = isGroup ? '#1E88E5' : pickColor(name || 'U');
  const dotSize = Math.max(11, Math.round(size * 0.25));

  return (
    <View style={{ width: size, height: size }}>
      {resolvedUri ? (
        <Image
          source={{ uri: resolvedUri }}
          onError={() => setImgFailed(true)}
          style={[
            styles.image,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: bgColor,
            },
          ]}
        >
          {isGroup ? (
            <Ionicons
              name="people"
              size={Math.round(size * 0.48)}
              color="#FFFFFF"
            />
          ) : (
            <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }]}>
              {getInitials(name)}
            </Text>
          )}
        </View>
      )}

      {isOnline && (
        <View
          style={[
            styles.onlineDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#E2E8F0',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: ZaloColors.online,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
