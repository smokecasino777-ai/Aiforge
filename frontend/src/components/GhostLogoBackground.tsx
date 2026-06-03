import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';
import { colors } from '@/src/theme/colors';

const { width: W } = Dimensions.get('window');

export default function GhostLogoBackground() {
  const opacity = useSharedValue(0.06);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.14, { duration: 4500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.05, { duration: 4500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.98, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [opacity, scale]);

  const aStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const size = W * 0.95;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <Animated.View style={[{ width: size, height: size }, aStyle]}>
        <LinearGradient
          colors={[colors.cyan, colors.green, colors.purple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.box, { width: size, height: size, borderRadius: size / 3 }]}
        >
          <Sparkles size={size * 0.55} color="#000" strokeWidth={1} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  box: { alignItems: 'center', justifyContent: 'center' },
});
