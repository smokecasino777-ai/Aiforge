/**
 * RevenueCat subscription provider — ONE "pro" entitlement, two packages
 * ($rc_monthly / $rc_annual). See the playbook sections referenced inline.
 *
 * Rules enforced here:
 *   - SDK init happens at module scope via initializeRevenueCat(), NOT in a
 *     component effect. See _layout.tsx.
 *   - Never hardcode prices — read via `offerings.current.availablePackages`.
 *   - Pro gating is client-side: SDK CustomerInfo is the source of truth. The
 *     backend's user.plan field is kept in sync separately (see
 *     syncBackendPlan) so server-side daily-limit enforcement for free users
 *     still works — but the subscription state itself is RevenueCat's.
 *   - logIn / logOut are COMPULSORY on every auth path (handled in AuthContext).
 *   - restorePurchases must be surfaced in the UI.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

import { api } from '@/src/api/client';

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = 'pro';

// Enabled on native (store builds + Expo Go via Test Store) and on web only
// in dev (preview panel uses the Test Store too).
export const rcEnabled = Platform.OS !== 'web' || __DEV__;

function getRevenueCatApiKey(): string {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error(
      'RevenueCat public API keys not found — set EXPO_PUBLIC_REVENUECAT_* in .env.',
    );
  }
  // Expo Go and the web dev preview don't have the native billing module, so
  // they use RevenueCat's Browser Mode against the Test Store. Store builds
  // use the real native key for their platform.
  if (Platform.OS === 'web' || __DEV__) return REVENUECAT_TEST_API_KEY;
  if (Platform.OS === 'ios') return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

/**
 * Call ONCE at module scope — NOT inside a component — before anything mounts.
 * Idempotent-ish: calling twice logs a warning but doesn't crash.
 */
export function initializeRevenueCat(): void {
  if (!rcEnabled) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: getRevenueCatApiKey() });
}

/**
 * Nudges the backend to update user.plan based on the current entitlement so
 * server-side daily-limit enforcement sees a pro user as pro. See
 * backend/routes/subscription.py.
 *
 * Returns true when the backend accepted the update, false otherwise.
 * Never throws — RevenueCat is still the client-side source of truth.
 */
async function syncBackendPlan(info: CustomerInfo | undefined): Promise<boolean> {
  if (!info) return false;
  const isPro = info.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
  try {
    await api.syncSubscription({
      entitlement_active: isPro,
      product_id: info.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER]?.productIdentifier,
      expires_at: info.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER]?.expirationDate,
    });
    return true;
  } catch (e) {
    console.warn('[RevenueCat] syncBackendPlan failed (non-fatal):', e);
    return false;
  }
}

function useSubscriptionContext() {
  const queryClient = useQueryClient();

  const customerInfoQuery = useQuery({
    queryKey: ['revenuecat', 'customer-info'],
    queryFn: () => Purchases.getCustomerInfo(),
    enabled: rcEnabled,
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: () => Purchases.getOfferings(),
    enabled: rcEnabled,
    staleTime: 300 * 1000,
  });

  // Reactive entitlement updates — the SDK pushes fresh CustomerInfo after
  // purchases, restores, renewals, and logIn/logOut. We mirror into the
  // query cache AND trigger a backend sync so user.plan stays accurate.
  useEffect(() => {
    if (!rcEnabled) return;
    const listener = (info: CustomerInfo) => {
      queryClient.setQueryData(['revenuecat', 'customer-info'], info);
      void syncBackendPlan(info);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient]);

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      const id = (await Purchases.getCustomerInfo()).originalAppUserId;
      if (id.startsWith('$RCAnonymousID:')) {
        throw new Error('identity_not_ready');
      }
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      await syncBackendPlan(customerInfo);
      return customerInfo;
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const info = await Purchases.restorePurchases();
      await syncBackendPlan(info);
      return info;
    },
  });

  const isSubscribed =
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  const originalAppUserId = customerInfoQuery.data?.originalAppUserId;
  const identityReady = !!originalAppUserId && !originalAppUserId.startsWith('$RCAnonymousID:');

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    identityReady,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useSubscription must be used within a SubscriptionProvider');
  return ctx;
}

/**
 * Thin wrapper used by AuthContext to bind the backend user id to RevenueCat.
 * Returns the resolved appUserId or null on failure (never throws).
 */
export async function rcLogIn(userId: string): Promise<string | null> {
  if (!rcEnabled) return null;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo.originalAppUserId;
  } catch (e) {
    console.warn('[RevenueCat] logIn failed:', e);
    return null;
  }
}

export async function rcLogOut(): Promise<void> {
  if (!rcEnabled) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn('[RevenueCat] logOut failed:', e);
  }
}
