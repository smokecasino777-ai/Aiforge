import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/src/theme/colors';

const { width: W, height: H } = Dimensions.get('window');

type StarSpec = { x: number; y: number; size: number; opacity: number; delay: number };

function Star({ spec }: { spec: StarSpec }) {
  const opacity = useSharedValue(spec.opacity * 0.3);
  useEffect(() => {
    opacity.value = withDelay(
      spec.delay,
      withRepeat(
        withSequence(
          withTiming(spec.opacity, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
          withTiming(spec.opacity * 0.2, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );
  }, [opacity, spec]);

  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: spec.x,
          top: spec.y,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: '#fff',
        },
        aStyle,
      ]}
    />
  );
}

function ShootingStar({ delay }: { delay: number }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    tx.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(W * 1.2, { duration: 1800, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
    ty.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(H * 0.5, { duration: 1800, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
    op.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 200 }),
          withTiming(0, { duration: 1500 }),
          withTiming(0, { duration: 6000 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, tx, ty, op]);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: '25deg' }],
    opacity: op.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: -80,
          top: 60,
          width: 110,
          height: 2,
          borderRadius: 2,
          backgroundColor: colors.cyan,
          shadowColor: colors.cyan,
          shadowOpacity: 0.9,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        },
        aStyle,
      ]}
    />
  );
}

export default function StarryBackground() {
  const stars = useMemo<StarSpec[]>(() => {
    const arr: StarSpec[] = [];
    for (let i = 0; i < 70; i++) {
      arr.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: Math.random() * 2 + 0.6,
        opacity: Math.random() * 0.7 + 0.3,
        delay: Math.random() * 2000,
      });
    }
    return arr;
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
      <LinearGradient
        colors={['rgba(176,38,255,0.12)', 'transparent', 'rgba(0,240,255,0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,255,102,0.06)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {stars.map((s, i) => (
        <Star key={i} spec={s} />
      ))}
      <ShootingStar delay={1500} />
      <ShootingStar delay={6500} />
    </View>
  );
}
