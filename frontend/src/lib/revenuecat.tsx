/** Store SDK state for UI; paid API access is independently verified server-side. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useContext, useEffect } from 'react';
import Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { api } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';
import { rcEnabled, isBillingConfigured, requireIdentity } from './billingSdk';
export { initializeRevenueCat, rcEnabled } from './billingSdk';

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = 'pro';

async function readVerifiedPlan(): Promise<void> {
  // Read-only: never send a client claim to upgrade an account.
  try { await api.syncSubscription(); }
  catch { /* Plans displays pending verification instead of falsely granting access. */ }
}

function useSubscriptionContext() {
  const queryClient = useQueryClient();
  const { user, purchaseIdentityError } = useAuth();
  const userId = user?.id;
  const enabled = rcEnabled && isBillingConfigured() && !!userId && !purchaseIdentityError;
  const customerKey = ['revenuecat', 'customer-info', userId];

  const customerInfoQuery = useQuery({
    queryKey: customerKey,
    queryFn: async () => {
      await requireIdentity(userId);
      return Purchases.getCustomerInfo();
    },
    enabled,
    staleTime: 60 * 1000,
  });
  const offeringsQuery = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: () => Purchases.getOfferings(),
    enabled: rcEnabled && isBillingConfigured(),
    staleTime: 300 * 1000,
  });

  useEffect(() => {
    if (!enabled || !userId) return;
    let active = true;
    const listener = (info: CustomerInfo) => {
      void Purchases.getAppUserID().then((id) => {
        if (active && id === userId) {
          queryClient.setQueryData(['revenuecat', 'customer-info', userId], info);
        }
      }).catch(() => {});
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      active = false;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient, enabled, userId]);

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      if (!enabled) throw new Error('identity_not_ready');
      await requireIdentity(userId);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      queryClient.setQueryData(customerKey, customerInfo);
      await readVerifiedPlan();
      return customerInfo;
    },
  });
  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!enabled) throw new Error('identity_not_ready');
      await requireIdentity(userId);
      const info = await Purchases.restorePurchases();
      queryClient.setQueryData(customerKey, info);
      await readVerifiedPlan();
      return info;
    },
  });
  const identityReady = enabled && !!customerInfoQuery.data && !customerInfoQuery.isError;
  const isSubscribed = identityReady &&
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    identityReady,
    isLoading: customerInfoQuery.isFetching || offeringsQuery.isFetching,
    refreshOffers: async () => {
      await offeringsQuery.refetch();
      if (enabled) await customerInfoQuery.refetch();
    },
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