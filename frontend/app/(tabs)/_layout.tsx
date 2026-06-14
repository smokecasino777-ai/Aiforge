import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Home, Sparkles, LayoutGrid, Crown, User } from 'lucide-react-native';
import { colors, radius } from '@/src/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';

/**
 * Custom tab bar with:
 *  - Reanimated sliding indicator pill that springs to the active tab
 *  - Per-icon focus scale animation
 *  - Floating gradient "Create" button center-stage
 *  - BlurView + soft cyberpunk gradient backdrop
 *  - Haptic feedback on every tap
 */
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const [layout, setLayout] = useState({ width: 0, height: 72 });
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);

  const tabCount = state.routes.length;
  const tabWidth = layout.width / Math.max(tabCount, 1);
  // The indicator is sized to ~70% of a tab cell
  const PILL_W = Math.min(56, tabWidth * 0.7);

  useEffect(() => {
    const center = state.index * tabWidth + (tabWidth - PILL_W) / 2;
    indicatorX.value = withSpring(center, { damping: 18, stiffness: 220 });
    indicatorW.value = withTiming(PILL_W, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [PILL_W, indicatorW, indicatorX, state.index, tabWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - layout.width) > 0.5) setLayout({ width, height });
  };

  return (
    <View style={styles.barWrap} pointerEvents="box-none">
      <View style={styles.bar} onLayout={onLayout}>
        {/* Background */}
        <View style={StyleSheet.absoluteFill}>
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,18,0.85)', borderRadius: 24 }]} />
          <LinearGradient
            colors={[colors.cyan + '44', 'transparent', colors.purple + '33']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 1, width: '100%', position: 'absolute', top: 0 }}
          />
        </View>

        {/* Sliding indicator */}
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, indicatorStyle]}
        >
          <LinearGradient
            colors={[colors.cyan, colors.purple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[StyleSheet.absoluteFill, styles.indicatorGrad]}
          />
        </Animated.View>

        {/* Tab buttons */}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (Platform.OS !== 'web') {
              Haptics.selectionAsync().catch(() => {});
            }
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
          };
          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tab}
              testID={`tab-${route.name}`}
            >
              <TabIcon name={route.name} focused={focused} />
              <Text
                style={[
                  route.name === 'create' ? styles.labelCreate : styles.label,
                  focused && { color: route.name === 'create' ? colors.green : colors.cyan },
                ]}
              >
                {options.title || route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const scale = useSharedValue(focused ? 1.1 : 1);
  useEffect(() => {
    scale.value = withSpring(focused ? 1.1 : 1, { damping: 14, stiffness: 220 });
  }, [focused, scale]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (name === 'create') {
    return (
      <Animated.View style={[styles.createIcon, iconStyle]}>
        <LinearGradient
          colors={[colors.cyan, colors.green, colors.purple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.createGrad, focused && styles.createGradActive]}
        >
          <Sparkles size={22} color="#000" strokeWidth={2.6} />
        </LinearGradient>
      </Animated.View>
    );
  }

  const color = focused ? colors.cyan : colors.textMuted;
  const size = focused ? 24 : 22;
  const sw = focused ? 2.4 : 1.8;
  return (
    <Animated.View style={iconStyle}>
      {name === 'index' ? <Home size={size} color={color} strokeWidth={sw} /> :
       name === 'library' ? <LayoutGrid size={size} color={color} strokeWidth={sw} /> :
       name === 'plans' ? <Crown size={size} color={color} strokeWidth={sw} /> :
       name === 'profile' ? <User size={size} color={color} strokeWidth={sw} /> :
       null}
    </Animated.View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="plans" options={{ title: 'Plans' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    position: 'absolute',
    left: 14, right: 14, bottom: 16,
  },
  bar: {
    height: 72,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingBottom: 8,
    overflow: 'hidden',
    boxShadow: '0px 0px 18px rgba(0,240,255,0.25)' as any,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 8,
    gap: 4,
  },
  label: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
    color: colors.textMuted,
  },
  labelCreate: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.5,
    color: colors.cyan,
  },
  indicator: {
    position: 'absolute',
    top: 6,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  indicatorGrad: { borderRadius: 999 },
  createIcon: { marginTop: -16 },
  createGrad: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 0px 16px rgba(0,255,102,0.7)',
    borderWidth: 2,
    borderColor: '#020208',
  },
  createGradActive: {
    boxShadow: '0px 0px 22px rgba(0,255,102,1)',
  },
});
