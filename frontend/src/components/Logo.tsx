import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
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

  const aStyle = useAnimatedStyle(() => ({
    shadowOpacity: glow.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.row, style]} testID={testID}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 3,
            shadowColor: colors.cyan,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 0 },
          },
          aStyle,
        ]}
      >
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
