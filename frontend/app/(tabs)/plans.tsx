import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Check,
  Crown,
  Sparkles,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react-native';

import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { useAuth } from '@/src/context/AuthContext';
import { useSubscription, rcEnabled } from '@/src/lib/revenuecat';

// What a Pro subscription unlocks. Prices are fetched live from RevenueCat —
// never hardcoded (playbook rule).
const PRO_FEATURES = [
  '500 AI generations every day',
  'Image, video and 3D model creation',
  'Priority access to new AI models',
  'Edit, enhance and style photos with AI',
  'No ads, no watermarks',
  'Cancel anytime from your Play Store subscriptions',
];

export default function Plans() {
  const { user, refresh, purchaseIdentityError } = useAuth();
  const {
    offerings,
    isSubscribed,
    identityReady,
    isLoading,
    purchase,
    restore,
    isPurchasing,
    isRestoring,
  } = useSubscription();

  // Dev-build confirmation modal (playbook: never Alert.alert in dev; show a
  // custom modal before firing a Test Store purchase).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [infoBanner, setInfoBanner] = useState<string | null>(null);

  const currentOffering = offerings?.current;
  const monthlyPackage = currentOffering?.availablePackages?.find((p) => p.identifier === '$rc_monthly') ?? currentOffering?.availablePackages?.[0] ?? null;

  const priceString = monthlyPackage?.product.priceString ?? '';
  const periodLabel = 'per month';

  const canBuy = rcEnabled && !!monthlyPackage && identityReady && !isSubscribed;

  const confirmAndBuy = async () => {
    if (!monthlyPackage) return;
    if (__DEV__ || Platform.OS === 'web') {
      setConfirmOpen(true);
      return;
    }
    await doPurchase();
  };

  const doPurchase = async () => {
    setConfirmOpen(false);
    if (!monthlyPackage) return;
    try {
      await purchase(monthlyPackage);
      await refresh();
      setInfoBanner('🎉 Welcome to AiForge Pro! Your account is unlocked.');
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      // RevenueCat throws { userCancelled: true } for cancel — swallow silently.
      if (msg.toLowerCase().includes('cancel') || e?.userCancelled) return;
      if (msg.includes('identity_not_ready')) {
        setInfoBanner('Purchases are temporarily unavailable. Try again shortly.');
      } else {
        setInfoBanner(`Purchase failed: ${msg}`);
      }
    }
  };

  const doRestore = async () => {
    try {
      await restore();
      await refresh();
      setInfoBanner(
        isSubscribed
          ? 'Your Pro subscription is active.'
          : 'No active subscription was found on this Google account.',
      );
    } catch (e: any) {
      setInfoBanner(`Restore failed: ${String(e?.message || e)}`);
    }
  };

  // Offerings genuinely empty = store products not set up yet (user needs to
  // register them in Play Console). Never fake-grant pro here.
  const subscriptionsUnavailable = !isLoading && (!monthlyPackage || !rcEnabled);

  return (
    <SafeAreaView style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Crown color={colors.cyan} size={32} />
          <Text style={styles.title}>AiForge Pro</Text>
          <Text style={styles.sub}>Unlimited creativity. One tap away.</Text>
        </View>

        {!!purchaseIdentityError && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{purchaseIdentityError}</Text>
          </View>
        )}
        {!!infoBanner && (
          <View style={styles.infoBanner}>
            <Text style={styles.infoText}>{infoBanner}</Text>
          </View>
        )}

        {/* Current plan pill */}
        <View style={styles.currentWrap}>
          <View style={styles.currentPill}>
            <Sparkles color={colors.textDim} size={14} />
            <Text style={styles.currentText}>
              Current plan: <Text style={{ color: colors.cyan }}>{user?.plan ?? 'free'}</Text>
              {user ? `  •  ${user.daily_used}/${user.daily_limit} today` : ''}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.loadingText}>Loading subscriptions…</Text>
          </View>
        ) : subscriptionsUnavailable ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Subscriptions are coming online</Text>
            <Text style={styles.cardBody}>
              Pro subscriptions aren&apos;t available on this device yet. If you&apos;re on the Google Play
              build, make sure you&apos;ve joined the testing track and have the latest version installed.
            </Text>
          </View>
        ) : (
          <>
            {/* Pro offer card */}
            <LinearGradient
              colors={[colors.cyan, colors.purple]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.offerShell}
            >
              <View style={styles.offerInner}>
                <View style={styles.offerHead}>
                  <Crown color={colors.cyan} size={22} />
                  <Text style={styles.offerName}>Pro</Text>
                  <View style={styles.popBadge}>
                    <Text style={styles.popText}>MOST POPULAR</Text>
                  </View>
                </View>

                <View style={styles.priceRow}>
                  <Text style={styles.price}>{priceString || '$9.99'}</Text>
                  <Text style={styles.period}>{periodLabel}</Text>
                </View>

                <View style={styles.features}>
                  {PRO_FEATURES.map((f) => (
                    <View key={f} style={styles.featureRow}>
                      <Check color={colors.cyan} size={16} />
                      <Text style={styles.featureText}>{f}</Text>
                    </View>
                  ))}
                </View>

                {isSubscribed ? (
                  <View style={styles.activeChip}>
                    <ShieldCheck color={colors.green} size={16} />
                    <Text style={styles.activeChipText}>Active — thank you!</Text>
                  </View>
                ) : (
                  <GradientButton
                    title={isPurchasing ? 'Processing…' : 'Start Pro'}
                    onPress={confirmAndBuy}
                    disabled={!canBuy || isPurchasing}
                  />
                )}
              </View>
            </LinearGradient>

            {/* Restore link */}
            <PressableScale onPress={doRestore} style={styles.restoreBtn}>
              <RefreshCw color={colors.textDim} size={14} />
              <Text style={styles.restoreText}>
                {isRestoring ? 'Checking…' : 'Restore purchases'}
              </Text>
            </PressableScale>

            <Text style={styles.disclaimer}>
              Subscriptions are billed through your Google Play account. Manage or cancel anytime from
              Google Play → Payments → Subscriptions. Prices may vary by region.
            </Text>
          </>
        )}
      </ScrollView>

      {/* Dev / web confirmation modal (Test Store simulated purchases) */}
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm test purchase</Text>
            <Text style={styles.modalBody}>
              You&apos;re on a dev / web preview. Tapping Confirm will simulate a Pro subscription via the
              RevenueCat Test Store (no real charge).
            </Text>
            <View style={styles.modalBtnRow}>
              <PressableScale onPress={() => setConfirmOpen(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </PressableScale>
              <GradientButton title="Confirm" onPress={doPurchase} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { alignItems: 'center', marginBottom: 20, marginTop: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 8 },
  sub: { color: colors.textDim, fontSize: 14, marginTop: 4 },

  banner: {
    backgroundColor: 'rgba(255,45,85,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.4)',
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { color: colors.red, fontSize: 13 },
  infoBanner: {
    backgroundColor: 'rgba(0,240,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.3)',
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  infoText: { color: colors.cyan, fontSize: 13 },

  currentWrap: { alignItems: 'center', marginBottom: 20 },
  currentPill: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  currentText: { color: colors.textDim, fontSize: 12 },

  loadingWrap: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { color: colors.textDim, marginTop: 10, fontSize: 13 },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 20,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  cardBody: { color: colors.textDim, fontSize: 13, lineHeight: 20 },

  offerShell: { borderRadius: radius.xl, padding: 1.5 },
  offerInner: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.xl - 2,
    padding: 20,
    gap: 12,
  },
  offerHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  offerName: { color: colors.text, fontSize: 22, fontWeight: '800', flex: 1 },
  popBadge: {
    backgroundColor: 'rgba(0,240,255,0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  popText: { color: colors.cyan, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { color: colors.text, fontSize: 40, fontWeight: '800' },
  period: { color: colors.textDim, fontSize: 14 },

  features: { gap: 8, marginTop: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { color: colors.text, fontSize: 13, flexShrink: 1 },

  activeChip: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,255,102,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  activeChipText: { color: colors.green, fontSize: 12, fontWeight: '700' },

  restoreBtn: {
    marginTop: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    padding: 8,
  },
  restoreText: { color: colors.textDim, fontSize: 13, textDecorationLine: 'underline' },

  disclaimer: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 8,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  modalBody: { color: colors.textDim, fontSize: 13, marginTop: 8, lineHeight: 20 },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'center' },
  modalCancel: { paddingHorizontal: 16, paddingVertical: 10 },
  modalCancelText: { color: colors.textDim, fontSize: 14 },
});
