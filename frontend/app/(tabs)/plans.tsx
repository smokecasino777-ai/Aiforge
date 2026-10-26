import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
  Flame,
  Coins,
  Timer,
  Gift,
  TrendingUp,
} from 'lucide-react-native';
import type { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';

import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { useAuth } from '@/src/context/AuthContext';
import { useSubscription, rcEnabled } from '@/src/lib/revenuecat';

// --- Conversion boosters (static copy) ---------------------------------------
const PRO_FEATURES: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string }[] = [
  { icon: Zap, label: '500 AI generations every day' },
  { icon: ImageIcon, label: 'Unlimited AI image creation' },
  { icon: Video, label: 'Video generation with Sora-grade models' },
  { icon: Box, label: '3D model + SCAD mesh generation' },
  { icon: Palette, label: 'AI photo editor + style transfer' },
  { icon: Sparkles, label: 'Priority access to new AI models' },
  { icon: ShieldCheck, label: 'No ads, no watermarks, no limits' },
];
const SOCIAL_PROOF = 'Join 12,000+ creators building with AiForge';

// Token pack metadata (purely cosmetic — real prices come from RevenueCat).
// product_id must match the Google Play / RevenueCat Consumable product.
// `cost_hint` is just UI copy showing how far the pack goes.
type TokenPackMeta = {
  productId: 'tokens_25' | 'tokens_100' | 'tokens_500';
  title: string;
  tokens: number;
  gradient: [string, string];
  badge?: string;
  perk: string;
};
const TOKEN_PACK_META: TokenPackMeta[] = [
  {
    productId: 'tokens_25',
    title: 'Starter',
    tokens: 25,
    gradient: [colors.green, '#00B248'],
    perk: '25 images or 8 videos',
  },
  {
    productId: 'tokens_100',
    title: 'Creator',
    tokens: 100,
    gradient: [colors.cyan, colors.purple],
    badge: 'POPULAR',
    perk: '100 images or 33 videos',
  },
  {
    productId: 'tokens_500',
    title: 'Studio',
    tokens: 500,
    gradient: [colors.pink, colors.purple],
    badge: 'BEST VALUE',
    perk: '500 images or 166 videos',
  },
];

type TabMode = 'pro' | 'tokens';
type SelectedPlan = 'annual' | 'monthly' | 'weekly';

// ---------------------------------------------------------------------------

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

  const [tab, setTab] = useState<TabMode>('pro');
  const [selected, setSelected] = useState<SelectedPlan>('annual');
  const [selectedPack, setSelectedPack] = useState<TokenPackMeta['productId']>('tokens_100');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [infoBanner, setInfoBanner] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const router = useRouter();

  // 1-second ticker to animate the free-tier countdown.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const currentOffering = offerings?.current;

  // Token-pack offering: we look for a dedicated RevenueCat offering called
  // "tokens" (recommended), then fall back to the current offering's custom
  // packages (identifier = tokens_25 / tokens_100 / tokens_500).
  const tokenOffering: PurchasesOffering | null = useMemo(() => {
    if (!offerings) return null;
    const named = offerings.all?.['tokens'];
    if (named && named.availablePackages?.length) return named;
    return currentOffering ?? null;
  }, [offerings, currentOffering]);

  const findPkg = (id: string): PurchasesPackage | null =>
    tokenOffering?.availablePackages?.find(
      (p) => p.identifier === id || p.product.identifier === id,
    ) ?? null;

  const tokenPackages: (TokenPackMeta & { pkg: PurchasesPackage | null })[] = useMemo(
    () => TOKEN_PACK_META.map((m) => ({ ...m, pkg: findPkg(m.productId) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokenOffering],
  );

  const monthlyPkg = useMemo<PurchasesPackage | null>(
    () => currentOffering?.availablePackages?.find((p) => p.identifier === '$rc_monthly') ?? null,
    [currentOffering],
  );
  const annualPkg = useMemo<PurchasesPackage | null>(
    () => currentOffering?.availablePackages?.find((p) => p.identifier === '$rc_annual') ?? null,
    [currentOffering],
  );
  const weeklyPkg = useMemo<PurchasesPackage | null>(
    () => currentOffering?.availablePackages?.find((p) => p.identifier === '$rc_weekly') ?? null,
    [currentOffering],
  );

  const activeProPkg =
    selected === 'annual' ? annualPkg : selected === 'monthly' ? monthlyPkg : weeklyPkg;
  const activePackPkg = tokenPackages.find((p) => p.productId === selectedPack)?.pkg ?? null;
  const activePkg = tab === 'pro' ? activeProPkg : activePackPkg;

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

  // Per-token pricing comparison (lowest in the lineup = best value)
  const pricePerToken = tokenPackages.map((p) =>
    p.pkg && p.pkg.product.price > 0 ? p.pkg.product.price / p.tokens : Number.POSITIVE_INFINITY,
  );
  const starterPerToken = pricePerToken[0];
  const perTokenSavings = tokenPackages.map((p, i) =>
    pricePerToken[i] !== Infinity && starterPerToken !== Infinity && starterPerToken > 0
      ? Math.max(0, Math.round((1 - pricePerToken[i] / starterPerToken) * 100))
      : 0,
  );

  const canBuy = rcEnabled && !!activePkg && identityReady;
  const subscriptionsUnavailable =
    !isLoading && (!currentOffering || (!monthlyPkg && !annualPkg && !weeklyPkg));
  const tokenPacksUnavailable = !isLoading && !tokenPackages.some((p) => p.pkg);

  // --- Balance pill: live free_gens remaining + tokens. ---
  const freeGensRemaining = Number(user?.free_gens_remaining ?? 0);
  const tokensBalance = Number(user?.tokens_balance ?? 0);
  const freeExpiresAt = user?.free_gens_expires_at ?? null;
  const freeDaysLeft = useMemo(() => {
    if (!freeExpiresAt) return 0;
    try {
      const diff = new Date(freeExpiresAt).getTime() - Date.now();
      return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    } catch {
      return 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeExpiresAt, tick]);

  // --- Purchase handlers ---
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
      if (tab === 'pro') {
        setInfoBanner('🎉 Welcome to AiForge Pro! Your account is unlocked.');
      } else {
        const meta = tokenPackages.find((p) => p.productId === selectedPack);
        setInfoBanner(
          `✨ ${meta?.tokens ?? ''} tokens added — your balance is updating now.`,
        );
      }
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

  // ---------------------------------------------------------------------
  return (
    <SafeAreaView style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Balance pill */}
        <View style={styles.balanceRow}>
          <View style={styles.balancePill}>
            <Gift color={colors.green} size={14} />
            <Text style={styles.balancePillText}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{freeGensRemaining}</Text> free
              {freeDaysLeft > 0 ? (
                <Text style={{ color: colors.textMuted }}>  ·  {freeDaysLeft}d left</Text>
              ) : null}
            </Text>
          </View>
          <View style={styles.balancePill}>
            <Coins color={colors.yellow} size={14} />
            <Text style={styles.balancePillText}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{tokensBalance}</Text> tokens
            </Text>
          </View>
        </View>

        {/* Urgency banner — only when user has ≤2 free gens left or 0 tokens */}
        {freeGensRemaining <= 2 && tokensBalance === 0 && !isSubscribed && (
          <View style={styles.urgencyBanner}>
            <Flame color={colors.yellow} size={16} />
            <Text style={styles.urgencyText}>
              {freeGensRemaining === 0
                ? "You're out of free gens — grab a pack or go Pro to keep creating."
                : `Only ${freeGensRemaining} free gen${freeGensRemaining === 1 ? '' : 's'} left — top up before you run dry.`}
            </Text>
          </View>
        )}

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.crownBadge}>
            <Crown color={colors.cyan} size={28} />
          </View>
          <Text style={styles.heroTitle}>Power up AiForge</Text>
          <Text style={styles.heroSub}>
            Go Pro for unlimited daily gens, or grab a pack of tokens — pay once, no subscription.
          </Text>
          <View style={styles.proofRow}>
            <View style={styles.proofStars}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} fill={colors.yellow} color={colors.yellow} size={12} />
              ))}
            </View>
            <Text style={styles.proofText}>{SOCIAL_PROOF}</Text>
          </View>
        </View>

        {/* Mode toggle */}
        <View style={styles.toggleWrap}>
          <ToggleBtn
            active={tab === 'pro'}
            onPress={() => setTab('pro')}
            label="Subscribe"
            sub="Best for daily use"
          />
          <ToggleBtn
            active={tab === 'tokens'}
            onPress={() => setTab('tokens')}
            label="Token packs"
            sub="One-time, no renewal"
          />
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

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.cyan} />
            <Text style={styles.loadingText}>Loading offers…</Text>
          </View>
        ) : tab === 'pro' ? (
          <ProTab
            isSubscribed={isSubscribed}
            subscriptionsUnavailable={subscriptionsUnavailable}
            monthlyPkg={monthlyPkg}
            annualPkg={annualPkg}
            weeklyPkg={weeklyPkg}
            selected={selected}
            setSelected={setSelected}
            savingsPct={savingsPct}
            annualEquivalentMonthly={annualEquivalentMonthly}
            monthlyHasTrial={monthlyHasTrial}
            canBuy={canBuy}
            isPurchasing={isPurchasing}
            confirmAndBuy={confirmAndBuy}
          />
        ) : (
          <TokensTab
            tokenPacks={tokenPackages}
            selectedPack={selectedPack}
            setSelectedPack={setSelectedPack}
            perTokenSavings={perTokenSavings}
            canBuy={canBuy}
            isPurchasing={isPurchasing}
            confirmAndBuy={confirmAndBuy}
            tokenPacksUnavailable={tokenPacksUnavailable}
          />
        )}

        {/* Trust indicators + restore */}
        <View style={styles.trustRow}>
          <View style={styles.trustItem}>
            <ShieldCheck color={colors.textDim} size={14} />
            <Text style={styles.trustText}>Secured by Google Play</Text>
          </View>
          <View style={styles.trustItem}>
            <Lock color={colors.textDim} size={14} />
            <Text style={styles.trustText}>
              {tab === 'pro' ? 'Cancel anytime' : 'Tokens never expire'}
            </Text>
          </View>
        </View>

        <PressableScale onPress={doRestore} style={styles.restoreBtn}>
          <RefreshCw color={colors.textDim} size={14} />
          <Text style={styles.restoreText}>
            {isRestoring ? 'Checking…' : 'Restore purchases'}
          </Text>
        </PressableScale>

        <Text style={styles.disclaimer}>
          {tab === 'pro'
            ? 'Subscriptions are billed through your Google Play account. Auto-renews unless cancelled at least 24h before the end of the current period. Manage or cancel anytime in Google Play → Payments → Subscriptions.'
            : 'Token packs are one-time purchases billed through your Google Play account. Tokens stay on your account until used — no auto-renewal, nothing to cancel.'}
        </Text>
        <View style={styles.linkRow}>
          <Text style={styles.linkText} onPress={() => router.push('/legal/terms')}>Terms</Text>
          <Text style={styles.linkDot}>·</Text>
          <Text style={styles.linkText} onPress={() => router.push('/legal/privacy')}>Privacy</Text>
        </View>

        <View style={styles.currentWrap}>
          <View style={styles.currentPill}>
            <Sparkles color={colors.textDim} size={12} />
            <Text style={styles.currentText}>
              Current plan: <Text style={{ color: colors.cyan }}>{user?.plan ?? 'free'}</Text>
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
              You&apos;re on a dev / web preview. Tapping Confirm will simulate the purchase via
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleBtn({
  active,
  onPress,
  label,
  sub,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  sub: string;
}) {
  return (
    <PressableScale onPress={onPress} style={{ flex: 1 }}>
      <View style={[styles.toggleBtn, active && styles.toggleBtnActive]}>
        <Text style={[styles.toggleBtnLabel, active && { color: colors.cyan }]}>{label}</Text>
        <Text style={styles.toggleBtnSub}>{sub}</Text>
      </View>
    </PressableScale>
  );
}

function ProTab(props: {
  isSubscribed: boolean;
  subscriptionsUnavailable: boolean;
  monthlyPkg: PurchasesPackage | null;
  annualPkg: PurchasesPackage | null;
  weeklyPkg: PurchasesPackage | null;
  selected: SelectedPlan;
  setSelected: (p: SelectedPlan) => void;
  savingsPct: number;
  annualEquivalentMonthly: number;
  monthlyHasTrial: boolean;
  canBuy: boolean;
  isPurchasing: boolean;
  confirmAndBuy: () => void;
}) {
  const {
    isSubscribed,
    subscriptionsUnavailable,
    monthlyPkg,
    annualPkg,
    weeklyPkg,
    selected,
    setSelected,
    savingsPct,
    annualEquivalentMonthly,
    monthlyHasTrial,
    canBuy,
    isPurchasing,
    confirmAndBuy,
  } = props;

  if (subscriptionsUnavailable) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Subscriptions are coming online</Text>
        <Text style={styles.cardBody}>
          Pro subscriptions aren&apos;t available on this device yet. If you&apos;re on the Google
          Play build, make sure you&apos;ve joined the testing track and have the latest version
          installed.
        </Text>
      </View>
    );
  }

  return (
    <>
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
      {weeklyPkg && (
        <PackageOption
          selected={selected === 'weekly'}
          onPress={() => setSelected('weekly')}
          title="Weekly"
          priceLine={`${weeklyPkg.product.priceString}/wk`}
          subLine="Try Pro for a week — cancel anytime"
        />
      )}

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
    </>
  );
}

function TokensTab(props: {
  tokenPacks: (TokenPackMeta & { pkg: PurchasesPackage | null })[];
  selectedPack: TokenPackMeta['productId'];
  setSelectedPack: (id: TokenPackMeta['productId']) => void;
  perTokenSavings: number[];
  canBuy: boolean;
  isPurchasing: boolean;
  confirmAndBuy: () => void;
  tokenPacksUnavailable: boolean;
}) {
  const {
    tokenPacks,
    selectedPack,
    setSelectedPack,
    perTokenSavings,
    canBuy,
    isPurchasing,
    confirmAndBuy,
    tokenPacksUnavailable,
  } = props;

  if (tokenPacksUnavailable) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Token packs setup pending</Text>
        <Text style={styles.cardBody}>
          Create a RevenueCat offering named <Text style={{ color: colors.cyan }}>tokens</Text> with
          three Consumable products — <Text style={{ color: colors.cyan }}>tokens_25</Text>,
          <Text style={{ color: colors.cyan }}> tokens_100</Text> and{' '}
          <Text style={{ color: colors.cyan }}>tokens_500</Text> — then redeploy. The app will pick
          them up automatically.
        </Text>
      </View>
    );
  }

  return (
    <>
      {/* How tokens work */}
      <View style={styles.featuresCard}>
        <View style={styles.featureRow}>
          <View style={styles.featureIcon}>
            <ImageIcon color={colors.green} size={14} />
          </View>
          <Text style={styles.featureText}>1 token = 1 AI image</Text>
        </View>
        <View style={styles.featureRow}>
          <View style={styles.featureIcon}>
            <Video color={colors.cyan} size={14} />
          </View>
          <Text style={styles.featureText}>3 tokens = 1 AI video or 3D model</Text>
        </View>
        <View style={styles.featureRow}>
          <View style={styles.featureIcon}>
            <Sparkles color={colors.yellow} size={14} />
          </View>
          <Text style={styles.featureText}>Voice chat replies are always free</Text>
        </View>
        <View style={styles.featureRow}>
          <View style={styles.featureIcon}>
            <Timer color={colors.purple} size={14} />
          </View>
          <Text style={styles.featureText}>Tokens never expire — use whenever you want</Text>
        </View>
      </View>

      {/* Pack cards */}
      <View style={styles.packsGrid}>
        {tokenPacks.map((meta, i) => (
          <TokenPackCard
            key={meta.productId}
            meta={meta}
            selected={selectedPack === meta.productId}
            onPress={() => setSelectedPack(meta.productId)}
            saveLabel={perTokenSavings[i] > 0 ? `SAVE ${perTokenSavings[i]}%` : null}
          />
        ))}
      </View>

      <View style={styles.ctaWrap}>
        <GradientButton
          title={isPurchasing ? 'Processing…' : 'Buy tokens'}
          onPress={confirmAndBuy}
          disabled={!canBuy || isPurchasing}
        />
      </View>
    </>
  );
}

function TokenPackCard({
  meta,
  selected,
  onPress,
  saveLabel,
}: {
  meta: TokenPackMeta & { pkg: PurchasesPackage | null };
  selected: boolean;
  onPress: () => void;
  saveLabel: string | null;
}) {
  const price = meta.pkg?.product.priceString ?? '—';
  const disabled = !meta.pkg;
  return (
    <PressableScale onPress={disabled ? undefined : onPress} style={{ marginBottom: 10 }}>
      <LinearGradient
        colors={selected ? meta.gradient : [colors.border, colors.border]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[packStyles.shell, { padding: selected ? 1.5 : 1, opacity: disabled ? 0.5 : 1 }]}
      >
        <View style={[packStyles.inner, selected && packStyles.innerSelected]}>
          <View style={packStyles.left}>
            <View style={packStyles.titleRow}>
              <Coins color={meta.gradient[0]} size={16} />
              <Text style={packStyles.title}>{meta.title}</Text>
              {!!meta.badge && (
                <View style={[packStyles.badge, { backgroundColor: meta.gradient[0] + '2A' }]}>
                  <Text style={[packStyles.badgeText, { color: meta.gradient[0] }]}>
                    {meta.badge}
                  </Text>
                </View>
              )}
            </View>
            <Text style={packStyles.tokenCount}>{meta.tokens.toLocaleString()} tokens</Text>
            <Text style={packStyles.perk}>{meta.perk}</Text>
            {!!saveLabel && (
              <View style={packStyles.savingsRow}>
                <TrendingUp color={colors.green} size={12} />
                <Text style={packStyles.savingsText}>{saveLabel} vs starter</Text>
              </View>
            )}
          </View>
          <View style={packStyles.right}>
            <Text style={packStyles.price}>{price}</Text>
            <Text style={packStyles.oneTime}>one-time</Text>
            <View style={[packStyles.radio, selected && packStyles.radioSelected]}>
              {selected && <View style={packStyles.radioDot} />}
            </View>
          </View>
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

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
        <View style={[pkgStyles.inner, selected ? pkgStyles.innerSelected : null]}>
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
            <View style={[pkgStyles.radio, selected ? pkgStyles.radioSelected : null]}>
              {selected && <View style={pkgStyles.radioDot} />}
            </View>
          </View>
        </View>
      </Shell>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48 },

  balanceRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  balancePill: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balancePillText: { color: colors.textDim, fontSize: 12 },

  urgencyBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,214,10,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,214,10,0.35)',
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 14,
  },
  urgencyText: { color: colors.yellow, fontSize: 12, flex: 1 },

  hero: { alignItems: 'center', marginTop: 4, marginBottom: 16 },
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

  toggleWrap: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 4,
    marginBottom: 16,
  },
  toggleBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  toggleBtnActive: { backgroundColor: 'rgba(0,240,255,0.08)' },
  toggleBtnLabel: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  toggleBtnSub: { color: colors.textMuted, fontSize: 10, marginTop: 2 },

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

  featuresCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
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

  packsGrid: { marginBottom: 4 },

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

  ctaWrap: { marginTop: 16 },
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
  linkText: { color: colors.textDim, fontSize: 11, textDecorationLine: 'underline' },
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
  innerSelected: { borderColor: 'transparent' },
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

const packStyles = StyleSheet.create({
  shell: { borderRadius: radius.lg },
  inner: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg - 2,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  innerSelected: { borderColor: 'transparent' },
  left: { flex: 1 },
  titleRow: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  tokenCount: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 6 },
  perk: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  savingsRow: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 6 },
  savingsText: { color: colors.green, fontSize: 11, fontWeight: '700' },
  right: { alignItems: 'flex-end', gap: 6, marginLeft: 10 },
  price: { color: colors.text, fontSize: 17, fontWeight: '800' },
  oneTime: { color: colors.textMuted, fontSize: 10 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  radioSelected: { borderColor: colors.cyan },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cyan },
});
