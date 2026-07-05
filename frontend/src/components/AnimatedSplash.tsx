import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  Easing,
  ReduceMotion,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/src/theme/colors';

const { width: W, height: H } = Dimensions.get('window');

type Props = { onDone: () => void };

/**
 * Cyberpunk-grade animated splash:
 *  - radial halo expands behind the logo
 *  - the ✦ glyph scales in with bounce
 *  - 'Ai' + 'Forge' fade in one after the other
 *  - 4 horizontal beams sweep across the screen
 *  - the whole thing fades out and calls onDone() at ~1.7s
 */
export default function AnimatedSplash({ onDone }: Props) {
  const haloScale = useSharedValue(0.2);
  const haloOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.4);
  const logoOpacity = useSharedValue(0);
  const logoSpin = useSharedValue(0);
  const aiFade = useSharedValue(0);
  const forgeFade = useSharedValue(0);
  const beam = useSharedValue(0);
  const containerFade = useSharedValue(1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    // Step 1: halo expands
    haloOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
    haloScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });

    // Step 2: logo pops in with overshoot
    logoOpacity.value = withDelay(
      180,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }),
    );
    logoScale.value = withDelay(
      180,
      withSequence(
        withTiming(1.12, { duration: 380, easing: Easing.out(Easing.back(2)) }),
        withTiming(1, { duration: 220, easing: Easing.inOut(Easing.ease) }),
      ),
    );
    logoSpin.value = withDelay(
      180,
      withTiming(360, { duration: 1100, easing: Easing.out(Easing.cubic) }),
    );

    // Step 3: Ai fades in
    aiFade.value = withDelay(620, withTiming(1, { duration: 300 }));
    forgeFade.value = withDelay(820, withTiming(1, { duration: 300 }));

    // Step 4: beams sweep
    beam.value = withDelay(
      300,
      withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), 2, false),
    );

    // Step 5: subtle pulse
    pulse.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );

    // Step 6: fade out + done — force ReduceMotion.Never so callback ALWAYS
    // fires (Reanimated normally skips timing callbacks when the OS/browser
    // reports prefers-reduced-motion, which would leave the splash forever).
    const finishMs = 1900;
    const fadeMs = 280;
    containerFade.value = withDelay(
      finishMs,
      withTiming(0, { duration: fadeMs, reduceMotion: ReduceMotion.Never }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
  }, [aiFade, beam, containerFade, forgeFade, haloOpacity, haloScale, logoOpacity, logoScale, logoSpin, onDone, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
    opacity: haloOpacity.value,
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.55,
    transform: [{ scale: 0.95 + pulse.value * 0.18 }],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }, { rotate: `${logoSpin.value}deg` }],
    opacity: logoOpacity.value,
  }));
  const aiStyle = useAnimatedStyle(() => ({ opacity: aiFade.value, transform: [{ translateX: -8 + 8 * aiFade.value }] }));
  const forgeStyle = useAnimatedStyle(() => ({ opacity: forgeFade.value, transform: [{ translateX: 8 - 8 * forgeFade.value }] }));
  const containerStyle = useAnimatedStyle(() => ({ opacity: containerFade.value }));
  const beam1 = useAnimatedStyle(() => ({
    transform: [{ translateX: -W + beam.value * (2 * W) }],
    opacity: 0.6 - 0.4 * beam.value,
  }));
  const beam2 = useAnimatedStyle(() => ({
    transform: [{ translateX: -W + (beam.value * (2 * W) * 1.3) }],
    opacity: 0.4 - 0.3 * beam.value,
  }));

  return (
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.root, containerStyle]}>
      {/* Tap-to-skip backdrop */}
      <Pressable
        onPress={() => {
          // Cancel pending animations and finish immediately
          containerFade.value = withTiming(0, { duration: 180, reduceMotion: ReduceMotion.Never }, (finished) => {
            if (finished) runOnJS(onDone)();
          });
        }}
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Skip intro animation"
        testID="splash-skip"
      />

      {/* Backdrop gradient */}
      <LinearGradient
        colors={['#020208', '#06060c', '#020208']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Sweeping beams */}
      <Animated.View
        style={[
          styles.beam,
          { backgroundColor: colors.cyan, top: H * 0.4 },
          beam1,
        ]}
      />
      <Animated.View
        style={[
          styles.beam,
          { backgroundColor: colors.green, top: H * 0.6, height: 2 },
          beam2,
        ]}
      />

      {/* Radial halo behind the logo */}
      <Animated.View style={[styles.halo, haloStyle]}>
        <Svg width={360} height={360}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.cyan} stopOpacity="0.55" />
              <Stop offset="40%" stopColor={colors.green} stopOpacity="0.25" />
              <Stop offset="100%" stopColor={colors.bg} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={180} cy={180} r={180} fill="url(#halo)" />
        </Svg>
      </Animated.View>

      {/* Pulsing inner ring */}
      <Animated.View style={[styles.ring, pulseStyle]} />

      {/* Logo glyph */}
      <View style={styles.center}>
        <Animated.View style={[styles.logoBox, logoStyle]}>
          <LinearGradient
            colors={[colors.cyan, colors.green, colors.purple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoGrad}
          >
            <Text style={styles.glyph}>✦</Text>
          </LinearGradient>
        </Animated.View>
        <View style={styles.titleRow}>
          <Animated.Text style={[styles.title, { color: colors.cyan }, aiStyle]}>Ai</Animated.Text>
          <Animated.Text style={[styles.title, { color: colors.green }, forgeStyle]}>Forge</Animated.Text>
        </View>
        <Animated.Text style={[styles.tag, forgeStyle]}>FORGE THE FUTURE</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  halo: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 240, height: 240, borderRadius: 120,
    borderWidth: 1, borderColor: colors.cyan + '55',
  },
  logoBox: { width: 96, height: 96, borderRadius: 28 },
  logoGrad: {
    flex: 1,
    borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 0px 30px rgba(0,240,255,0.6)' } as any)
      : ({
          shadowColor: colors.cyan,
          shadowOpacity: 0.7,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 0 },
        } as any)),
  },
  glyph: { fontSize: 56, fontWeight: '900', color: '#000' },
  titleRow: { flexDirection: 'row', gap: 0, marginTop: 12 },
  title: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },
  tag: { color: colors.textDim, fontSize: 11, letterSpacing: 4, fontWeight: '900' },
  beam: {
    position: 'absolute',
    width: W,
    height: 1,
    left: 0,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 0px 8px rgba(0,240,255,0.8)' } as any)
      : ({
          shadowColor: colors.cyan,
          shadowOpacity: 0.8,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        } as any)),
  },
  skipHint: {
    position: 'absolute',
    bottom: 56,
    alignSelf: 'center',
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
  },
});
