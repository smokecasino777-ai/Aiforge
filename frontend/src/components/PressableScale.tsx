import React from 'react';
import { Pressable, ViewStyle, PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

type Props = PressableProps & {
  style?: ViewStyle | ViewStyle[];
  haptic?: boolean;
  scale?: number;
  children: React.ReactNode;
};

export default function PressableScale({
  style,
  haptic = true,
  scale: target = 0.95,
  children,
  onPress,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[aStyle, style]}>
      <Pressable
        {...rest}
        onPressIn={(e) => {
          scale.value = withSpring(target, { damping: 18, stiffness: 280 });
          opacity.value = withTiming(0.85, { duration: 80 });
          if (haptic) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          rest.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSequence(
            withSpring(1.02, { damping: 14, stiffness: 200 }),
            withSpring(1, { damping: 14, stiffness: 200 }),
          );
          opacity.value = withTiming(1, { duration: 120 });
          rest.onPressOut?.(e);
        }}
        onPress={onPress}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
