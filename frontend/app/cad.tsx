import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import {
  ArrowLeft,
  Box,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Send,
  Sparkles,
  Download,
  History,
  Trash2,
  Code2,
} from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import PressableScale from '@/src/components/PressableScale';
import PulsingLogo from '@/src/components/Logo';
import Scad3DViewer, { Scad3DViewerHandle } from '@/src/components/Scad3DViewer';
import FeatureTour from '@/src/components/FeatureTour';
import { colors, radius } from '@/src/theme/colors';
import { api, Creation } from '@/src/api/client';

const PROMPT_IDEAS = [
  'A futuristic hexagonal vase',
  'A small robot with two arms',
  'A geometric phone stand',
  'A cyberpunk pyramid sculpture',
  'A modular gear assembly',
  'A spaceship cockpit canopy',
];

export default function CADGenerator() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const viewerRef = useRef<Scad3DViewerHandle>(null);

  // Pinch-to-zoom gesture wraps the WebView and throttles native pinches into
  // discrete zoomIn/zoomOut calls on the Three.js camera.
  const pinchLast = useRef(1);
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      pinchLast.current = 1;
    })
    .onUpdate((e) => {
      const scale = e.scale;
      // emit at ~8% deltas so we don't overwhelm the WebView
      if (scale / pinchLast.current > 1.08) {
        viewerRef.current?.zoomIn();
        pinchLast.current = scale;
      } else if (scale / pinchLast.current < 0.92) {
        viewerRef.current?.zoomOut();
        pinchLast.current = scale;
      }
    });

  // History stack so the user can undo to previous generations.
  const [history, setHistory] = useState<{ code: string; preview: string | null; prompt: string; createdAt: number; creationId?: string }[]>([]);
  const [pointer, setPointer] = useState(-1);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const current = pointer >= 0 ? history[pointer] : null;

  // Optionally load a creation passed via ?source=
  useEffect(() => {
    if (source) {
      (async () => {
        try {
          const c = await api.getCreation(source as string);
          if (c.type !== 'model3d') {
            Alert.alert('CAD', 'That creation is not a 3D model.');
            return;
          }
          const code = c.media_data ? atob(c.media_data) : '';
          pushHistory({ code, preview: c.preview_image || null, prompt: c.prompt, creationId: c.id });
        } catch (e: any) {
          Alert.alert('CAD', e.message || 'Could not load');
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const pushHistory = (entry: { code: string; preview: string | null; prompt: string; creationId?: string }) => {
    setHistory((arr) => {
      // Truncate any "future" entries when pushing a new one after undo
      const head = arr.slice(0, pointer + 1);
      const next = [...head, { ...entry, createdAt: Date.now() }];
      setPointer(next.length - 1);
      return next;
    });
  };

  const onGenerate = async () => {
    const p = prompt.trim();
    if (!p) {
      Alert.alert('CAD', 'Describe the 3D model you want to create.');
      return;
    }
    try {
      setBusy(true);
      const c: Creation = await api.generateScad(p);
      const code = c.media_data ? atob(c.media_data) : '';
      pushHistory({ code, preview: c.preview_image || null, prompt: p, creationId: c.id });
      setPrompt('');
    } catch (e: any) {
      Alert.alert('Generation failed', e.message || 'Try a different prompt');
    } finally {
      setBusy(false);
    }
  };

  const onUndo = () => {
    if (pointer > 0) setPointer(pointer - 1);
    viewerRef.current?.resetView();
  };

  const onRedo = () => {
    if (pointer < history.length - 1) setPointer(pointer + 1);
    viewerRef.current?.resetView();
  };

  const onClear = () => {
    Alert.alert('Clear', 'Remove all generations from this session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { setHistory([]); setPointer(-1); } },
    ]);
  };

  return (
    <View style={styles.root}>
      <StarryBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={styles.topBar}>
            <PressableScale onPress={() => router.back()} testID="cad-back">
              <View style={styles.iconBtn}><ArrowLeft size={18} color={colors.text} /></View>
            </PressableScale>
            <PulsingLogo size={28} textSize={16} />
            <PressableScale onPress={() => setShowCode(true)} disabled={!current} testID="cad-show-code">
              <View style={[styles.iconBtn, !!current && styles.iconBtnActive]}>
                <Code2 size={18} color={current ? colors.green : colors.textDim} />
              </View>
            </PressableScale>
          </View>

          {/* Title */}
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <Box size={22} color={colors.cyan} />
              <Text style={styles.title}>3D / CAD GENERATOR</Text>
            </View>
            <Text style={styles.subtitle}>
              Sketch any object with words. AiForge renders + exports STL ready for printing.
            </Text>
          </View>

          {/* Toolbar */}
          <View style={styles.toolbarRow}>
            <ToolPill
              icon={<RotateCcw size={14} color={pointer > 0 ? colors.text : colors.textDim} />}
              label="UNDO"
              onPress={onUndo}
              disabled={pointer <= 0}
              testID="cad-undo"
            />
            <ToolPill
              icon={<History size={14} color={pointer < history.length - 1 ? colors.text : colors.textDim} />}
              label={`HIST · ${Math.max(0, pointer + 1)}/${history.length}`}
              onPress={onRedo}
              disabled={pointer >= history.length - 1}
              testID="cad-history"
            />
            <ToolPill
              icon={<ZoomIn size={14} color={current ? colors.text : colors.textDim} />}
              label="ZOOM +"
              onPress={() => viewerRef.current?.zoomIn()}
              disabled={!current}
              testID="cad-zoom-in"
            />
            <ToolPill
              icon={<ZoomOut size={14} color={current ? colors.text : colors.textDim} />}
              label="ZOOM −"
              onPress={() => viewerRef.current?.zoomOut()}
              disabled={!current}
              testID="cad-zoom-out"
            />
            <ToolPill
              icon={<Download size={14} color={current ? colors.green : colors.textDim} />}
              label="STL"
              onPress={() => viewerRef.current?.exportSTL()}
              disabled={!current}
              testID="cad-stl"
              tint={colors.green}
            />
            <ToolPill
              icon={<Trash2 size={14} color={history.length ? colors.red : colors.textDim} />}
              label=""
              onPress={onClear}
              disabled={!history.length}
              testID="cad-clear"
            />
          </View>

          {/* Viewport */}
          <View style={styles.viewportFrame}>
            <GestureDetector gesture={pinch}>
              <View style={styles.viewportInner} collapsable={false}>
                {current ? (
                  <Scad3DViewer
                    ref={viewerRef}
                    scadCode={current.code}
                    previewBase64={current.preview}
                    hideToolbar
                  />
                ) : (
                  <EmptyViewport />
                )}
              </View>
            </GestureDetector>
            <View style={styles.viewportTag}>
              <View style={styles.dot} />
              <Text style={styles.viewportTagText}>
                CAD VIEW · {current ? 'Drag to rotate · pinch to zoom' : 'Awaiting prompt'}
              </Text>
            </View>
          </View>

          {/* Idea pills */}
          {!current && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.ideasRow}
              style={{ flexGrow: 0 }}
            >
              {PROMPT_IDEAS.map((p) => (
                <PressableScale key={p} onPress={() => setPrompt(p)}>
                  <View style={styles.ideaPill}>
                    <Sparkles size={11} color={colors.cyan} />
                    <Text style={styles.ideaText}>{p}</Text>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          )}

          {/* Prompt bar */}
          <View style={styles.promptBar}>
            <View style={styles.promptInputWrap}>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="Describe the 3D model you want to create…"
                placeholderTextColor={colors.textMuted}
                style={styles.promptInput}
                multiline
                maxLength={300}
                onSubmitEditing={onGenerate}
                returnKeyType="go"
                testID="cad-prompt-input"
                editable={!busy}
              />
            </View>
            <PressableScale onPress={onGenerate} testID="cad-generate">
              <LinearGradient
                colors={busy ? ['#444', '#222'] : [colors.cyan, '#0066AA']}
                style={styles.sendBtn}
              >
                {busy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Send size={18} color="#000" />
                )}
              </LinearGradient>
            </PressableScale>
          </View>

          {busy && (
            <Text style={styles.busyText}>Forging your 3D model…</Text>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* SCAD code modal */}
      <Modal visible={showCode} transparent animationType="slide" onRequestClose={() => setShowCode(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setShowCode(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Code2 size={16} color={colors.green} />
              <Text style={styles.modalTitle}>OpenSCAD source</Text>
              <Text style={styles.modalMeta}>{current?.prompt}</Text>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              <Text style={styles.codeBlock}>{current?.code || ''}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* First-visit feature tour */}
      <FeatureTour
        storageKey="aiforge_tour_cad"
        steps={[
          {
            emoji: '🧊',
            title: 'CAD Generator',
            body: 'Describe any object — gears, vases, robots — and AiForge forges a 3D model + OpenSCAD source ready to print.',
            color: colors.cyan,
          },
          {
            emoji: '🤏',
            title: 'Drag · pinch · zoom',
            body: 'Drag the viewport to rotate. Pinch on the model to zoom in and out smoothly. Tap RESET VIEW to recenter.',
            color: colors.green,
          },
          {
            emoji: '⬇️',
            title: 'Export STL',
            body: 'Tap STL to download a real mesh file. Drop it into any slicer (Cura, PrusaSlicer) and 3D-print.',
            color: colors.pink,
          },
        ]}
      />
    </View>
  );
}

// ---- Sub-components ----
function ToolPill({ icon, label, onPress, disabled, testID, tint }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean; testID?: string; tint?: string }) {
  return (
    <PressableScale onPress={disabled ? () => {} : onPress} testID={testID}>
      <View
        style={[
          styles.toolPill,
          disabled && { opacity: 0.4 },
          tint && !disabled && { borderColor: tint + '88' },
        ]}
      >
        {icon}
        {label ? <Text style={[styles.toolPillText, tint && !disabled && { color: tint }]}>{label}</Text> : null}
      </View>
    </PressableScale>
  );
}

function EmptyViewport() {
  return (
    <View style={styles.emptyVp}>
      {/* Wireframe cube illustration */}
      <View style={styles.wireFrame}>
        <View style={[styles.wireFace, { borderColor: colors.cyan + '88' }]} />
        <View style={[styles.wireFace, styles.wireFace2, { borderColor: colors.cyan + '44' }]} />
        <View style={[styles.wireLine, { top: 0, left: 0 }]} />
        <View style={[styles.wireLine, { top: 0, right: 0 }]} />
        <View style={[styles.wireLine, { bottom: 0, left: 0 }]} />
        <View style={[styles.wireLine, { bottom: 0, right: 0 }]} />
      </View>
      <Text style={styles.emptyTitle}>Type a prompt to forge your first model</Text>
      <Text style={styles.emptySub}>The 3D view will appear here · STL export ready</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#0A0A14',
    borderWidth: 1, borderColor: '#ffffff14',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnActive: { borderColor: colors.green + 'AA', backgroundColor: colors.green + '14' },
  titleBlock: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  toolbarRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 16, paddingBottom: 10,
  },
  toolPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: '#0A0A14',
    borderColor: '#ffffff18', borderWidth: 1,
  },
  toolPillText: { color: colors.text, fontWeight: '900', fontSize: 10, letterSpacing: 0.8 },
  viewportFrame: {
    flex: 1,
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: radius.lg,
    borderColor: colors.cyan + '44', borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#06060c',
    position: 'relative',
  },
  viewportInner: { flex: 1 },
  viewportTag: {
    position: 'absolute',
    bottom: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(2,2,8,0.7)',
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.cyan + '44',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  viewportTagText: { color: colors.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  emptyVp: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  wireFrame: { width: 120, height: 120, position: 'relative' },
  wireFace: {
    position: 'absolute',
    inset: 0 as any,
    top: 14, left: 14, right: 14, bottom: 14,
    borderWidth: 2,
  },
  wireFace2: { top: 30, left: 30, right: 0, bottom: 0, borderWidth: 1 },
  wireLine: {
    position: 'absolute', width: 30, height: 1,
    backgroundColor: colors.cyan + '55',
    transform: [{ rotate: '35deg' }],
  },
  emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 14, textAlign: 'center' },
  emptySub: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
  ideasRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  ideaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#0A0A14',
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.cyan + '44',
  },
  ideaText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  promptBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16,
  },
  promptInputWrap: {
    flex: 1,
    backgroundColor: '#0A0A14',
    borderColor: colors.cyan + '44', borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 52,
    maxHeight: 120,
  },
  promptInput: {
    color: colors.text,
    fontSize: 14,
    minHeight: 36,
  },
  sendBtn: {
    width: 56, height: 52,
    borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  busyText: { color: colors.cyan, fontSize: 12, textAlign: 'center', paddingBottom: 8 },
  // Modal
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#0A0A14',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24,
    borderTopWidth: 1, borderColor: colors.green + '44',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  modalTitle: { color: colors.text, fontWeight: '900', fontSize: 16 },
  modalMeta: { color: colors.textDim, fontSize: 11, flex: 1, textAlign: 'right' },
  codeBlock: {
    color: colors.green,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 16,
  },
});
