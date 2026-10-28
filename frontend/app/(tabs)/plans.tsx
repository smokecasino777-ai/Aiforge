import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Modal, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme/colors';
import { api } from '@/src/api/client';
import { useSubscription } from '@/src/lib/revenuecat';
import { useAuth } from '@/src/context/AuthContext';

type Product = { id: string; name: string; kind: string; price_usd: number; credits: number; suggested?: boolean; available: boolean; package_id?: string; offering_id?: string; product_id?: string; reason?: string; minimum_local_prices?: Record<string, number> };
type Wallet = { total: number; monthly: number; purchased: number; promo: number; lots: { id: string; kind: string; remaining: number; expires_at: string | null }[]; legacy_tokens: number; legacy_plan: string; credit_plan?: string; starter_pending?: boolean };

export default function Plans() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { offerings, purchase, restore, identityReady, isPurchasing, isRestoring, refreshOffers } = useSubscription();
  const [catalog, setCatalog] = useState<{ products: Product[]; examples: any[] } | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [tab, setTab] = useState('monthly');
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [selection, setSelection] = useState<{ product: Product; pkg: PurchasesPackage } | null>(null);
  const [working, setWorking] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const [c, w] = await Promise.all([api.creditsCatalog(), api.creditsWallet()]); setCatalog(c); setWallet(w); }
    catch (e: any) { setNotice(e.message || 'Could not load purchase information.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const getPackage = (product: Product) => {
    const offering = product.offering_id ? offerings?.all?.[product.offering_id] : undefined;
    return offering?.availablePackages.find((p) => p.identifier === product.package_id && p.product.identifier === product.product_id
      && (product.kind === 'monthly' ? p.product.subscriptionPeriod === 'P1M' : !p.product.subscriptionPeriod));
  };
  const buy = async () => {
    if (!selection || working || !identityReady) return;
    setWorking(true);
    let intentId: string | undefined;
    try {
      const intent = await api.creditIntent(selection.product.id);
      intentId = intent.intent_id;
      await purchase(selection.pkg);
      setNotice('Store purchase received. Credits appear only after payment verification. If delayed, refresh status — do not buy again.');
      await load(); await refresh();
    } catch (e: any) {
      if (e?.userCancelled && intentId) {
        await api.cancelCreditIntent(intentId).catch(() => {});
        setNotice('Purchase cancelled in the store. No allowance was added.');
      } else setNotice(e?.message || 'Purchase status is uncertain. Refresh status before trying again.');
    } finally { setSelection(null); setWorking(false); }
  };
  const restorePurchases = async () => {
    try {
      const result = await restore(); await load(); await refresh();
      setNotice(result.entitlements.active.pro ? 'Eligible subscription found. Verified credits remain linked to your AiForge account.'
        : 'No active subscription found on this store account. Consumed packs are not recreated. Remaining purchased credits stay in your AiForge account.');
    } catch (e: any) { setNotice(e.message || 'Could not restore purchases.'); }
  };
  const manage = async () => {
    try { await Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions'); }
    catch { setNotice('Open your app store account → Subscriptions to manage or cancel.'); }
  };
  const refreshStatus = async () => { await load(); await refreshOffers(); setNotice('Balances refreshed. Pending payments do not unlock credits. Do not repeat a delayed purchase.'); };
  const visible = catalog?.products.filter((p) => p.kind === tab && (tab === 'monthly' || more || p.price_usd < 200)) || [];
  return <SafeAreaView style={styles.root} testID="plans-screen" edges={['top']}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}><Ionicons name="sparkles-outline" size={28} color={colors.cyan} /><Text testID="plans-title" style={styles.title}>Create on your terms</Text></View>
      <Text testID="plans-description" style={styles.body}>Monthly credits or a one-time pack. No unlimited promises. Every AI action is quoted before it starts.</Text>
      <View style={styles.wallet} testID="credit-wallet-card">
        <Text style={styles.eyebrow}>AVAILABLE CREDITS</Text><Text style={styles.balance} testID="credit-wallet-total">{wallet?.total.toLocaleString() ?? '—'}</Text>
        <View style={styles.row}>{[['Monthly', wallet?.monthly], ['Purchased', wallet?.purchased], ['Intro', wallet?.promo]].map(([name, value]) => <View style={styles.bucket} key={String(name)}>
          <Text style={styles.body}>{name}</Text><Text style={styles.bucketValue} testID={`credit-balance-${String(name).toLowerCase()}`}>{value?.toLocaleString() ?? '—'}</Text>
        </View>)}</View>
        {wallet?.lots.filter((x) => !!x.expires_at).map((lot) => <Text key={lot.id} style={styles.small} testID={`credit-expiry-${lot.id}`}>{lot.kind === 'monthly' ? 'Monthly' : 'Intro'}: {lot.remaining.toLocaleString()} expire {new Date(lot.expires_at!).toLocaleDateString()}</Text>)}
        <Text testID="credits-spending-order" style={styles.small}>Expiring credits are used first. Purchased credits never expire.</Text>
        {wallet?.starter_pending && <Text testID="starter-pending" style={styles.warning}>The 100-credit introduction is pending funded promotional availability. It is not a daily grant.</Text>}
      </View>
      {wallet && (wallet.legacy_tokens > 0 || wallet.legacy_plan !== 'free') && <View style={styles.note}>
        <Text testID="legacy-benefits" style={styles.body}>Existing {wallet.legacy_plan} terms and {wallet.legacy_tokens} legacy tokens are preserved separately. They have not been converted or overwritten.</Text>
      </View>}
      {__DEV__ && <Text testID="plans-test-store-notice" style={styles.warning}>Test Store preview — simulated purchases, not Google Play charges.</Text>}
      {!!notice && <Text testID="plans-purchase-status" style={styles.notice}>{notice}</Text>}
      <View style={styles.tabs}>{[['monthly', 'Monthly plans'], ['purchased', 'One-time packs']].map(([key, label]) => <Pressable testID={`plans-${key}-tab`} key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}><Text style={styles.text}>{label}</Text></Pressable>)}</View>
      <Text style={styles.body} testID="plans-period-terms">{tab === 'monthly' ? 'Renews monthly. Credits refresh on the paid billing anniversary; unused monthly credits expire at period end. Cancel before renewal in your store.' : 'No subscription required. One payment, no renewal. Purchased credits do not expire and cannot be transferred or redeemed for cash.'}</Text>
      {loading && <ActivityIndicator testID="plans-loading" color={colors.cyan} />}
      {visible.map((product) => {
        const pkg = getPackage(product);
        // Conservative floor retains >=50% of net after 30% store fees,
        // 1% billing fees, 5% refund reserve and the full AI allocation.
        const floor = pkg?.product.currencyCode === 'USD' ? product.credits / 320 : product.minimum_local_prices?.[pkg?.product.currencyCode || ''];
        const priceApproved = !!pkg && floor !== undefined && pkg.product.price >= floor;
        const enabled = product.available && priceApproved && identityReady && !working && !isPurchasing && !isRestoring;
        return <View key={product.id} testID={`catalog-${product.id}`} style={[styles.product, product.suggested && styles.suggested]}>
          {product.suggested && <Text testID="creator-suggested" style={styles.tag}>SUGGESTED STARTING POINT</Text>}
          <View style={styles.row}><Text style={styles.productName}>{product.name}</Text><Text style={styles.price} testID={`price-${product.id}`}>{pkg?.product.priceString || `$${product.price_usd.toFixed(2)}`}</Text></View>
          <Text testID={`allowance-${product.id}`} style={styles.allowance}>{product.credits.toLocaleString()} credits {tab === 'monthly' ? '/ billing month' : '· one time'}</Text>
          {!pkg && <Text style={styles.small} testID={`reference-price-${product.id}`}>USD reference price — live localized store price not available yet.</Text>}
          {!enabled && <Text style={styles.small} testID={`availability-${product.id}`}>{!identityReady ? 'Sign-in and store identity must be ready before buying.' : product.reason || (pkg && !priceApproved ? 'This market’s price needs verification before this allowance can be sold.' : 'Matching monthly/consumable store product is not available on this device.')}</Text>}
          <Pressable testID={`buy-${product.id}`} disabled={!enabled} onPress={() => pkg && setSelection({ product, pkg })} style={[styles.buy, !enabled && styles.disabled]}>
            <Text style={styles.buyText}>{enabled ? `Review ${product.name}` : 'Not available to purchase'}</Text>
          </Pressable>
        </View>;
      })}
      {tab === 'purchased' && <Pressable testID="plans-more-packs" onPress={() => setMore(!more)} style={styles.link}><Text style={styles.linkText}>{more ? 'Fewer packs' : 'More packs · $249.99–$999.99'}</Text></Pressable>}
      <View style={styles.note}><Text style={styles.productName}>What can credits create?</Text>
        {catalog?.examples.length ? catalog.examples.map((x) => <Text key={`${x.action}-${x.quality}`} testID={`quote-example-${x.action}-${x.quality}`} style={styles.body}>{x.action.replace('_', ' ')} · {x.quality}: {x.credits} credits for the displayed request limit</Text>) : <Text testID="quotes-awaiting-pricing" style={styles.body}>Provider costs and funded reserves are being verified. No made-up generation counts are advertised. Unpriced AI tools and video generation remain unavailable; local editing stays free.</Text>}
      </View>
      <Pressable testID="plans-refresh-status" onPress={refreshStatus} disabled={loading || working} style={styles.link}><Text style={styles.linkText}>Refresh purchase status</Text></Pressable>
      <Pressable testID="plans-restore-purchases" onPress={restorePurchases} disabled={!identityReady || isRestoring || working} style={styles.link}><Text style={styles.linkText}>{isRestoring ? 'Restoring…' : 'Restore eligible purchases'}</Text></Pressable>
      <Pressable testID="plans-manage-subscription" onPress={manage} style={styles.link}><Text style={styles.linkText}>Manage or cancel subscription</Text></Pressable>
      <Text testID="plans-billing-terms" style={styles.small}>Prices and renewal terms shown by your store control your purchase. Pending payments do not grant credits. Refunds follow store policies and applicable law. Deleting AiForge does not cancel a subscription.</Text>
      <View style={styles.row}><Pressable testID="plans-terms-link" onPress={() => router.push('/legal/terms')} style={styles.link}><Text style={styles.linkText}>Terms</Text></Pressable><Pressable testID="plans-privacy-link" onPress={() => router.push('/legal/privacy')} style={styles.link}><Text style={styles.linkText}>Privacy</Text></Pressable><Pressable testID="plans-credit-history" onPress={() => router.push('/credits-history')} style={styles.link}><Text style={styles.linkText}>Usage history</Text></Pressable></View>
    </ScrollView>
    <Modal testID="plans-purchase-dialog" visible={!!selection} transparent animationType="slide" onRequestClose={() => !working && setSelection(null)}>
      <View testID="plans-purchase-confirmation" style={styles.scrim}><SafeAreaView style={styles.confirm} edges={['bottom']}>
        <Text style={styles.productName} testID="purchase-confirm-title">Review your purchase</Text>
        <Text style={styles.balance} testID="purchase-confirm-price">{selection?.pkg.product.priceString}</Text>
        <Text style={styles.body} testID="purchase-confirm-details">{selection?.product.credits.toLocaleString()} credits. {selection?.product.kind === 'monthly' ? 'Auto-renews monthly. Unused monthly credits expire each period.' : 'One-time purchase. No subscription. Credits never expire.'}</Text>
        {(selection?.product.price_usd || 0) >= 200 && <Text testID="large-pack-warning" style={styles.warning}>This is a high-value purchase. Review the full localized amount carefully. Credits are not cash and cannot be withdrawn.</Text>}
        {__DEV__ && <Text style={styles.warning} testID="purchase-simulation-disclosure">Test Store simulation — no real store charge.</Text>}
        <Pressable testID="purchase-final-confirm" onPress={buy} disabled={working} style={styles.buy}>{working ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.buyText}>Continue to store confirmation</Text>}</Pressable>
        <Pressable testID="purchase-cancel" disabled={working} onPress={() => setSelection(null)} style={styles.link}><Text style={styles.linkText}>Cancel</Text></Pressable>
      </SafeAreaView></View>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg }, content: { padding: 22, gap: 22, paddingBottom: 120 },
  heading: { gap: 12 }, title: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -0.8 },
  body: { fontSize: 15, lineHeight: 23, color: colors.textDim }, small: { fontSize: 12, lineHeight: 19, color: colors.textDim },
  text: { color: colors.text, fontSize: 14, fontWeight: '700' }, row: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  wallet: { borderRadius: 24, backgroundColor: colors.cyan + '0C', borderWidth: 1, borderColor: colors.cyan + '44', padding: 22, gap: 18 },
  eyebrow: { color: colors.cyan, fontSize: 11, letterSpacing: 2, fontWeight: '800' }, balance: { color: colors.text, fontSize: 40, fontWeight: '800' },
  bucket: { gap: 5 }, bucketValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  note: { padding: 18, borderRadius: radius.lg, backgroundColor: colors.text + '08', gap: 12 },
  warning: { color: colors.yellow, fontSize: 13, lineHeight: 21 }, notice: { color: colors.cyan, fontSize: 14, lineHeight: 22 },
  tabs: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, alignItems: 'center', paddingVertical: 15, minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.text + '09' },
  tabActive: { borderWidth: 1, borderColor: colors.cyan, backgroundColor: colors.cyan + '12' },
  product: { borderWidth: 1, borderColor: colors.text + '18', borderRadius: 22, padding: 20, gap: 14 }, suggested: { borderColor: colors.cyan + '88' },
  tag: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.cyan }, productName: { color: colors.text, fontSize: 21, fontWeight: '800' },
  price: { color: colors.text, fontSize: 24, fontWeight: '700' }, allowance: { color: colors.cyan, fontSize: 17, fontWeight: '600' },
  buy: { backgroundColor: colors.cyan, borderRadius: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center', padding: 12 },
  buyText: { color: colors.bg, fontWeight: '800', fontSize: 14, textAlign: 'center' }, disabled: { opacity: 0.35 },
  link: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }, linkText: { fontSize: 14, color: colors.cyan },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.bg + 'DD' }, confirm: { padding: 26, gap: 22, backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.cyan + '66', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
});