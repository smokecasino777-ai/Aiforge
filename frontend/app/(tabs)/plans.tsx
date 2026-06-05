import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { Crown, Check, Sparkles, Zap, Flame, Infinity as InfinityIcon, Rocket } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius, PLAN_META } from '@/src/theme/colors';
import { api, BACKEND_URL, Plan } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';

const ICONS: Record<string, any> = {
  free: Sparkles,
  spark: Zap,
  forge: Flame,
  neon: Crown,
  quantum: InfinityIcon,
  singularity: Rocket,
};

export default function Plans() {
  const { user, refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.plans();
        setPlans(list);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const upgrade = async (planId: string) => {
    if (planId === 'free' || planId === user?.plan) return;
    setBusy(planId);
    try {
      // On web, use the live origin so Stripe redirects back to whatever host
      // the user is on (works for preview, production, custom domains, …).
      // On native, fall back to the publicly-reachable backend URL which is
      // also the host serving the web app on Emergent.
      const liveOrigin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : '';
      const origin = (liveOrigin || BACKEND_URL || '').replace(/\/+$/, '');
      const res = await api.createCheckout(planId, origin);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.location.href = res.url;
      } else {
        const r = await WebBrowser.openAuthSessionAsync(res.url, origin);
        if (r.type === 'success') {
          // poll status to upgrade plan
          await pollStatus(res.session_id);
          await refresh();
        }
      }
    } catch (e: any) {
      Alert.alert('Checkout failed', e.message);
    } finally {
      setBusy(null);
    }
  };

  const pollStatus = async (sessionId: string) => {
    for (let i = 0; i < 6; i++) {
      try {
        const s = await api.checkoutStatus(sessionId);
        if (s.payment_status === 'paid') {
          Alert.alert('Welcome aboard!', 'Your plan has been upgraded.');
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1500));
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <StarryBackground />
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Crown size={22} color={colors.yellow} />
            <Text style={styles.title}>Plans</Text>
          </View>
          <Text style={styles.sub}>
            Forge more. Generate faster. Unlock everything.
          </Text>

          {plans.map((p, idx) => {
            const meta = PLAN_META[p.id] ?? PLAN_META.free;
            const isCurrent = user?.plan === p.id;
            const isPopular = p.id === 'forge';
            const Icon = ICONS[p.id] || Sparkles;
            return (
              <View key={p.id} style={[styles.planCard, isPopular && styles.popular]} testID={`plan-${p.id}`}>
                {isPopular ? (
                  <LinearGradient
                    colors={[colors.cyan, colors.green, colors.purple]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.popularBar}
                  />
                ) : null}
                <View style={styles.planTop}>
                  <View style={styles.planTopLeft}>
                    <LinearGradient
                      colors={meta.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.planIcon}
                    >
                      <Icon size={20} color="#000" strokeWidth={2.5} />
                    </LinearGradient>
                    <View>
                      <Text style={styles.planName}>{p.name}</Text>
                      <Text style={styles.planTagline}>{meta.tagline}</Text>
                    </View>
                  </View>
                  {isPopular ? (
                    <View style={styles.popularChip}>
                      <Text style={styles.popularChipText}>POPULAR</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    {p.price === 0 ? 'Free' : `$${p.price.toFixed(2)}`}
                  </Text>
                  {p.price > 0 ? <Text style={styles.priceSuffix}>/ month</Text> : null}
                </View>

                <Text style={styles.limit}>
                  {p.limit >= 9999 ? 'Unlimited' : `${p.limit}`} generations / day
                </Text>

                <View style={styles.featList}>
                  {p.features.map((f) => (
                    <View key={f} style={styles.featRow}>
                      <Check size={14} color={meta.color} />
                      <Text style={styles.featText}>{f}</Text>
                    </View>
                  ))}
                </View>

                <GradientButton
                  title={isCurrent ? 'Current Plan' : p.id === 'free' ? 'Downgrade' : `Upgrade to ${p.name}`}
                  onPress={() => upgrade(p.id)}
                  loading={busy === p.id}
                  disabled={isCurrent || (p.id === 'free' && user?.plan === 'free')}
                  variant={isCurrent ? 'outline' : 'primary'}
                  style={{ marginTop: 18 }}
                  testID={`plan-${p.id}-cta`}
                />
              </View>
            );
          })}
          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 18, paddingBottom: 30, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  sub: { color: colors.textDim, fontSize: 13, marginBottom: 8 },
  planCard: {
    backgroundColor: 'rgba(10,10,20,0.7)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 6,
    overflow: 'hidden',
  },
  popular: {
    borderColor: colors.cyan + '88',
    boxShadow: '0px 0px 16px rgba(0,240,255,0.3)',
  },
  popularBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  planName: { color: colors.text, fontSize: 20, fontWeight: '900' },
  planTagline: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  popularChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.cyan + '20', borderColor: colors.cyan, borderWidth: 1 },
  popularChipText: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 12 },
  price: { color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  priceSuffix: { color: colors.textDim, fontSize: 13 },
  limit: { color: colors.cyan, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: -2 },
  featList: { marginTop: 12, gap: 8 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featText: { color: colors.text, fontSize: 13 },
});
