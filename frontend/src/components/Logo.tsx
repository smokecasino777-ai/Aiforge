import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/src/theme/colors';

type Props = { size?: number; showText?: boolean; textSize?: number; style?: ViewStyle; testID?: string; pulse?: boolean };

export default function PulsingLogo({
  size = 44,
  showText = true,
  textSize = 22,
  style,
  testID,
  pulse = true,
}: Props) {
  const glow = useSharedValue(0.55);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!pulse) return;
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [glow, scale, pulse]);

  // Animate scale + an absolute glow view's opacity (boxShadow can't be animated
  // directly via Reanimated, so we layer a glowing halo View underneath).
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  const halo = (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: size / 3,
          backgroundColor: colors.cyan,
          pointerEvents: 'none' as any,
          // big soft glow (boxShadow is now the cross-platform API in RN 0.76+)
          ...(Platform.OS === 'web'
            ? { boxShadow: '0px 0px 22px rgba(0,240,255,0.85)' }
            : {
                shadowColor: colors.cyan,
                shadowRadius: 22,
                shadowOpacity: 0.85,
                shadowOffset: { width: 0, height: 0 },
              }),
        },
        haloStyle,
      ]}
    />
  );

  return (
    <View style={[styles.row, style]} testID={testID}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 3,
          },
          aStyle,
        ]}
      >
        {halo}
        <LinearGradient
          colors={[colors.cyan, colors.green, colors.purple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.box, { width: size, height: size, borderRadius: size / 3 }]}
        >
          <Text style={{ fontSize: size * 0.5, fontWeight: '900', color: '#000' }}>✦</Text>
        </LinearGradient>
      </Animated.View>
      {showText ? (
        <Text style={[styles.text, { fontSize: textSize }]}>
          <Text style={{ color: colors.cyan }}>Ai</Text>
          <Text style={{ color: colors.green }}>Forge</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '900', letterSpacing: -0.5 },
});
