import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { captureRef } from 'react-native-view-shot';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ArrowLeft,
  Zap,
  Move,
  Crop,
  Scissors,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Type as TypeIcon,
  RefreshCcw,
  Upload,
  Image as ImageIcon,
  FolderOpen,
  Sparkles,
  Palette,
  Eraser,
  Hash,
  Save as SaveIcon,
  Wand2,
  Trash2,
  Play,
  Pause,
} from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import PressableScale from '@/src/components/PressableScale';
import PulsingLogo from '@/src/components/Logo';
import { colors, radius } from '@/src/theme/colors';
import { api, Creation, BACKEND_URL } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';

const { width: SCREEN_W } = Dimensions.get('window');

type Tool =
  | 'move'
  | 'crop'
  | 'trim'
  | 'rotateL'
  | 'rotateR'
  | 'flipH'
  | 'flipV'
  | 'text'
  | 'reset';

type Stage =
  | { kind: 'empty' }
  | { kind: 'image'; uri: string; b64: string; mime: string; w: number; h: number }
  | { kind: 'video'; uri: string; b64?: string; mime: string; duration: number };

type TextOverlay = {
  id: string;
  text: string;
  color: string;
  size: number;
  x: number;
  y: number;
};

const STYLE_PRESETS = [
  { id: 'cyberpunk', label: 'Cyberpunk', color: colors.cyan },
  { id: 'neon_noir', label: 'Neon Noir', color: colors.pink },
  { id: 'anime', label: 'Anime', color: colors.green },
  { id: 'oil_painting', label: 'Oil Paint', color: colors.yellow },
  { id: 'watercolor', label: 'Watercolor', color: '#7EC8E3' },
  { id: 'pixel_art', label: 'Pixel Art', color: colors.purple },
  { id: 'cinematic', label: 'Cinematic', color: colors.red },
  { id: 'studio_ghibli', label: 'Ghibli', color: '#B8E994' },
];

export default function Editor() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const { user } = useAuth();
  const canvasRef = useRef<View>(null);

  const [stage, setStage] = useState<Stage>({ kind: 'empty' });
  const [tool, setTool] = useState<Tool>('move');
  const [rotation, setRotation] = useState(0); // multiples of 90
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [textModal, setTextModal] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [textColor, setTextColor] = useState(colors.cyan);
  const [busy, setBusy] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<Creation[]>([]);
  const [styleOpen, setStyleOpen] = useState(false);
  const [captionData, setCaptionData] = useState<{ hook: string; caption: string; hashtags: string[] } | null>(null);
  const [videoTrim, setVideoTrim] = useState<{ start: number; end: number }>({ start: 0, end: 12 });

  // ----- Source loading -----
  useEffect(() => {
    if (source && stage.kind === 'empty') {
      loadFromLibrary(source);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const fetchLibrary = async () => {
    try {
      const items = await api.listCreations();
      // Only image / video are editable for v1
      setLibrary(items.filter((c) => c.type === 'image' || c.type === 'video'));
    } catch (e: any) {
      Alert.alert('Library', e.message || 'Failed to load library');
    }
  };

  const loadFromLibrary = async (id: string) => {
    try {
      setBusy('Loading…');
      const c = await api.getCreation(id);
      if (!c.media_data) throw new Error('Creation has no media yet.');
      if (c.type === 'image') {
        // Build a temp file URI from base64 to use with ImageManipulator on native
        const uri = await b64ToTempUri(c.media_data, c.media_mime || 'image/png');
        setStage({
          kind: 'image',
          uri,
          b64: c.media_data,
          mime: c.media_mime || 'image/png',
          w: c.width || 1024,
          h: c.height || 1024,
        });
      } else if (c.type === 'video') {
        const uri = await b64ToTempUri(c.media_data, c.media_mime || 'video/mp4');
        setStage({
          kind: 'video',
          uri,
          b64: c.media_data,
          mime: c.media_mime || 'video/mp4',
          duration: c.duration || 12,
        });
        setVideoTrim({ start: 0, end: c.duration || 12 });
      } else {
        Alert.alert('Editor', 'Only images and videos are editable.');
      }
      resetTransforms();
    } catch (e: any) {
      Alert.alert('Editor', e.message || 'Failed to load');
    } finally {
      setBusy(null);
    }
  };

  const resetTransforms = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCrop(null);
    setOverlays([]);
    setCaptionData(null);
  };

  const onPickFile = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permission needed',
          "AiForge needs access to your photos to import a file. You can change this in Settings.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'] as any,
        quality: 0.9,
        allowsMultipleSelection: false,
        base64: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setBusy('Importing…');
      const isVideo = asset.type === 'video' || (asset.mimeType || '').startsWith('video');
      const mime = asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg');
      // Read to base64 so we can pass to backend
      const b64 = await fileUriToB64(asset.uri);
      if (isVideo) {
        setStage({ kind: 'video', uri: asset.uri, b64, mime, duration: Math.round((asset.duration || 12000) / 1000) });
        setVideoTrim({ start: 0, end: Math.min(60, Math.round((asset.duration || 12000) / 1000)) });
      } else {
        setStage({
          kind: 'image',
          uri: asset.uri,
          b64,
          mime,
          w: asset.width || 1024,
          h: asset.height || 1024,
        });
      }
      resetTransforms();
    } catch (e: any) {
      Alert.alert('Importer', e.message || 'Failed to import');
    } finally {
      setBusy(null);
    }
  };

  // ----- Tool actions -----
  const applyTool = async (t: Tool) => {
    setTool(t);
    if (stage.kind === 'empty') return;
    switch (t) {
      case 'rotateL':
        setRotation((r) => (r - 90 + 360) % 360);
        break;
      case 'rotateR':
        setRotation((r) => (r + 90) % 360);
        break;
      case 'flipH':
        setFlipH((v) => !v);
        break;
      case 'flipV':
        setFlipV((v) => !v);
        break;
      case 'text':
        setTextModal(true);
        break;
      case 'reset':
        resetTransforms();
        break;
      case 'crop':
        if (stage.kind === 'image') {
          // Crop to a centered 80% box; user can later resize via gestures (v2)
          setCrop({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
        }
        break;
      case 'trim':
      case 'move':
      default:
        break;
    }
  };

  const addOverlay = () => {
    if (!textDraft.trim()) {
      setTextModal(false);
      return;
    }
    setOverlays((arr) => [
      ...arr,
      {
        id: `t_${Date.now()}`,
        text: textDraft.trim(),
        color: textColor,
        size: 32,
        x: 0.5,
        y: 0.5,
      },
    ]);
    setTextDraft('');
    setTextModal(false);
  };

  // ----- AI ops (image only for v1) -----
  const aiOp = async (label: string, fn: () => Promise<{ image_b64: string; media_mime: string }>) => {
    if (stage.kind !== 'image') {
      Alert.alert('AI', 'AI image tools work on images. Pick an image to edit.');
      return;
    }
    try {
      setBusy(`${label}…`);
      const r = await fn();
      const uri = await b64ToTempUri(r.image_b64, r.media_mime);
      setStage({ ...stage, uri, b64: r.image_b64, mime: r.media_mime });
      resetTransforms();
    } catch (e: any) {
      Alert.alert(label, e.message || 'AI failed');
    } finally {
      setBusy(null);
    }
  };

  const onEnhance = () =>
    aiOp('AI Enhance', () => api.editorEnhance((stage as any).b64));

  const onStyle = (style: string) => {
    setStyleOpen(false);
    aiOp(`Style · ${style}`, () => api.editorStyle((stage as any).b64, style));
  };

  const onBgRemove = () =>
    aiOp('BG Remove', () => api.editorBgRemove((stage as any).b64));

  const onCaption = async () => {
    if (stage.kind === 'empty') return;
    try {
      setBusy('AI Caption…');
      const r = await api.editorCaption(
        'Edited media',
        { title: 'Edited', media_type: stage.kind },
      );
      setCaptionData(r);
    } catch (e: any) {
      Alert.alert('Caption', e.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  // ----- Save -----
  const onSave = async () => {
    if (stage.kind === 'empty') return;
    try {
      setBusy('Saving…');
      if (stage.kind === 'image') {
        // Burn in rotation / flip / crop / overlays via view-shot
        const uri = await captureRef(canvasRef, { format: 'png', quality: 0.95, result: 'base64' });
        const b64 = uri; // captureRef with result='base64' returns the raw base64 string
        await api.editorSave({
          media_b64: b64,
          media_mime: 'image/png',
          type: 'image',
          title: 'Edited image',
          prompt: 'AI-assisted edit',
          width: stage.w,
          height: stage.h,
        });
      } else if (stage.kind === 'video') {
        // For video we don't re-encode; we save the original buffer plus a
        // best-effort trim window. (Server-side video re-encoding is a future
        // feature requiring ffmpeg.)
        if (!stage.b64) throw new Error('Video buffer missing');
        await api.editorSave({
          media_b64: stage.b64,
          media_mime: stage.mime,
          type: 'video',
          title: `Edited clip (${videoTrim.start}-${videoTrim.end}s)`,
          prompt: `Trim ${videoTrim.start}-${videoTrim.end}s, ${overlays.length} text overlays`,
          duration: Math.max(1, videoTrim.end - videoTrim.start),
        });
      }
      Alert.alert('Saved', 'Your edited creation is now in your Library.', [
        { text: 'Stay here', style: 'cancel' },
        { text: 'Go to Library', onPress: () => router.replace('/(tabs)/library' as any) },
      ]);
    } catch (e: any) {
      Alert.alert('Save', e.message || 'Failed');
    } finally {
      setBusy(null);
    }
  };

  // ===== Render =====
  return (
    <View style={styles.root}>
      <StarryBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.topBar}>
          <PressableScale onPress={() => router.back()} testID="editor-back">
            <View style={styles.iconBtn}>
              <ArrowLeft size={18} color={colors.text} />
            </View>
          </PressableScale>
          <PulsingLogo size={28} textSize={16} />
          <PressableScale onPress={onSave} testID="editor-save">
            <View style={[styles.iconBtn, stage.kind !== 'empty' && styles.iconBtnActive]}>
              <SaveIcon size={18} color={stage.kind !== 'empty' ? colors.green : colors.textDim} />
            </View>
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.titleRow}>
            <Zap size={22} color={colors.green} />
            <Text style={styles.title}>EDITOR</Text>
          </View>
          <Text style={styles.subtitle}>Full image & video editor with AI-powered tools</Text>

          {/* Tool grid */}
          <View style={styles.toolGrid}>
            <ToolBtn icon={<Move size={18} color={colors.text} />} label="Move" active={tool === 'move'} onPress={() => applyTool('move')} highlight />
            <ToolBtn icon={<Crop size={18} color={colors.text} />} label="Crop" active={tool === 'crop'} onPress={() => applyTool('crop')} />
            <ToolBtn icon={<Scissors size={18} color={colors.text} />} label="Cut" active={tool === 'trim'} onPress={() => applyTool('trim')} disabled={stage.kind !== 'video'} />
            <ToolBtn icon={<RotateCcw size={18} color={colors.text} />} label="Rotate L" onPress={() => applyTool('rotateL')} />
            <ToolBtn icon={<RotateCw size={18} color={colors.text} />} label="Rotate R" onPress={() => applyTool('rotateR')} />
            <ToolBtn icon={<FlipHorizontal size={18} color={colors.text} />} label="Flip H" onPress={() => applyTool('flipH')} />
            <ToolBtn icon={<FlipVertical size={18} color={colors.text} />} label="Flip V" onPress={() => applyTool('flipV')} />
            <ToolBtn icon={<TypeIcon size={18} color={colors.text} />} label="Add Text" onPress={() => applyTool('text')} />
            <ToolBtn icon={<RefreshCcw size={18} color={colors.text} />} label="Reset" onPress={() => applyTool('reset')} />
          </View>

          {/* Stage */}
          {stage.kind === 'empty' ? (
            <View style={styles.dropzone}>
              <View style={styles.dropzoneIconStack}>
                <View style={[styles.dropzoneLayer, { backgroundColor: '#0E1A12' }]} />
                <View style={[styles.dropzoneLayer, { backgroundColor: '#0A1F18', top: -8, left: 6 }]} />
                <View style={[styles.dropzoneLayer, { backgroundColor: colors.green + '33', top: -16, left: 12, borderColor: colors.green + 'AA' }]} />
              </View>
              <Text style={styles.dropzoneTitle}>Upload or import a file to start editing</Text>

              <PressableScale onPress={onPickFile} testID="upload-file">
                <LinearGradient colors={[colors.green, '#00CC55']} style={styles.primaryBtn}>
                  <Upload size={16} color="#000" />
                  <Text style={styles.primaryBtnText}>Upload File</Text>
                </LinearGradient>
              </PressableScale>

              <PressableScale
                onPress={() => {
                  fetchLibrary();
                  setLibraryOpen(true);
                }}
                testID="import-library"
              >
                <View style={styles.secondaryBtn}>
                  <FolderOpen size={14} color={colors.text} />
                  <Text style={styles.secondaryBtnText}>Import from Library</Text>
                </View>
              </PressableScale>
            </View>
          ) : (
            <>
              <View
                ref={canvasRef}
                collapsable={false}
                style={styles.canvasWrap}
                testID="editor-canvas"
              >
                {stage.kind === 'image' ? (
                  <View
                    style={[
                      styles.imageInner,
                      {
                        transform: [
                          { rotate: `${rotation}deg` },
                          { scaleX: flipH ? -1 : 1 },
                          { scaleY: flipV ? -1 : 1 },
                        ],
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: stage.uri }}
                      style={styles.canvasMedia}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <VideoStage uri={stage.uri} duration={stage.duration} trim={videoTrim} />
                )}

                {/* Text overlays */}
                {overlays.map((o) => (
                  <Pressable
                    key={o.id}
                    onLongPress={() =>
                      setOverlays((arr) => arr.filter((x) => x.id !== o.id))
                    }
                    style={[
                      styles.overlay,
                      { left: `${o.x * 100 - 15}%`, top: `${o.y * 100 - 5}%` },
                    ]}
                  >
                    <Text style={{ color: o.color, fontSize: o.size, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6 }}>
                      {o.text}
                    </Text>
                  </Pressable>
                ))}

                {/* Crop overlay */}
                {crop && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.cropBox,
                      {
                        left: `${crop.x * 100}%`,
                        top: `${crop.y * 100}%`,
                        width: `${crop.w * 100}%`,
                        height: `${crop.h * 100}%`,
                      },
                    ]}
                  />
                )}
              </View>

              {/* Video trim slider */}
              {stage.kind === 'video' && (
                <VideoTrimBar
                  duration={stage.duration}
                  value={videoTrim}
                  onChange={setVideoTrim}
                />
              )}

              {/* Active tool tip */}
              <Text style={styles.toolHint}>
                {tool === 'move' && '✋  Move • drag in the canvas area'}
                {tool === 'crop' && '✂️  Crop • adjust the box (long-press text overlays to delete)'}
                {tool === 'trim' && '🎬  Trim • adjust handles below to set start/end seconds'}
                {tool === 'rotateL' && '↺  Rotated left 90°'}
                {tool === 'rotateR' && '↻  Rotated right 90°'}
                {tool === 'flipH' && '↔  Flipped horizontally'}
                {tool === 'flipV' && '↕  Flipped vertically'}
                {tool === 'text' && '🅣  Tap "Add Text" again to layer more · long-press text to delete'}
                {tool === 'reset' && '↩  Reset all transforms'}
              </Text>

              {/* AI tools */}
              <Text style={styles.sectionLabel}>AI TOOLS</Text>
              <View style={styles.aiRow}>
                <AIBtn icon={<Sparkles size={16} color={colors.green} />} label="Enhance" onPress={onEnhance} color={colors.green} />
                <AIBtn icon={<Palette size={16} color={colors.pink} />} label="Style" onPress={() => setStyleOpen(true)} color={colors.pink} />
                <AIBtn icon={<Eraser size={16} color={colors.cyan} />} label="BG Remove" onPress={onBgRemove} color={colors.cyan} />
                <AIBtn icon={<Hash size={16} color={colors.yellow} />} label="Caption" onPress={onCaption} color={colors.yellow} />
              </View>

              {captionData && (
                <View style={styles.captionCard}>
                  <View style={styles.captionRow}>
                    <Wand2 size={14} color={colors.yellow} />
                    <Text style={styles.captionTitle}>AI CAPTION</Text>
                    <PressableScale onPress={() => setCaptionData(null)}>
                      <View style={{ padding: 4 }}><Trash2 size={14} color={colors.textDim} /></View>
                    </PressableScale>
                  </View>
                  <Text style={styles.captionHook}>{captionData.hook}</Text>
                  <Text style={styles.captionBody}>{captionData.caption}</Text>
                  <Text style={styles.captionTags}>{captionData.hashtags.join('  ')}</Text>
                </View>
              )}
            </>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Busy overlay */}
      {busy && (
        <View pointerEvents="auto" style={styles.busyOverlay}>
          <ActivityIndicator size="large" color={colors.cyan} />
          <Text style={styles.busyText}>{busy}</Text>
        </View>
      )}

      {/* Text overlay modal */}
      <Modal visible={textModal} transparent animationType="fade" onRequestClose={() => setTextModal(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setTextModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add Text</Text>
            <TextInput
              value={textDraft}
              onChangeText={setTextDraft}
              placeholder="Type your overlay…"
              placeholderTextColor={colors.textMuted}
              style={styles.modalInput}
              autoFocus
              maxLength={80}
            />
            <View style={styles.colorRow}>
              {[colors.cyan, colors.green, colors.pink, colors.yellow, colors.purple, colors.red, '#FFFFFF', '#000000'].map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setTextColor(c)}
                  style={[styles.colorDot, { backgroundColor: c }, textColor === c && styles.colorDotActive]}
                />
              ))}
            </View>
            <PressableScale onPress={addOverlay}>
              <LinearGradient colors={[colors.green, '#00CC55']} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Add</Text>
              </LinearGradient>
            </PressableScale>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Style picker modal */}
      <Modal visible={styleOpen} transparent animationType="slide" onRequestClose={() => setStyleOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setStyleOpen(false)}>
          <Pressable style={[styles.modalCard, { maxHeight: '70%' }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Pick a style</Text>
            <ScrollView>
              <View style={styles.styleGrid}>
                {STYLE_PRESETS.map((s) => (
                  <Pressable key={s.id} onPress={() => onStyle(s.id)} style={[styles.styleCard, { borderColor: s.color + '88' }]}>
                    <LinearGradient colors={[s.color + '40', 'transparent']} style={StyleSheet.absoluteFill} />
                    <Text style={[styles.styleLabel, { color: s.color }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Library picker modal */}
      <Modal visible={libraryOpen} transparent animationType="slide" onRequestClose={() => setLibraryOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setLibraryOpen(false)}>
          <Pressable style={[styles.modalCard, { maxHeight: '80%' }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Import from Library</Text>
            {library.length === 0 ? (
              <View style={{ padding: 24 }}>
                <Text style={{ color: colors.textDim, textAlign: 'center' }}>
                  No images or videos in your Library yet. Generate something on the Create tab first.
                </Text>
              </View>
            ) : (
              <ScrollView>
                <View style={styles.libGrid}>
                  {library.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        setLibraryOpen(false);
                        loadFromLibrary(c.id);
                      }}
                      style={styles.libCard}
                    >
                      {c.preview_image || (c.type === 'image' && c.media_data) ? (
                        <Image
                          source={{
                            uri: `data:${c.media_mime || 'image/png'};base64,${c.type === 'image' ? c.media_data : c.preview_image}`,
                          }}
                          style={styles.libThumb}
                        />
                      ) : (
                        <View style={[styles.libThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#06060c' }]}>
                          <Play size={32} color={colors.cyan} />
                        </View>
                      )}
                      <Text numberOfLines={1} style={styles.libCardTitle}>{c.title}</Text>
                      <Text style={styles.libCardKind}>{c.type.toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ----- Sub-components -----
function ToolBtn({ icon, label, active, onPress, highlight, disabled }: { icon: React.ReactNode; label: string; active?: boolean; onPress: () => void; highlight?: boolean; disabled?: boolean }) {
  return (
    <PressableScale onPress={disabled ? () => {} : onPress}>
      <View
        style={[
          styles.toolBtn,
          active && styles.toolBtnActive,
          highlight && active && styles.toolBtnHighlight,
          disabled && { opacity: 0.35 },
        ]}
      >
        {icon}
        <Text style={[styles.toolText, active && highlight && { color: '#000' }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

function AIBtn({ icon, label, onPress, color }: { icon: React.ReactNode; label: string; onPress: () => void; color: string }) {
  return (
    <PressableScale onPress={onPress}>
      <View style={[styles.aiBtn, { borderColor: color + '88' }]}>
        {icon}
        <Text style={[styles.aiBtnText, { color }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

function VideoStage({ uri, duration, trim }: { uri: string; duration: number; trim: { start: number; end: number } }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  // Loop within trim window
  useEffect(() => {
    const sub = player.addListener('timeUpdate' as any, (data: any) => {
      if (typeof data?.currentTime === 'number') {
        if (data.currentTime >= trim.end) {
          player.currentTime = trim.start;
        }
      }
    });
    return () => sub?.remove?.();
  }, [player, trim]);

  return (
    <VideoView
      player={player}
      style={styles.canvasMedia}
      nativeControls={false}
      contentFit="contain"
    />
  );
}

function VideoTrimBar({ duration, value, onChange }: { duration: number; value: { start: number; end: number }; onChange: (v: { start: number; end: number }) => void }) {
  const fmt = (s: number) => `${Math.floor(s)}s`;
  return (
    <View style={styles.trimWrap}>
      <View style={styles.trimHeader}>
        <Scissors size={14} color={colors.cyan} />
        <Text style={styles.trimLabel}>TRIM</Text>
        <Text style={styles.trimRange}>
          {fmt(value.start)} → {fmt(value.end)}
        </Text>
      </View>
      <View style={styles.trimSliders}>
        <Text style={styles.trimMini}>Start</Text>
        <View style={styles.trimTrack}>
          {Array.from({ length: 11 }).map((_, i) => (
            <Pressable
              key={`s${i}`}
              onPress={() => {
                const s = Math.round((i / 10) * duration);
                onChange({ start: Math.min(s, value.end - 1), end: value.end });
              }}
              style={[
                styles.trimNotch,
                Math.round((value.start / duration) * 10) === i && styles.trimNotchActive,
              ]}
            />
          ))}
        </View>
      </View>
      <View style={styles.trimSliders}>
        <Text style={styles.trimMini}>End</Text>
        <View style={styles.trimTrack}>
          {Array.from({ length: 11 }).map((_, i) => (
            <Pressable
              key={`e${i}`}
              onPress={() => {
                const e = Math.max(value.start + 1, Math.round((i / 10) * duration));
                onChange({ start: value.start, end: e });
              }}
              style={[
                styles.trimNotch,
                Math.round((value.end / duration) * 10) === i && styles.trimNotchActive,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ----- Helpers -----
async function b64ToTempUri(b64: string, mime: string): Promise<string> {
  if (Platform.OS === 'web') {
    return `data:${mime};base64,${b64}`;
  }
  // Native: write to a temp file under cache directory and return file://
  const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : mime.includes('mp4') ? 'mp4' : 'bin';
  const filename = `aiforge_${Date.now()}.${ext}`;
  const dir = (FileSystem as any).cacheDirectory || (FileSystem as any).Paths?.cache?.uri || '';
  const uri = `${dir}${filename}`;
  try {
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType?.Base64 || ('base64' as any) });
  } catch {
    // FileSystem API surface varies; fall back to data URI
    return `data:${mime};base64,${b64}`;
  }
  return uri;
}

async function fileUriToB64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    // Convert blob to base64
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const r = reader.result as string;
        const idx = r.indexOf('base64,');
        resolve(idx >= 0 ? r.slice(idx + 7) : r);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  try {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: (FileSystem.EncodingType?.Base64 || 'base64') as any,
    });
  } catch {
    return '';
  }
}

// ----- Styles -----
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#0A0A14',
    borderWidth: 1, borderColor: '#ffffff14',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnActive: { borderColor: colors.green + 'AA', backgroundColor: colors.green + '14' },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  title: { color: colors.text, fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: 18 },
  // Tool grid
  toolGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginBottom: 18,
  },
  toolBtn: {
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#0A0A14',
    borderWidth: 1, borderColor: '#ffffff10',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minWidth: 90,
  },
  toolBtnActive: { borderColor: colors.green + '88' },
  toolBtnHighlight: { backgroundColor: colors.green, borderColor: colors.green },
  toolText: { color: colors.text, fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
  // Dropzone
  dropzone: {
    backgroundColor: '#0A0A14',
    borderColor: '#ffffff14',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 24,
    alignItems: 'center',
    gap: 14,
  },
  dropzoneIconStack: { width: 80, height: 80, marginBottom: 4, alignItems: 'center', justifyContent: 'center' },
  dropzoneLayer: {
    position: 'absolute',
    width: 60, height: 60, borderRadius: 12,
    borderWidth: 1, borderColor: '#ffffff22',
  },
  dropzoneTitle: { color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, paddingHorizontal: 22,
    borderRadius: radius.pill, minWidth: 200,
  },
  primaryBtnText: { color: '#000', fontWeight: '900', letterSpacing: 0.5 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: radius.pill,
    borderColor: '#ffffff22', borderWidth: 1,
    backgroundColor: '#06060c',
    minWidth: 200,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '700' },
  // Canvas
  canvasWrap: {
    backgroundColor: '#06060c',
    borderColor: '#ffffff10', borderWidth: 1,
    borderRadius: radius.lg,
    aspectRatio: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  imageInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  canvasMedia: { width: '100%', height: '100%' },
  overlay: { position: 'absolute' },
  cropBox: {
    position: 'absolute',
    borderColor: colors.cyan,
    borderWidth: 2,
    backgroundColor: 'rgba(0,240,255,0.06)',
  },
  toolHint: { color: colors.textDim, fontSize: 11, marginTop: 10, textAlign: 'center' },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 18, marginBottom: 8 },
  aiRow: { flexDirection: 'row', gap: 8 },
  aiBtn: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radius.md, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(10,10,20,0.6)',
  },
  aiBtnText: { fontWeight: '900', fontSize: 12, letterSpacing: 0.3 },
  captionCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: '#0A0A14',
    borderColor: colors.yellow + '55',
    borderWidth: 1,
  },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  captionTitle: { color: colors.yellow, fontWeight: '900', fontSize: 11, letterSpacing: 1.5, flex: 1 },
  captionHook: { color: colors.text, fontWeight: '900', fontSize: 16, marginBottom: 4 },
  captionBody: { color: colors.textDim, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  captionTags: { color: colors.cyan, fontSize: 12, fontWeight: '700' },
  // Trim
  trimWrap: { marginTop: 10, gap: 6 },
  trimHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trimLabel: { color: colors.cyan, fontWeight: '900', letterSpacing: 1, fontSize: 11, flex: 1 },
  trimRange: { color: colors.text, fontWeight: '800', fontSize: 12 },
  trimSliders: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trimMini: { color: colors.textDim, fontSize: 11, width: 36 },
  trimTrack: { flexDirection: 'row', flex: 1, gap: 4 },
  trimNotch: { flex: 1, height: 12, borderRadius: 4, backgroundColor: '#ffffff14' },
  trimNotchActive: { backgroundColor: colors.cyan },
  // Busy
  busyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(2,2,8,0.85)',
    alignItems: 'center', justifyContent: 'center',
    gap: 14,
  },
  busyText: { color: colors.cyan, fontWeight: '700', letterSpacing: 0.5 },
  // Modal
  modalScrim: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'flex-end',
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#0A0A14',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, gap: 14,
    borderTopWidth: 1, borderColor: '#ffffff14',
  },
  modalTitle: { color: colors.text, fontWeight: '900', fontSize: 18 },
  modalInput: {
    backgroundColor: '#06060c',
    color: colors.text, fontSize: 16,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radius.md,
    borderColor: '#ffffff14', borderWidth: 1,
  },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: '#fff' },
  styleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  styleCard: {
    width: (SCREEN_W - 60) / 2 - 5,
    height: 64,
    borderWidth: 1, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#06060c',
  },
  styleLabel: { fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  // Library
  libGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 20 },
  libCard: {
    width: (SCREEN_W - 60) / 2 - 5,
    backgroundColor: '#06060c',
    borderRadius: radius.md,
    borderWidth: 1, borderColor: '#ffffff14',
    overflow: 'hidden',
  },
  libThumb: { width: '100%', height: 120 },
  libCardTitle: { color: colors.text, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingTop: 6 },
  libCardKind: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 8, paddingBottom: 6 },
});
