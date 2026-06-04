import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, View, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '@/src/theme/colors';

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  variant?: 'primary' | 'outline' | 'ghost';
  testID?: string;
  small?: boolean;
};

export default function GradientButton({
  title,
  onPress,
  loading,
  disabled,
  icon,
  style,
  variant = 'primary',
  testID,
  small,
}: Props) {
  const inactive = disabled || loading;
  if (variant === 'outline') {
    return (
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        disabled={inactive}
        activeOpacity={0.85}
        style={[styles.outline, small && styles.small, style, inactive && { opacity: 0.5 }]}
      >
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
        <Text style={styles.outlineText}>{title}</Text>
      </TouchableOpacity>
    );
  }
  if (variant === 'ghost') {
    return (
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        disabled={inactive}
        activeOpacity={0.7}
        style={[styles.ghost, small && styles.small, style, inactive && { opacity: 0.5 }]}
      >
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
        <Text style={styles.ghostText}>{title}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      style={[{ borderRadius: radius.pill }, style, inactive && { opacity: 0.6 }]}
    >
      <LinearGradient
        colors={[colors.cyan, colors.green, colors.cyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.primary, small && styles.small]}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
            <Text style={styles.primaryText}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    gap: 10,
    boxShadow: '0px 6px 18px rgba(0,255,102,0.55)',
  },
  small: { paddingVertical: 12, paddingHorizontal: 18 },
  primaryText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  outline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 10,
  },
  outlineText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  ghostText: { color: colors.textDim, fontWeight: '600', fontSize: 14 },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
});
