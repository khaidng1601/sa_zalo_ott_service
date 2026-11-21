import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { resolveMediaUrl } from '../services/config';
import { formatFileSize } from '../services/uploads';
import { ZaloColors } from '../theme/zaloTheme';

interface VideoAttachmentPlayerProps {
  url: string;
  originalName: string;
  sizeBytes: number;
}

const NativeVideoBox: React.FC<{ uri: string }> = ({ uri }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.video}
      nativeControls
      contentFit="contain"
    />
  );
};

export const VideoAttachmentPlayer: React.FC<VideoAttachmentPlayerProps> = ({
  url,
  originalName,
  sizeBytes,
}) => {
  const resolvedUri = resolveMediaUrl(url) ?? '';

  const handleOpenExternal = async () => {
    if (!resolvedUri) return;
    try {
      await WebBrowser.openBrowserAsync(resolvedUri);
    } catch {
      // Ignore browser dismiss
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.videoBox}>
        {Platform.OS === 'web' ? (
          React.createElement('video', {
            src: resolvedUri,
            controls: true,
            playsInline: true,
            preload: 'metadata',
            style: {
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#0F172A',
            },
          })
        ) : (
          <NativeVideoBox uri={resolvedUri} />
        )}
      </View>
      <View style={styles.metaRow}>
        <View style={styles.metaInfo}>
          <Ionicons
            name="videocam-outline"
            size={14}
            color={ZaloColors.textSecondary}
          />
          <Text numberOfLines={1} style={styles.fileName}>
            {originalName}
          </Text>
          <Text style={styles.fileSize}>· {formatFileSize(sizeBytes)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => void handleOpenExternal()}
          hitSlop={8}
          style={styles.openBtn}
        >
          <Ionicons
            name="open-outline"
            size={15}
            color={ZaloColors.primary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: 245,
    maxWidth: '100%',
  },
  videoBox: {
    width: '100%',
    height: 165,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
    gap: 6,
  },
  metaInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fileName: {
    flexShrink: 1,
    fontSize: 11.5,
    color: ZaloColors.textSecondary,
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 11,
    color: ZaloColors.textMuted,
  },
  openBtn: {
    padding: 2,
  },
});
