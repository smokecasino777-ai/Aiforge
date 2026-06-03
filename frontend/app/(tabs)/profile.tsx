import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { LogOut, Mail, Crown, BarChart2, Shield, Info } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius, PLAN_META } from '@/src/theme/colors';
import { useAuth } from '@/src/context/AuthContext';

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const onLogout = () => {
    Alert.alert('Sign out', 'Sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const meta = PLAN_META[user?.plan || 'free'] ?? PLAN_META.free;

  return (
    <View style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Profile</Text>

          <View style={styles.userCard}>
            <LinearGradient
              colors={meta.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>
                {(user?.name || user?.email || '?')[0].toUpperCase()}
              </Text>
            </LinearGradient>
            <Text style={styles.name}>{user?.name || 'AiForge Creator'}</Text>
            <View style={styles.emailRow}>
              <Mail size={12} color={colors.textDim} />
              <Text style={styles.email}>{user?.email}</Text>
            </View>
            <View
              style={[
                styles.planBadge,
                { borderColor: meta.color, backgroundColor: meta.color + '20' },
              ]}
            >
              <Crown size={12} color={meta.color} />
              <Text style={[styles.planBadgeText, { color: meta.color }]}>
                {(user?.plan || 'free').toUpperCase()} PLAN
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderColor: colors.cyan + '44' }]}>
              <BarChart2 size={16} color={colors.cyan} />
              <Text style={styles.statValue}>{user?.daily_used ?? 0}</Text>
              <Text style={styles.statLabel}>Used today</Text>
            </View>
            <View style={[styles.statCard, { borderColor: colors.green + '44' }]}>
              <Crown size={16} color={colors.green} />
              <Text style={styles.statValue}>{user?.daily_limit ?? 5}</Text>
              <Text style={styles.statLabel}>Daily limit</Text>
            </View>
          </View>

          <PressableScale
            onPress={() => router.push('/(tabs)/plans')}
            testID="profile-upgrade"
          >
            <View style={styles.upgradeCard}>
              <LinearGradient
                colors={[colors.cyan + '22', 'transparent']}
                style={StyleSheet.absoluteFill}
              />
              <Crown size={22} color={colors.yellow} />
              <View style={{ flex: 1 }}>
                <Text style={styles.upgradeTitle}>Upgrade your plan</Text>
                <Text style={styles.upgradeSub}>Unlock unlimited generations & priority queue.</Text>
              </View>
            </View>
          </PressableScale>

          <View style={styles.menu}>
            <MenuItem icon={<Shield size={16} color={colors.textDim} />} label="Privacy & Data" />
            <MenuItem
              icon={<Info size={16} color={colors.textDim} />}
              label="About AiForge"
              sub="Multi-AI creation platform"
            />
          </View>

          <GradientButton
            title="Sign Out"
            onPress={onLogout}
            variant="outline"
            icon={<LogOut size={16} color={colors.red} />}
            testID="logout-btn"
            style={{ marginTop: 14 }}
          />

          <View style={{ height: 130 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function MenuItem({ icon, label, sub }: { icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <View style={styles.menuItem}>
      <View style={styles.menuIcon}>{icon}</View>
      <View>
        <Text style={styles.menuLabel}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 18, paddingBottom: 30, gap: 16 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginTop: 4 },
  userCard: {
    backgroundColor: 'rgba(10,10,20,0.7)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    padding: 26,
    gap: 8,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#000', fontWeight: '900', fontSize: 28 },
  name: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 6 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  email: { color: colors.textDim, fontSize: 13 },
  planBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1,
    marginTop: 8,
  },
  planBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    padding: 14,
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
  },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  statLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  upgradeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, backgroundColor: colors.bgElev,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cyan + '55',
    overflow: 'hidden',
  },
  upgradeTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  upgradeSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  menu: { gap: 4, marginTop: 6 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: colors.bgElev,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  menuIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
  menuLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  menuSub: { color: colors.textDim, fontSize: 11 },
});
