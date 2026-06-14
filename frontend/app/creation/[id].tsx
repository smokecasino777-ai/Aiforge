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
  Dimensions,
  PanResponder,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import {
  ArrowLeft,
  Download,
  Trash2,
  Clock,
  Copy,
  Sparkles,
  Scissors,
  Code2,
  Box,
} from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import Scad3DViewer from '@/src/components/Scad3DViewer';
import { colors, radius, TYPE_META } from '@/src/theme/colors';
import { api, Creation } from '@/src/api/client';

const { width: SCREEN_W } = Dimensions.get('window');

export default function CreationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [creation, setCreation] = useState<Creation | null>(null);
  const [loading, setLoading] = useState(true);
  const [trim, setTrim] = useState<{ start: number; end: number }>({ start: 0, end: 12 });
  const [scadView, setScadView] = useState<'preview' | '3d' | 'code'>('3d');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const c = await api.getCreation(id);
      setCreation(c);
      if (c.duration) setTrim({ start: 0, end: Math.min(60, c.duration * 5) });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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

  const decodeBase64 = (b64: string) => {
    if (typeof atob === 'function') return atob(b64);
    return Buffer.from(b64, 'base64').toString('utf-8');
  };

  const onDownload = async () => {
    if (!creation?.media_data) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = `data:${creation.media_mime};base64,${creation.media_data}`;
      const ext =
        creation.type === 'video'
          ? 'mp4'
          : creation.media_mime === 'application/x-openscad'
            ? 'scad'
            : creation.type === 'chat'
              ? 'txt'
              : 'png';
      link.download = `${creation.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Alert.alert('Saved', 'Open with share to save to your device.');
    }
  };

  const onCopy = async () => {
    if (!creation?.media_data) return;
    const text = decodeBase64(creation.media_data);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      Alert.alert('Copied', 'Content copied to clipboard.');
    } else {
      Alert.alert('Content', text.slice(0, 1200));
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
  const isImage = creation.type === 'image';
  const isVideo = creation.type === 'video';
  const isScad = creation.media_mime === 'application/x-openscad';
  const is3DImage = creation.type === 'model3d' && !isScad;
  const isChat = creation.type === 'chat';

  const mediaUri =
    creation.media_data && (isImage || is3DImage)
      ? `data:${creation.media_mime};base64,${creation.media_data}`
      : null;
  const videoUri =
    isVideo && creation.media_data ? `data:${creation.media_mime};base64,${creation.media_data}` : null;
  const scadPreviewUri = isScad && creation.preview_image
    ? `data:image/png;base64,${creation.preview_image}` : null;
  const scadCode = isScad && creation.media_data ? decodeBase64(creation.media_data) : '';
  const chatText = isChat && creation.media_data ? decodeBase64(creation.media_data) : '';

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
                  {isVideo ? 'Forging your video… Sora can take a few minutes.' : 'Generating…'}
                </Text>
              </View>
            ) : creation.status === 'failed' ? (
              <View style={styles.failed}>
                <Text style={styles.failedText}>{creation.error || 'Generation failed.'}</Text>
              </View>
            ) : isVideo && videoUri ? (
              <VideoPlayer src={videoUri} />
            ) : isScad ? (
              <ScadViewer
                view={scadView}
                onChangeView={setScadView}
                previewUri={scadPreviewUri}
                previewBase64={creation.preview_image || null}
                code={scadCode}
                title={creation.title}
              />
            ) : mediaUri ? (
              <Image source={{ uri: mediaUri }} style={styles.media} resizeMode="cover" />
            ) : isChat ? (
              <ScrollView style={styles.codeWrap} contentContainerStyle={{ padding: 16 }}>
                <Text style={styles.chatText}>{chatText}</Text>
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
            <TrimEditor trim={trim} setTrim={setTrim} />
          ) : null}

          <View style={styles.actionsRow}>
            <GradientButton
              title="Download"
              onPress={onDownload}
              icon={<Download size={16} color="#000" />}
              testID="download-btn"
              style={{ flex: 1 }}
              small
            />
            {(isScad || isChat) ? (
              <GradientButton
                title="Copy"
                onPress={onCopy}
                variant="outline"
                icon={<Copy size={16} color={colors.text} />}
                testID="copy-btn"
                style={{ flex: 1 }}
                small
              />
            ) : null}
            <GradientButton
              title="Delete"
              onPress={onDelete}
              variant="outline"
              icon={<Trash2 size={16} color={colors.red} />}
              testID="delete-btn"
              style={{ flex: 1 }}
              small
            />
          </View>

          <View style={styles.tip}>
            <LinearGradient
              colors={[colors.cyan + '20', 'transparent']}
              style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
            />
            <Sparkles size={14} color={colors.cyan} />
            <Text style={styles.tipText}>
              {isScad
                ? 'Drag the 3D view to rotate · tap EXPORT STL to download the mesh for printing.'
                : isVideo
                  ? 'Use Trim to pick start/end seconds; the player loops to fill up to 60s.'
                  : 'Tip: Refine your prompts in Create → AI Assist for sharper results.'}
            </Text>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function VideoPlayer({ src }: { src: string }) {
  // Use a real HTML5 <video> element on web (works with data: URIs and remote
  // URLs alike) and expo-video on native. WebView does NOT work in the web
  // bundle of react-native-web and was the source of the "not working" bug.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.media}>
        {React.createElement('video' as any, {
          src,
          controls: true,
          autoPlay: true,
          loop: true,
          playsInline: true,
          style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000' },
        })}
      </View>
    );
  }
  return <VideoPlayerNative src={src} />;
}

function VideoPlayerNative({ src }: { src: string }) {
  const player = useVideoPlayer(src, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const [width, setWidth] = useState(1);
  const [duration, setDuration] = useState(0);

  // Capture duration once the asset loads
  useEffect(() => {
    const update = () => {
      try {
        const d = (player as any).duration;
        if (typeof d === 'number' && d > 0) setDuration(d);
      } catch {}
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [player]);

  // Pan-anywhere-to-scrub gesture
  const seekTo = (fraction: number) => {
    const f = Math.max(0, Math.min(1, fraction));
    if (duration > 0) {
      try {
        player.currentTime = f * duration;
      } catch {}
    }
    setScrubFraction(f);
  };
  const endScrub = () => setScrubFraction(null);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .onBegin((e) => {
      // pause for smoother scrub; resume on release
      try { player.pause(); } catch {}
      const f = e.x / Math.max(1, width);
      seekTo(f);
    })
    .onUpdate((e) => {
      const f = e.x / Math.max(1, width);
      seekTo(f);
    })
    .onFinalize(() => {
      try { player.play(); } catch {}
      endScrub();
    });

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

  return (
    <View style={styles.media} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <GestureDetector gesture={pan}>
        <View style={{ flex: 1 }} collapsable={false}>
          <VideoView
            player={player}
            style={{ flex: 1, backgroundColor: '#000' }}
            contentFit="contain"
            nativeControls={scrubFraction === null}
            allowsFullscreen
            allowsPictureInPicture
          />
          {/* Scrub overlay */}
          {scrubFraction !== null && duration > 0 && (
            <View pointerEvents="none" style={styles.scrubOverlay}>
              <View style={[styles.scrubBar, { width: `${scrubFraction * 100}%` }]} />
              <View style={styles.scrubTimeWrap}>
                <Text style={styles.scrubTimeText}>
                  {formatTime(scrubFraction * duration)} / {formatTime(duration)}
                </Text>
              </View>
            </View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

function ScadViewer({
  view,
  onChangeView,
  previewUri,
  previewBase64,
  code,
  title,
}: {
  view: 'preview' | '3d' | 'code';
  onChangeView: (v: 'preview' | '3d' | 'code') => void;
  previewUri: string | null;
  previewBase64: string | null;
  code: string;
  title: string;
}) {
  return (
    <View style={styles.media}>
      <View style={styles.scadTabs}>
        <PressableScale onPress={() => onChangeView('3d')} testID="scad-tab-3d">
          <View style={[styles.scadTab, view === '3d' && styles.scadTabActive]}>
            <Box size={14} color={view === '3d' ? colors.cyan : colors.textDim} />
            <Text style={[styles.scadTabText, view === '3d' && { color: colors.cyan }]}>
              3D
            </Text>
          </View>
        </PressableScale>
        <PressableScale onPress={() => onChangeView('preview')} testID="scad-tab-preview">
          <View style={[styles.scadTab, view === 'preview' && styles.scadTabActive]}>
            <Box size={14} color={view === 'preview' ? colors.purple : colors.textDim} />
            <Text style={[styles.scadTabText, view === 'preview' && { color: colors.purple }]}>
              Preview
            </Text>
          </View>
        </PressableScale>
        <PressableScale onPress={() => onChangeView('code')} testID="scad-tab-code">
          <View style={[styles.scadTab, view === 'code' && styles.scadTabActive]}>
            <Code2 size={14} color={view === 'code' ? colors.green : colors.textDim} />
            <Text style={[styles.scadTabText, view === 'code' && { color: colors.green }]}>
              SCAD
            </Text>
          </View>
        </PressableScale>
      </View>
      {view === '3d' ? (
        <Scad3DViewer scadCode={code} previewBase64={previewBase64} />
      ) : view === 'preview' ? (
        previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.scadPreview} resizeMode="cover" />
        ) : (
          <View style={styles.scadEmpty}>
            <Box size={42} color={colors.purple} />
            <Text style={styles.scadEmptyText}>{title}</Text>
            <Text style={styles.scadEmptySub}>No preview generated.</Text>
          </View>
        )
      ) : (
        <ScrollView style={{ flex: 1, backgroundColor: '#06060c' }} contentContainerStyle={{ padding: 14 }}>
          <Text style={styles.codeText}>{code}</Text>
        </ScrollView>
      )}
    </View>
  );
}

function TrimEditor({
  trim,
  setTrim,
}: {
  trim: { start: number; end: number };
  setTrim: (t: { start: number; end: number }) => void;
}) {
  const MAX = 60;
  const trackWidth = SCREEN_W - 64;
  const pxPerSec = trackWidth / MAX;
  const startX = useRef(trim.start * pxPerSec);
  const endX = useRef(trim.end * pxPerSec);

  const makeResponder = (which: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (which === 'start') {
          const x = Math.max(0, Math.min(g.moveX - 32, endX.current - 18));
          startX.current = x;
          const seconds = Math.max(0, Math.round(x / pxPerSec));
          setTrim({ start: seconds, end: trim.end });
        } else {
          const x = Math.max(startX.current + 18, Math.min(g.moveX - 32, trackWidth));
          endX.current = x;
          const seconds = Math.min(MAX, Math.round(x / pxPerSec));
          setTrim({ start: trim.start, end: seconds });
        }
      },
    });

  const startResponder = useRef(makeResponder('start')).current;
  const endResponder = useRef(makeResponder('end')).current;

  const leftPct = (trim.start / MAX) * 100;
  const widthPct = ((trim.end - trim.start) / MAX) * 100;

  return (
    <View style={styles.editorCard}>
      <View style={styles.editorHead}>
        <Scissors size={14} color={colors.cyan} />
        <Text style={styles.editorTitle}>Trim & Loop</Text>
        <Text style={styles.editorBadge}>CAPCUT-STYLE</Text>
      </View>
      <Text style={styles.editorSub}>
        Drag the cyan handles to set range. Final length: {trim.end - trim.start}s (max 60s).
      </Text>
      <View style={styles.trimTrack}>
        <View style={[styles.trimSelected, { left: `${leftPct}%`, width: `${widthPct}%` }]} />
        <View
          {...startResponder.panHandlers}
          style={[styles.trimHandle, { left: `${leftPct}%` }]}
          testID="trim-handle-start"
        >
          <Text style={styles.trimHandleText}>{trim.start}s</Text>
        </View>
        <View
          {...endResponder.panHandlers}
          style={[styles.trimHandle, { left: `${leftPct + widthPct}%`, marginLeft: -28 }]}
          testID="trim-handle-end"
        >
          <Text style={styles.trimHandleText}>{trim.end}s</Text>
        </View>
      </View>
      <View style={styles.timeline}>
        {[0, 10, 20, 30, 40, 50, 60].map((s) => (
          <Text key={s} style={styles.timelineLabel}>{s}s</Text>
        ))}
      </View>
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
  scrubOverlay: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 48,
    justifyContent: 'flex-end',
  },
  scrubBar: {
    height: 3,
    backgroundColor: colors.cyan,
    boxShadow: '0px 0px 8px rgba(0,240,255,0.9)' as any,
  },
  scrubTimeWrap: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(2,2,8,0.85)',
    borderColor: colors.cyan + '88',
    borderWidth: 1,
  },
  scrubTimeText: {
    color: colors.cyan,
    fontWeight: '900',
    letterSpacing: 0.8,
    fontSize: 12,
  },
  processing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  processingText: { color: colors.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  failed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  failedText: { color: colors.red, fontSize: 13, textAlign: 'center' },
  codeWrap: { flex: 1, backgroundColor: '#06060c' },
  codeText: { color: colors.green, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 18 },
  chatText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  prompt: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
  metaRow: { flexDirection: 'row', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: colors.textDim, fontSize: 11 },
  // SCAD viewer
  scadTabs: { flexDirection: 'row', padding: 8, gap: 6, backgroundColor: 'rgba(0,0,0,0.5)' },
  scadTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.04)' },
  scadTabActive: { borderColor: colors.borderStrong, backgroundColor: 'rgba(255,255,255,0.08)' },
  scadTabText: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  scadPreview: { flex: 1 },
  scadEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  scadEmptyText: { color: colors.text, fontWeight: '700' },
  scadEmptySub: { color: colors.textDim, fontSize: 12 },
  // Trim editor
  editorCard: {
    backgroundColor: colors.bgElev,
    borderColor: colors.cyan + '44',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
  },
  editorHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editorTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  editorBadge: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginLeft: 'auto' },
  editorSub: { color: colors.textDim, fontSize: 11 },
  trimTrack: {
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.md,
    position: 'relative',
    marginTop: 4,
  },
  trimSelected: {
    position: 'absolute',
    top: 0, bottom: 0,
    backgroundColor: colors.cyan + '35',
    borderColor: colors.cyan,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  trimHandle: {
    position: 'absolute',
    top: 4, bottom: 4,
    width: 28,
    borderRadius: 6,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 0px 10px rgba(0,240,255,0.8)',
  },
  trimHandleText: { color: '#000', fontSize: 10, fontWeight: '900' },
  timeline: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineLabel: { color: colors.textMuted, fontSize: 10 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  tip: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    padding: 12,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cyan + '44',
    overflow: 'hidden',
  },
  tipText: { color: colors.textDim, fontSize: 12, flex: 1 },
});
