import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
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
import { storage } from '@/src/utils/storage';

const { width: W } = Dimensions.get('window');
const ONBOARDED_KEY = 'aiforge_onboarded';

const SLIDES = [
  {
    Icon: Sparkles,
    color: colors.cyan,
    eyebrow: 'WELCOME',
    title: 'Forge anything you can dream',
    body: 'AiForge turns words into images, videos, 3D models and STL-ready meshes — all from one cyberpunk-grade studio.',
  },
  {
    Icon: ImageIcon,
    color: colors.green,
    eyebrow: 'IMAGES',
    title: 'Nano Banana · ultra-fast images',
    body: 'Generate cinematic stills powered by Gemini 3.1 Flash Image. Cyberpunk samurai, holographic dragons — your call.',
  },
  {
    Icon: Video,
    color: colors.purple,
    eyebrow: 'VIDEOS',
    title: 'Sora 2 video, with a built-in trim editor',
    body: 'Spin up 4–12s clips, then CapCut-style trim the result. Auto-loops up to 60 seconds.',
  },
  {
    Icon: Box,
    color: colors.yellow,
    eyebrow: '3D + SCAD',
    title: 'From prompt to STL mesh',
    body: 'Describe an object → get an isometric preview AND OpenSCAD code you can pop straight into a 3D printer pipeline.',
  },
  {
    Icon: MessageSquare,
    color: colors.red,
    eyebrow: 'AI ASSIST',
    title: 'Your creative co-pilot',
    body: 'Multi-turn chat with Claude Sonnet to sharpen prompts, brainstorm shots, and unlock ideas you didn’t know you had.',
  },
  {
    Icon: Crown,
    color: colors.pink,
    eyebrow: 'INVITE · EARN',
    title: 'Refer friends, get +20/day',
    body: 'Share your code. When friends sign up with it, you BOTH score +20 generations per day for a week.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const finish = async () => {
    await storage.setItem(ONBOARDED_KEY, '1');
    router.replace('/(auth)/login');
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
    <View style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <PulsingLogo size={32} textSize={18} />
          <Text style={styles.skip} onPress={finish} testID="skip-onboarding">Skip</Text>
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
              <Text style={[styles.eyebrow, { color: s.color }]}>{s.eyebrow}</Text>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
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
  skip: { color: colors.textDim, fontSize: 14, fontWeight: '700', padding: 8 },
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
