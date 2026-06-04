import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Platform, Share } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { LogOut, Mail, Crown, BarChart2, Shield, Info, Gift, Share2, Copy, Trash2 } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius, PLAN_META } from '@/src/theme/colors';
import { useAuth } from '@/src/context/AuthContext';
import { api } from '@/src/api/client';

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [referral, setReferral] = useState<{
    code: string;
    referred_count: number;
    bonus_amount: number;
    bonus_until: string | null;
    share_text: string;
  } | null>(null);

  const loadRef = useCallback(async () => {
    try {
      const r = await api.referralsMe();
      setReferral(r);
    } catch {}
  }, []);

  useEffect(() => {
    loadRef();
  }, [loadRef]);

  useFocusEffect(useCallback(() => { loadRef(); }, [loadRef]));

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

  const onShare = async () => {
    if (!referral) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        if ((navigator as any).share) {
          await (navigator as any).share({ title: 'AiForge', text: referral.share_text });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(referral.share_text);
          Alert.alert('Copied!', 'Referral link copied to clipboard.');
        }
      } else {
        await Share.share({ message: referral.share_text });
      }
    } catch {}
  };

  const onCopyCode = async () => {
    if (!referral) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(referral.code);
      Alert.alert('Copied!', `Referral code ${referral.code} copied.`);
    } else {
      await Share.share({ message: referral.code });
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account permanently?',
      'This will permanently erase your account, creations, library, chat history, and payment records. This action CANNOT be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteMe();
              await signOut();
              router.replace('/(auth)/login');
            } catch (e: any) {
              Alert.alert('Delete failed', e.message);
            }
          },
        },
      ],
    );
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

          {/* Referral card */}
          <View style={styles.referralCard}>
            <LinearGradient
              colors={[colors.green + '18', 'transparent']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.refHeader}>
              <Gift size={18} color={colors.green} />
              <Text style={styles.refTitle}>Invite friends · Earn bonus</Text>
            </View>
            <Text style={styles.refSub}>
              Share your code. When a friend signs up with it, you BOTH get
              <Text style={{ color: colors.green, fontWeight: '900' }}> +20 generations / day </Text>
              for 7 days.
            </Text>

            <PressableScale onPress={onCopyCode} testID="ref-copy-code">
              <View style={styles.codePill}>
                <Text style={styles.codeText}>{referral?.code ?? 'Loading…'}</Text>
                <Copy size={14} color={colors.cyan} />
              </View>
            </PressableScale>

            <View style={styles.refStatsRow}>
              <View style={styles.refStat}>
                <Text style={styles.refStatValue}>{referral?.referred_count ?? 0}</Text>
                <Text style={styles.refStatLabel}>Friends joined</Text>
              </View>
              <View style={styles.refStat}>
                <Text style={styles.refStatValue}>
                  {referral?.bonus_amount ? `+${referral.bonus_amount}` : '—'}
                </Text>
                <Text style={styles.refStatLabel}>Bonus / day</Text>
              </View>
              <View style={styles.refStat}>
                <Text style={styles.refStatValue}>
                  {referral?.bonus_until
                    ? Math.max(0, Math.ceil(
                        (new Date(referral.bonus_until).getTime() - Date.now()) / 86400000,
                      )) + 'd'
                    : '—'}
                </Text>
                <Text style={styles.refStatLabel}>Bonus left</Text>
              </View>
            </View>

            <GradientButton
              title="Share My Code"
              onPress={onShare}
              icon={<Share2 size={16} color="#000" />}
              testID="ref-share"
              small
              style={{ marginTop: 12 }}
            />
          </View>

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

          <PressableScale onPress={onDeleteAccount} testID="delete-account-btn">
            <View style={styles.dangerRow}>
              <Trash2 size={14} color={colors.red} />
              <Text style={styles.dangerText}>Delete my account</Text>
            </View>
          </PressableScale>

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
  // referral
  referralCard: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.green + '55',
    padding: 16,
    gap: 10,
    overflow: 'hidden',
  },
  refHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  refSub: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  codePill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cyan + '55',
    backgroundColor: 'rgba(0,240,255,0.06)',
    marginTop: 4,
  },
  codeText: { color: colors.cyan, fontWeight: '900', letterSpacing: 2, fontSize: 16 },
  refStatsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  refStat: {
    flex: 1, padding: 10, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  refStatValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  refStatLabel: { color: colors.textDim, fontSize: 10, marginTop: 2, fontWeight: '700' },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  dangerText: { color: colors.red, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
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
