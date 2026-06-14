import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  useAnimatedProps,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import {
  ArrowLeft,
  Sparkles,
  Wand2,
  Send,
  CheckCheck,
  RefreshCw,
  Save,
  UserCircle2,
} from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import PressableScale from '@/src/components/PressableScale';
import PulsingLogo from '@/src/components/Logo';
import GradientButton from '@/src/components/GradientButton';
import { colors, radius } from '@/src/theme/colors';
import { api } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STYLES = [
  { id: 'cyberpunk', label: 'Cyberpunk', emoji: '🌃', color: colors.cyan, blurb: 'Neon implants · holo glow' },
  { id: 'anime', label: 'Anime', emoji: '✨', color: colors.green, blurb: 'Cel-shaded · expressive' },
  { id: 'neon_noir', label: 'Neon Noir', emoji: '🌌', color: colors.pink, blurb: 'Rain-slick · cinematic' },
  { id: 'fantasy', label: 'Fantasy', emoji: '🧝', color: colors.yellow, blurb: 'Mythic · painterly' },
  { id: 'pixel_art', label: 'Pixel Art', emoji: '👾', color: colors.purple, blurb: '16-bit · retro' },
  { id: 'cinematic', label: 'Cinematic', emoji: '🎬', color: colors.red, blurb: 'Hollywood · filmic' },
];

const PROMPT_IDEAS = [
  'A confident warrior with neon braids',
  'A wise wizard with cosmic eyes',
  'A street-style hacker in shades',
  'A futuristic pilot with chrome helmet',
  'A celestial mystic with star-marked skin',
  'A samurai with a holographic katana',
];

export default function AvatarMaker() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('cyberpunk');
  const [generated, setGenerated] = useState<{ image_b64: string; media_mime: string; style: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [activating, setActivating] = useState(false);

  // Loading ring animation
  const ringProgress = useSharedValue(0);
  React.useEffect(() => {
    if (busy) {
      ringProgress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      );
    } else {
      ringProgress.value = withTiming(0, { duration: 300 });
    }
  }, [busy, ringProgress]);
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: 360 - ringProgress.value * 360,
  } as any));

  const onGenerate = async () => {
    const p = prompt.trim();
    if (p.length < 3) {
      Alert.alert('Avatar', 'Describe your avatar in a sentence (e.g. "a confident hacker with neon hair").');
      return;
    }
    try {
      setBusy(true);
      const r = await api.avatarGenerate(p, style);
      setGenerated({ image_b64: r.image_b64, media_mime: r.media_mime, style: r.style });
    } catch (e: any) {
      Alert.alert('Avatar', e.message || 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  const onUseAsProfile = async () => {
    if (!generated) return;
    try {
      setActivating(true);
      await api.avatarSet(generated.image_b64, generated.media_mime);
      await refresh();
      Alert.alert('Profile updated', 'Your new avatar is live!', [
        { text: 'Stay here', style: 'cancel' },
        { text: 'Go to Profile', onPress: () => router.replace('/(tabs)/profile' as any) },
      ]);
    } catch (e: any) {
      Alert.alert('Avatar', e.message || 'Failed to set profile picture');
    } finally {
      setActivating(false);
    }
  };

  const styleMeta = STYLES.find((s) => s.id === style) || STYLES[0];

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
            <PressableScale onPress={() => router.back()} testID="avatar-back">
              <View style={styles.iconBtn}><ArrowLeft size={18} color={colors.text} /></View>
            </PressableScale>
            <PulsingLogo size={28} textSize={16} />
            <View style={{ width: 36 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Title */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.titleBlock}>
              <View style={styles.titleRow}>
                <UserCircle2 size={26} color={colors.pink} />
                <Text style={styles.title}>AVATAR MAKER</Text>
              </View>
              <Text style={styles.subtitle}>
                Forge a cyberpunk-grade portrait from a single sentence.
              </Text>
            </Animated.View>

            {/* Preview Card */}
            <Animated.View entering={FadeIn.delay(80).duration(400)} style={[styles.preview, { borderColor: styleMeta.color + '55' }]}>
              <LinearGradient
                colors={[styleMeta.color + '22', 'transparent']}
                style={StyleSheet.absoluteFill}
              />

              {/* Avatar circle */}
              <View style={styles.avatarFrame}>
                {/* Loader ring */}
                {busy && (
                  <Svg width={240} height={240} style={StyleSheet.absoluteFill}>
                    <AnimatedCircle
                      cx={120}
                      cy={120}
                      r={114}
                      stroke={styleMeta.color}
                      strokeWidth={3}
                      fill="none"
                      strokeDasharray={360}
                      strokeLinecap="round"
                      animatedProps={ringProps}
                      transform="rotate(-90 120 120)"
                    />
                  </Svg>
                )}
                <View style={styles.avatarCircle}>
                  {generated ? (
                    <Image
                      source={{ uri: `data:${generated.media_mime};base64,${generated.image_b64}` }}
                      style={styles.avatarImg}
                    />
                  ) : user?.picture ? (
                    <Image
                      source={{ uri: user.picture }}
                      style={styles.avatarImg}
                    />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: styleMeta.color + '22' }]}>
                      <UserCircle2 size={88} color={styleMeta.color} strokeWidth={1.2} />
                    </View>
                  )}
                </View>
              </View>

              {/* Status pill */}
              <View style={[styles.statusPill, { borderColor: styleMeta.color + '88' }]}>
                <View style={[styles.pillDot, { backgroundColor: busy ? colors.yellow : generated ? colors.green : styleMeta.color }]} />
                <Text style={[styles.pillText, { color: styleMeta.color }]}>
                  {busy
                    ? 'FORGING…'
                    : generated
                      ? `${styleMeta.label.toUpperCase()} · READY`
                      : `${styleMeta.label.toUpperCase()} STYLE`}
                </Text>
              </View>

              {/* Actions */}
              {generated ? (
                <View style={styles.actionRow}>
                  <PressableScale onPress={onGenerate} testID="avatar-retry">
                    <View style={styles.outlineBtn}>
                      <RefreshCw size={14} color={colors.text} />
                      <Text style={styles.outlineBtnText}>RETRY</Text>
                    </View>
                  </PressableScale>
                  <PressableScale onPress={onUseAsProfile} testID="avatar-use">
                    <LinearGradient
                      colors={[styleMeta.color, '#000']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.useBtn}
                    >
                      {activating ? (
                        <ActivityIndicator color="#000" />
                      ) : (
                        <>
                          <CheckCheck size={16} color="#000" />
                          <Text style={styles.useBtnText}>USE AS PROFILE</Text>
                        </>
                      )}
                    </LinearGradient>
                  </PressableScale>
                </View>
              ) : null}
            </Animated.View>

            {/* Styles */}
            <Animated.View entering={FadeInDown.delay(120).duration(400)}>
              <Text style={styles.sectionLabel}>STYLE</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.styleRow}
              >
                {STYLES.map((s) => {
                  const active = s.id === style;
                  return (
                    <PressableScale key={s.id} onPress={() => setStyle(s.id)} testID={`style-${s.id}`}>
                      <View
                        style={[
                          styles.styleCard,
                          active && { borderColor: s.color, boxShadow: `0px 0px 18px ${s.color}66` },
                        ]}
                      >
                        <LinearGradient
                          colors={[active ? s.color + '44' : 'transparent', 'transparent']}
                          style={StyleSheet.absoluteFill}
                        />
                        <Text style={styles.styleEmoji}>{s.emoji}</Text>
                        <Text style={[styles.styleLabel, active && { color: s.color }]}>{s.label}</Text>
                        <Text style={styles.styleBlurb}>{s.blurb}</Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </ScrollView>
            </Animated.View>

            {/* Idea pills */}
            <Animated.View entering={FadeInDown.delay(160).duration(400)}>
              <Text style={styles.sectionLabel}>IDEAS</Text>
              <View style={styles.ideaWrap}>
                {PROMPT_IDEAS.map((p) => (
                  <PressableScale key={p} onPress={() => setPrompt(p)}>
                    <View style={styles.ideaPill}>
                      <Sparkles size={11} color={colors.cyan} />
                      <Text style={styles.ideaText}>{p}</Text>
                    </View>
                  </PressableScale>
                ))}
              </View>
            </Animated.View>

            <View style={{ height: 120 }} />
          </ScrollView>

          {/* Prompt bar (sticky) */}
          <Animated.View entering={FadeInDown.delay(240).duration(400)} style={styles.promptBar}>
            <View style={[styles.promptWrap, { borderColor: styleMeta.color + '55' }]}>
              <Wand2 size={16} color={styleMeta.color} style={{ marginLeft: 12 }} />
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="Describe yourself…"
                placeholderTextColor={colors.textMuted}
                style={styles.promptInput}
                maxLength={200}
                onSubmitEditing={onGenerate}
                returnKeyType="go"
                testID="avatar-prompt"
                editable={!busy}
              />
            </View>
            <PressableScale onPress={onGenerate} testID="avatar-generate" disabled={busy}>
              <LinearGradient
                colors={busy ? ['#333', '#111'] : [styleMeta.color, '#000']}
                style={styles.sendBtn}
              >
                {busy ? <ActivityIndicator color="#000" /> : <Send size={18} color="#000" />}
              </LinearGradient>
            </PressableScale>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#0A0A14',
    borderWidth: 1, borderColor: '#ffffff14',
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 18, paddingTop: 4 },
  titleBlock: { paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  // Preview card
  preview: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: 'center',
    backgroundColor: '#0A0A14',
    overflow: 'hidden',
    gap: 14,
  },
  avatarFrame: { width: 240, height: 240, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarCircle: {
    width: 220, height: 220, borderRadius: 110,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#06060c',
    borderWidth: 2, borderColor: '#ffffff14',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1,
    backgroundColor: 'rgba(2,2,8,0.6)',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  actionRow: { flexDirection: 'row', gap: 10 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: '#06060c',
    borderColor: '#ffffff22', borderWidth: 1,
  },
  outlineBtnText: { color: colors.text, fontWeight: '900', fontSize: 12, letterSpacing: 0.7 },
  useBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 11,
    borderRadius: radius.pill,
  },
  useBtnText: { color: '#000', fontWeight: '900', fontSize: 12, letterSpacing: 0.7 },
  // Sections
  sectionLabel: { color: colors.textMuted, fontWeight: '900', letterSpacing: 1.4, fontSize: 11, marginTop: 18, marginBottom: 8 },
  styleRow: { gap: 10, paddingRight: 18 },
  styleCard: {
    width: 130,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: '#0A0A14',
    borderWidth: 1, borderColor: '#ffffff14',
    gap: 4,
    overflow: 'hidden',
  },
  styleEmoji: { fontSize: 22 },
  styleLabel: { color: colors.text, fontWeight: '900', fontSize: 13 },
  styleBlurb: { color: colors.textDim, fontSize: 10 },
  ideaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ideaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: '#0A0A14',
    borderWidth: 1, borderColor: colors.cyan + '44',
  },
  ideaText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  // Prompt bar
  promptBar: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderTopWidth: 1, borderColor: '#ffffff0E',
    backgroundColor: 'rgba(2,2,8,0.85)',
  },
  promptWrap: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0A0A14',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingRight: 6,
    height: 50,
  },
  promptInput: {
    flex: 1, color: colors.text, fontSize: 14,
    paddingHorizontal: 10, paddingVertical: 10,
  },
  sendBtn: {
    width: 50, height: 50,
    borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
});
