import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Home, Sparkles, LayoutGrid, Crown, User } from 'lucide-react-native';
import { colors } from '@/src/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 16,
          height: 72,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          borderRadius: 24,
          elevation: 0,
          boxShadow: '0px 0px 18px rgba(0,240,255,0.25)',
        },
        tabBarBackground: () => (
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
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Home size={focused ? 24 : 22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ focused }) => (
            <View style={styles.createIcon}>
              <LinearGradient
                colors={[colors.cyan, colors.green, colors.purple]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.createGrad, focused && styles.createGradActive]}
              >
                <Sparkles size={22} color="#000" strokeWidth={2.6} />
              </LinearGradient>
            </View>
          ),
          tabBarLabelStyle: { fontSize: 10, fontWeight: '800', color: colors.cyan, marginBottom: 4 },
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <LayoutGrid size={focused ? 24 : 22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarIcon: ({ color, focused }) => (
            <Crown size={focused ? 24 : 22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <User size={focused ? 24 : 22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  createIcon: { marginTop: -16 },
  createGrad: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 0px 16px rgba(0,255,102,0.7)',
    borderWidth: 2,
    borderColor: '#020208',
  },
  createGradActive: {
    boxShadow: '0px 0px 22px rgba(0,255,102,1)',
  },
});
