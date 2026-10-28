import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageIcon, Video, Box, Sparkles, MessageSquare, Crown, ArrowRight } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PulsingLogo from '@/src/components/Logo';
import { colors, radius } from '@/src/theme/colors';
import { completeOnboarding } from '@/src/lib/onboarding';

const SLIDES = [
  {
    Icon: Sparkles,
    color: colors.cyan,
    eyebrow: 'WELCOME',
    title: 'Forge anything you can dream',
    body: 'A creative studio for quoted AI images, local video editing and real STL tools. Model availability and funding are checked before creating.',
  },
  {
    Icon: ImageIcon,
    color: colors.green,
    eyebrow: 'IMAGES',
    title: 'Images with upfront costs',
    body: 'Review a credit quote before creating an image. Only priced, funded AI models are available; your creative work stays in your private Library.',
  },
  {
    Icon: Video,
    color: colors.purple,
    eyebrow: 'VIDEOS',
    title: 'Edit clips. Export real video.',
    body: 'Import a clip, trim, rotate, change speed or mute, and save an actual MP4. AI video generation is paused until a supported replacement is verified.',
  },
  {
    Icon: Box,
    color: colors.yellow,
    eyebrow: '3D + SCAD',
    title: 'Real STL tools. Editable source.',
    body: 'Import an STL, inspect dimensions, scale and rotate geometry, then export a copy. OpenSCAD source editing is separate; inspect printability in your slicer.',
  },
  {
    Icon: MessageSquare,
    color: colors.red,
    eyebrow: 'AI ASSIST',
    title: 'Your creative co-pilot',
    body: 'Sharpen prompts and brainstorm with bounded AI chat. Choose Economy or a verified higher-quality model and approve the quote first.',
  },
  {
    Icon: Crown,
    color: colors.pink,
    eyebrow: 'CLEAR COSTS',
    title: 'Create with clear costs',
    body: 'Review credits before each AI action. Monthly allowances and one-time packs keep spending predictable. Introductory credits depend on funded availability.',
  },
];

export default function Onboarding() {
  const { width: W } = useWindowDimensions();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try { await completeOnboarding(); router.replace('/(auth)/login'); }
    finally { setFinishing(false); }
  };

  const next = () => {
    if (page < SLIDES.length - 1) {
      const np = page + 1;
      scrollRef.current?.scrollTo({ x: np * W, animated: true });
      setPage(np);
    } else {
      finish();
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / W);
    if (p !== page) setPage(p);
  };

  return (
    <View style={styles.root} testID="onboarding-screen">
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <PulsingLogo size={32} textSize={18} />
          <Pressable onPress={finish} testID="skip-onboarding" disabled={finishing} accessibilityRole="button"><Text style={styles.skip}>Skip</Text></Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={{ flex: 1 }}
          testID="onboarding-scroll"
        >
          {SLIDES.map((s, idx) => (
            <View key={idx} style={[styles.slide, { width: W }]}>
              <View style={[styles.iconWrap, { borderColor: s.color + '88' }]}>
                <LinearGradient
                  colors={[s.color + '40', 'transparent']}
                  style={StyleSheet.absoluteFill}
                />
                <s.Icon size={64} color={s.color} strokeWidth={1.4} />
              </View>
              <Text testID={`onboarding-eyebrow-${idx}`} style={[styles.eyebrow, { color: s.color }]}>{s.eyebrow}</Text>
              <Text testID={`onboarding-title-${idx}`} style={styles.title}>{s.title}</Text>
              <Text testID={`onboarding-body-${idx}`} style={styles.body}>{s.body}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === page && styles.dotActive,
                i === page && { backgroundColor: SLIDES[i].color },
              ]}
            />
          ))}
        </View>

        <View style={styles.cta}>
          <GradientButton
            title={page === SLIDES.length - 1 ? 'Enter AiForge' : 'Next'}
            onPress={next}
            disabled={finishing}
            loading={finishing}
            icon={<ArrowRight size={16} color="#000" />}
            testID="onboarding-next"
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  skip: { color: colors.textDim, fontSize: 14, fontWeight: '700', padding: 12, minHeight: 44 },
  slide: {
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  iconWrap: {
    width: 168,
    height: 168,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(10,10,20,0.5)',
  },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 3, marginTop: 6 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', textAlign: 'center', lineHeight: 32, letterSpacing: -0.5 },
  body: { color: colors.textDim, fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' },
  dotActive: { width: 22, height: 8, borderRadius: 4 },
  cta: { paddingHorizontal: 24, paddingBottom: 30 },
});
