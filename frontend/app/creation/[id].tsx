import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Download,
  Trash2,
  Clock,
  Share2,
  Copy,
  Sparkles,
  Scissors,
} from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius, TYPE_META } from '@/src/theme/colors';
import { api, Creation } from '@/src/api/client';

export default function CreationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [creation, setCreation] = useState<Creation | null>(null);
  const [loading, setLoading] = useState(true);
  const [trim, setTrim] = useState({ start: 0, end: 12 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const c = await api.getCreation(id);
      setCreation(c);
      if (c.duration) setTrim({ start: 0, end: c.duration });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while processing
  useEffect(() => {
    if (creation?.status === 'processing') {
      pollRef.current = setInterval(load, 5000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [creation?.status, load]);

  const onDelete = async () => {
    Alert.alert('Delete creation?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          try {
            await api.deleteCreation(id);
            router.back();
          } catch (e: any) {
            Alert.alert('Delete failed', e.message);
          }
        },
      },
    ]);
  };

  const onDownload = async () => {
    if (!creation?.media_data) return;
    if (Platform.OS === 'web') {
      try {
        const link = document.createElement('a');
        link.href = `data:${creation.media_mime};base64,${creation.media_data}`;
        const ext =
          creation.type === 'video'
            ? 'mp4'
            : creation.type === 'image' || creation.type === 'model3d'
              ? 'png'
              : creation.media_mime === 'application/x-openscad'
                ? 'scad'
                : 'txt';
        link.download = `${creation.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        Alert.alert('Download', 'Open the asset and use your browser to save.');
      }
    } else {
      Alert.alert('Saved', 'Open the asset via Share to save to your device.');
    }
  };

  const onCopy = async () => {
    if (!creation) return;
    if (creation.media_mime === 'application/x-openscad' || creation.type === 'chat') {
      const text = creation.media_data
        ? typeof atob === 'function'
          ? atob(creation.media_data)
          : Buffer.from(creation.media_data, 'base64').toString('utf-8')
        : '';
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        Alert.alert('Copied', 'Content copied to clipboard.');
      } else {
        Alert.alert('Content', text.slice(0, 1200));
      }
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <StarryBackground />
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  if (!creation) {
    return (
      <View style={[styles.root, styles.center]}>
        <StarryBackground />
        <Text style={{ color: colors.textDim }}>Creation not found.</Text>
      </View>
    );
  }

  const meta = TYPE_META[creation.type];
  const isImage = creation.type === 'image' || creation.type === 'model3d';
  const isVideo = creation.type === 'video';
  const isText = creation.type === 'chat' || creation.media_mime === 'application/x-openscad';
  const dataUri =
    creation.media_data && (isImage || isVideo)
      ? `data:${creation.media_mime};base64,${creation.media_data}`
      : null;

  const textContent = isText && creation.media_data
    ? (typeof atob === 'function'
        ? atob(creation.media_data)
        : Buffer.from(creation.media_data, 'base64').toString('utf-8'))
    : '';

  return (
    <View style={styles.root}>
      <StarryBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <PressableScale onPress={() => router.back()} testID="back-btn">
              <View style={styles.backBtn}>
                <ArrowLeft size={18} color={colors.text} />
                <Text style={styles.backText}>Back</Text>
              </View>
            </PressableScale>
            <View style={[styles.tag, { backgroundColor: meta.tagBg, borderColor: meta.color + '88' }]}>
              <Text style={[styles.tagText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>

          <View style={styles.mediaCard}>
            {creation.status === 'processing' ? (
              <View style={styles.processing}>
                <ActivityIndicator color={colors.cyan} size="large" />
                <Text style={styles.processingText}>
                  {isVideo ? 'Forging your video… (Sora can take a few minutes)' : 'Generating…'}
                </Text>
              </View>
            ) : creation.status === 'failed' ? (
              <View style={styles.failed}>
                <Text style={styles.failedText}>{creation.error || 'Generation failed.'}</Text>
              </View>
            ) : isImage && dataUri ? (
              <Image source={{ uri: dataUri }} style={styles.media} resizeMode="cover" />
            ) : isVideo && dataUri ? (
              <View style={styles.media}>
                <WebView
                  originWhitelist={['*']}
                  style={{ flex: 1, backgroundColor: '#000' }}
                  source={{
                    html: `
                      <html><body style="margin:0;padding:0;background:#000;">
                        <video src="${dataUri}" controls autoplay loop style="width:100%;height:100%;object-fit:cover;" playsinline></video>
                      </body></html>
                    `,
                  }}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                />
              </View>
            ) : isText ? (
              <ScrollView style={styles.codeWrap} contentContainerStyle={{ padding: 14 }}>
                <Text style={styles.codeText}>{textContent}</Text>
              </ScrollView>
            ) : null}
          </View>

          <Text style={styles.title}>{creation.title}</Text>
          <Text style={styles.prompt}>{creation.prompt}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Clock size={12} color={colors.textDim} />
              <Text style={styles.metaText}>
                {new Date(creation.created_at).toLocaleString()}
              </Text>
            </View>
            {creation.duration ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaText}>{creation.duration}s</Text>
              </View>
            ) : null}
          </View>

          {isVideo && creation.status === 'ready' ? (
            <View style={styles.editorCard}>
              <View style={styles.editorHead}>
                <Scissors size={14} color={colors.cyan} />
                <Text style={styles.editorTitle}>Trim & Loop</Text>
                <Text style={styles.editorBadge}>BETA</Text>
              </View>
              <Text style={styles.editorSub}>
                Pick start / end seconds. Long clips loop seamlessly up to 60s in the player above.
              </Text>
              <View style={styles.trimRow}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
                  <PressableScale
                    key={s}
                    onPress={() => {
                      if (s < trim.end) setTrim({ ...trim, start: s });
                    }}
                    testID={`trim-start-${s}`}
                  >
                    <View
                      style={[
                        styles.trimDot,
                        s >= trim.start && s <= trim.end && {
                          backgroundColor: colors.cyan,
                          borderColor: colors.cyan,
                        },
                      ]}
                    >
                      <Text style={[styles.trimDotText, s >= trim.start && s <= trim.end && { color: '#000' }]}>
                        {s}
                      </Text>
                    </View>
                  </PressableScale>
                ))}
              </View>
              <Text style={styles.helper}>
                Range: {trim.start}s → {trim.end}s · Final length: {trim.end - trim.start}s
              </Text>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <GradientButton
              title="Download"
              onPress={onDownload}
              icon={<Download size={16} color="#000" />}
              testID="download-btn"
              style={{ flex: 1 }}
            />
            {isText ? (
              <GradientButton
                title="Copy"
                onPress={onCopy}
                variant="outline"
                icon={<Copy size={16} color={colors.text} />}
                testID="copy-btn"
                style={{ flex: 1 }}
              />
            ) : null}
            <GradientButton
              title="Delete"
              onPress={onDelete}
              variant="outline"
              icon={<Trash2 size={16} color={colors.red} />}
              testID="delete-btn"
              style={{ flex: 1 }}
            />
          </View>

          <View style={styles.tip}>
            <LinearGradient
              colors={[colors.cyan + '20', 'transparent']}
              style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
            />
            <Sparkles size={14} color={colors.cyan} />
            <Text style={styles.tipText}>
              Tip: Use the Assistant in Create to refine your prompts and forge better results.
            </Text>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 18, paddingBottom: 30, gap: 14 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  tagText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  mediaCard: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    aspectRatio: 1,
  },
  media: { width: '100%', height: '100%' },
  processing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  processingText: { color: colors.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  failed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  failedText: { color: colors.red, fontSize: 13, textAlign: 'center' },
  codeWrap: { flex: 1, backgroundColor: '#06060c' },
  codeText: { color: colors.green, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 18 },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  prompt: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
  metaRow: { flexDirection: 'row', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: colors.textDim, fontSize: 11 },
  editorCard: {
    backgroundColor: colors.bgElev,
    borderColor: colors.cyan + '44',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: 8,
  },
  editorHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editorTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  editorBadge: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginLeft: 'auto' },
  editorSub: { color: colors.textDim, fontSize: 11 },
  trimRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  trimDot: {
    width: 30, height: 30, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  trimDotText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  helper: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  tip: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    padding: 12,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cyan + '44',
    overflow: 'hidden',
  },
  tipText: { color: colors.textDim, fontSize: 12, flex: 1 },
});
