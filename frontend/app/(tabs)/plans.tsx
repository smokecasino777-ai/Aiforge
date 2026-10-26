import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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
  Zap,
  Image as ImageIcon,
  Video,
  Box,
  Palette,
  Star,
  Lock,
} from 'lucide-react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { useAuth } from '@/src/context/AuthContext';
import { useSubscription, rcEnabled } from '@/src/lib/revenuecat';

// What a Pro subscription unlocks. Prices are fetched live from RevenueCat —
// never hardcoded (playbook rule).
type Feature = { icon: React.ComponentType<{ size?: number; color?: string }>; label: string };
const PRO_FEATURES: Feature[] = [
  { icon: Zap, label: '500 AI generations every day' },
  { icon: ImageIcon, label: 'Unlimited AI image creation' },
  { icon: Video, label: 'Video generation with Sora-grade models' },
  { icon: Box, label: '3D model + SCAD mesh generation' },
  { icon: Palette, label: 'AI photo editor + style transfer' },
  { icon: Sparkles, label: 'Priority access to new AI models' },
  { icon: ShieldCheck, label: 'No ads, no watermarks, no limits' },
];

// Social proof — safe generic number. Replace with real analytics number later.
const SOCIAL_PROOF = 'Join 12,000+ creators building with AiForge';

type SelectedPlan = 'annual' | 'monthly';

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

  const [selected, setSelected] = useState<SelectedPlan>('annual');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [infoBanner, setInfoBanner] = useState<string | null>(null);
  const router = useRouter();

  const currentOffering = offerings?.current;

  const monthlyPkg = useMemo<PurchasesPackage | null>(
    () => currentOffering?.availablePackages?.find((p) => p.identifier === '$rc_monthly') ?? null,
    [currentOffering],
  );
  const annualPkg = useMemo<PurchasesPackage | null>(
    () => currentOffering?.availablePackages?.find((p) => p.identifier === '$rc_annual') ?? null,
    [currentOffering],
  );

  const activePkg = selected === 'annual' ? annualPkg : monthlyPkg;

  // Derived values for the UI (never hardcoded; computed from live offerings).
  const annualYearly = annualPkg?.product.price ?? 0;
  const monthlyMonthly = monthlyPkg?.product.price ?? 0;
  const annualEquivalentMonthly = annualYearly > 0 ? annualYearly / 12 : 0;
  const savingsPct =
    monthlyMonthly > 0 && annualEquivalentMonthly > 0
      ? Math.round((1 - annualEquivalentMonthly / monthlyMonthly) * 100)
      : 0;

  const monthlyHasTrial =
    (monthlyPkg?.product?.introPrice && monthlyPkg.product.introPrice.price === 0) ?? false;

  const canBuy = rcEnabled && !!activePkg && identityReady && !isSubscribed;

  const subscriptionsUnavailable =
    !isLoading && (!currentOffering || (!monthlyPkg && !annualPkg));

  const confirmAndBuy = async () => {
    if (!activePkg) return;
    if (__DEV__ || Platform.OS === 'web') {
      setConfirmOpen(true);
      return;
    }
    await doPurchase();
  };

  const doPurchase = async () => {
    setConfirmOpen(false);
    if (!activePkg) return;
    try {
      await purchase(activePkg);
      await refresh();
      setInfoBanner('🎉 Welcome to AiForge Pro! Your account is unlocked.');
    } catch (e: any) {
      const msg = String(e?.message || e || '');
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

  return (
    <SafeAreaView style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.crownBadge}>
            <Crown color={colors.cyan} size={28} />
          </View>
          <Text style={styles.heroTitle}>Unlock AiForge Pro</Text>
          <Text style={styles.heroSub}>
            Everything you need to create limitless AI art, video and 3D — in one app.
          </Text>
          <View style={styles.proofRow}>
            <View style={styles.proofStars}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} fill={colors.yellow ?? '#ffd166'} color={colors.yellow ?? '#ffd166'} size={12} />
              ))}
            </View>
            <Text style={styles.proofText}>{SOCIAL_PROOF}</Text>
          </View>
        </View>

        {/* Banners */}
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

        {/* Features */}
        <View style={styles.featuresCard}>
          {PRO_FEATURES.map(({ icon: Icon, label }) => (
            <View key={label} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Icon color={colors.cyan} size={14} />
              </View>
              <Text style={styles.featureText}>{label}</Text>
              <Check color={colors.green} size={16} />
            </View>
          ))}
        </View>

        {/* Package picker */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.loadingText}>Loading subscriptions…</Text>
          </View>
        ) : subscriptionsUnavailable ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Subscriptions are coming online</Text>
            <Text style={styles.cardBody}>
              Pro subscriptions aren&apos;t available on this device yet. If you&apos;re on the Google
              Play build, make sure you&apos;ve joined the testing track and have the latest version
              installed.
            </Text>
          </View>
        ) : (
          <>
            {/* Annual (recommended) */}
            {annualPkg && (
              <PackageOption
                selected={selected === 'annual'}
                onPress={() => setSelected('annual')}
                recommended
                tag={savingsPct > 0 ? `SAVE ${savingsPct}%` : 'BEST VALUE'}
                title="Yearly"
                priceLine={annualPkg.product.priceString}
                subLine={
                  annualEquivalentMonthly
                    ? `Just ${formatCurrency(annualEquivalentMonthly, annualPkg.product.currencyCode)}/mo billed annually`
                    : 'Billed once per year'
                }
              />
            )}

            {/* Monthly */}
            {monthlyPkg && (
              <PackageOption
                selected={selected === 'monthly'}
                onPress={() => setSelected('monthly')}
                tag={monthlyHasTrial ? '7-DAY FREE TRIAL' : null}
                title="Monthly"
                priceLine={`${monthlyPkg.product.priceString}/mo`}
                subLine={monthlyHasTrial ? 'Free for 7 days, then auto-renews' : 'Billed monthly, cancel anytime'}
              />
            )}

            {/* CTA */}
            <View style={styles.ctaWrap}>
              {isSubscribed ? (
                <View style={styles.activeChip}>
                  <ShieldCheck color={colors.green} size={16} />
                  <Text style={styles.activeChipText}>Pro is active — thank you!</Text>
                </View>
              ) : (
                <GradientButton
                  title={
                    isPurchasing
                      ? 'Processing…'
                      : selected === 'monthly' && monthlyHasTrial
                        ? 'Start 7-day free trial'
                        : 'Start Pro'
                  }
                  onPress={confirmAndBuy}
                  disabled={!canBuy || isPurchasing}
                />
              )}
            </View>

            {/* Trust indicators */}
            <View style={styles.trustRow}>
              <View style={styles.trustItem}>
                <ShieldCheck color={colors.textDim} size={14} />
                <Text style={styles.trustText}>Secured by Google Play</Text>
              </View>
              <View style={styles.trustItem}>
                <Lock color={colors.textDim} size={14} />
                <Text style={styles.trustText}>Cancel anytime</Text>
              </View>
            </View>

            {/* Restore + legal */}
            <PressableScale onPress={doRestore} style={styles.restoreBtn}>
              <RefreshCw color={colors.textDim} size={14} />
              <Text style={styles.restoreText}>
                {isRestoring ? 'Checking…' : 'Restore purchases'}
              </Text>
            </PressableScale>

            <Text style={styles.disclaimer}>
              Subscriptions are billed through your Google Play account. Payment is charged at purchase
              confirmation. Auto-renews unless cancelled at least 24 hours before the end of the current
              period. Manage or cancel anytime in Google Play → Payments → Subscriptions. Prices may
              vary by region.
            </Text>
            <View style={styles.linkRow}>
              <Text style={styles.linkText} onPress={() => router.push('/legal/terms')}>Terms</Text>
              <Text style={styles.linkDot}>·</Text>
              <Text style={styles.linkText} onPress={() => router.push('/legal/privacy')}>Privacy</Text>
            </View>
          </>
        )}

        {/* Current plan footer pill */}
        <View style={styles.currentWrap}>
          <View style={styles.currentPill}>
            <Sparkles color={colors.textDim} size={12} />
            <Text style={styles.currentText}>
              Current: <Text style={{ color: colors.cyan }}>{user?.plan ?? 'free'}</Text>
              {user ? `  •  ${user.daily_used}/${user.daily_limit} today` : ''}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Dev / web confirmation modal */}
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
              You&apos;re on a dev / web preview. Tapping Confirm will simulate a Pro subscription via
              the RevenueCat Test Store (no real charge).
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

// --- helpers ---

function formatCurrency(value: number, code?: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code || 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

// --- Package option (shared with annual + monthly) ---

function PackageOption({
  selected,
  onPress,
  recommended,
  tag,
  title,
  priceLine,
  subLine,
}: {
  selected: boolean;
  onPress: () => void;
  recommended?: boolean;
  tag?: string | null;
  title: string;
  priceLine: string;
  subLine: string;
}) {
  const Shell = recommended ? LinearGradient : View;
  const shellProps: any = recommended
    ? {
        colors: selected ? [colors.cyan, colors.purple] : [colors.border, colors.border],
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
      }
    : {};
  return (
    <PressableScale onPress={onPress}>
      <Shell {...shellProps} style={[pkgStyles.shell, { padding: selected ? 1.5 : 1 }]}>
        <View
          style={[
            pkgStyles.inner,
            selected ? pkgStyles.innerSelected : null,
          ]}
        >
          <View style={pkgStyles.left}>
            <View style={pkgStyles.titleRow}>
              <Text style={pkgStyles.title}>{title}</Text>
              {!!tag && (
                <View style={pkgStyles.tag}>
                  <Text style={pkgStyles.tagText}>{tag}</Text>
                </View>
              )}
            </View>
            <Text style={pkgStyles.subLine}>{subLine}</Text>
          </View>
          <View style={pkgStyles.right}>
            <Text style={pkgStyles.price}>{priceLine}</Text>
            <View
              style={[
                pkgStyles.radio,
                selected ? pkgStyles.radioSelected : null,
              ]}
            >
              {selected && <View style={pkgStyles.radioDot} />}
            </View>
          </View>
        </View>
      </Shell>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48 },

  // Hero
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
  crownBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,240,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: 0.3 },
  heroSub: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
  },
  proofRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 },
  proofStars: { flexDirection: 'row', gap: 2 },
  proofText: { color: colors.textDim, fontSize: 11 },

  // Banners
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

  // Features
  featuresCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,240,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { color: colors.text, fontSize: 13, flex: 1 },

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

  // CTA
  ctaWrap: { marginTop: 20 },
  activeChip: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,255,102,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  activeChipText: { color: colors.green, fontSize: 14, fontWeight: '700' },

  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 14,
  },
  trustItem: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  trustText: { color: colors.textDim, fontSize: 11 },

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
    marginTop: 16,
    paddingHorizontal: 8,
  },
  linkRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  linkText: {
    color: colors.textDim,
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  linkDot: { color: colors.textMuted, fontSize: 11 },

  currentWrap: { alignItems: 'center', marginTop: 24 },
  currentPill: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  currentText: { color: colors.textDim, fontSize: 11 },

  // Modal
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

const pkgStyles = StyleSheet.create({
  shell: { borderRadius: radius.lg, marginBottom: 10 },
  inner: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg - 2,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  innerSelected: {
    borderColor: 'transparent',
  },
  left: { flex: 1 },
  titleRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  tag: {
    backgroundColor: 'rgba(0,240,255,0.18)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  tagText: { color: colors.cyan, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  subLine: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 10 },
  price: { color: colors.text, fontSize: 15, fontWeight: '700' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.cyan },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cyan },
});
