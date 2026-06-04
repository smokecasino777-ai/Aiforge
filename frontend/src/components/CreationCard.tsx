import React from 'react';
import { View, Text, StyleSheet, Image, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageIcon, Video, Box, MessageSquare, Play } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Creation } from '@/src/api/client';
import { colors, radius, TYPE_META } from '@/src/theme/colors';
import PressableScale from './PressableScale';

type Props = { creation: Creation; size?: 'sm' | 'md' | 'lg'; style?: ViewStyle };

export default function CreationCard({ creation, size = 'md', style }: Props) {
  const router = useRouter();
  const meta = TYPE_META[creation.type];
  const dims =
    size === 'sm'
      ? { w: 130, h: 160 }
      : size === 'lg'
        ? { w: 220, h: 260 }
        : { w: 170, h: 210 };

  const Icon =
    creation.type === 'image'
      ? ImageIcon
      : creation.type === 'video'
        ? Video
        : creation.type === 'model3d'
          ? Box
          : MessageSquare;

  const isImage = creation.type === 'image' || creation.type === 'model3d';
  const hasMedia = !!creation.media_data;
  const isScad = creation.media_mime === 'application/x-openscad';
  // For SCAD entries we show the preview_image (PNG) instead of the base64 code
  const uri = isScad && creation.preview_image
    ? `data:image/png;base64,${creation.preview_image}`
    : hasMedia && isImage
      ? `data:${creation.media_mime};base64,${creation.media_data}`
      : null;

  return (
    <PressableScale
      style={[{ width: dims.w }, style]}
      onPress={() => router.push(`/creation/${creation.id}` as any)}
      testID={`creation-card-${creation.id}`}
    >
      <View style={[styles.card, { height: dims.h, borderColor: meta.color + '33' }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.media} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[meta.color + '40', meta.color + '10', '#0000']}
            style={styles.media}
          >
            <View style={styles.iconCenter}>
              {creation.status === 'processing' ? (
                <Text style={styles.statusText}>Forging…</Text>
              ) : creation.status === 'failed' ? (
                <Text style={[styles.statusText, { color: colors.red }]}>Failed</Text>
              ) : (
                <Icon size={42} color={meta.color} strokeWidth={1.5} />
              )}
            </View>
          </LinearGradient>
        )}
        {/* play overlay for video */}
        {creation.type === 'video' && hasMedia ? (
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Play size={20} color="#000" fill="#000" />
            </View>
          </View>
        ) : null}
        <View style={styles.overlay}>
          <View style={[styles.tag, { backgroundColor: meta.tagBg, borderColor: meta.color + '66' }]}>
            <Text style={[styles.tagText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.title} numberOfLines={1}>
            {creation.title || 'Untitled'}
          </Text>
          <Text style={styles.desc} numberOfLines={1}>
            {creation.prompt}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  media: { width: '100%', flex: 1 },
  iconCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  overlay: { position: 'absolute', top: 10, left: 10 },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  footer: {
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  title: { color: colors.text, fontSize: 13, fontWeight: '700' },
  desc: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.cyan,
    shadowOpacity: 0.9,
    shadowRadius: 14,
  },
});
