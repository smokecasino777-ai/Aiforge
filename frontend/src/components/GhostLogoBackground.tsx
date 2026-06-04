import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');

const LOGO = require('../../assets/images/aiforge-logo.png');

/**
 * Ghostly background logo that breathes (slow opacity wave) with a quick
 * double heart-beat pulse on the scale every ~3.5 seconds.
 */
export default function GhostLogoBackground() {
  const opacity = useSharedValue(0.04);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Slow breathing (in & out)
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.16, { duration: 3500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.04, { duration: 3500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    // Heartbeat: small double-thump then rest
    scale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(1.0, { duration: 160, easing: Easing.in(Easing.quad) }),
        withTiming(1.06, { duration: 200, easing: Easing.out(Easing.quad) }),
        withTiming(0.98, { duration: 240, easing: Easing.in(Easing.quad) }),
        withDelay(2700, withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) })),
      ),
      -1,
      false,
    );
  }, [opacity, scale]);

  const aStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const size = Math.min(W, H) * 0.88;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { pointerEvents: 'none' as any }]}>
      <Animated.View style={[{ width: size, height: size }, aStyle]}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  logo: { width: '100%', height: '100%' },
});
