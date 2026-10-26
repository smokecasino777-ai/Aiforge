import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';

import { api, User } from '@/src/api/client';
import { rcLogIn, rcLogOut } from '@/src/lib/revenuecat';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  purchaseIdentityError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    name?: string,
    referralCode?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Non-fatal: surfaces as a banner in the Plans screen when RevenueCat
  // identity can't be bound (which would mean a purchase would be anonymous).
  const [purchaseIdentityError, setPurchaseIdentityError] = useState<string | null>(null);

  const bindRevenueCatIdentity = useCallback(async (uid: string | null) => {
    if (!uid) {
      await rcLogOut();
      setPurchaseIdentityError(null);
      return;
    }
    const bound = await rcLogIn(uid);
    if (bound && !bound.startsWith('$RCAnonymousID:')) {
      setPurchaseIdentityError(null);
    } else {
      setPurchaseIdentityError(
        'Could not connect to the subscription service. Purchases are temporarily unavailable — try again shortly.',
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const token = await api.getToken();
      if (!token) {
        setUser(null);
        await bindRevenueCatIdentity(null);
        return;
      }
      const me = await api.me();
      setUser(me);
      await bindRevenueCatIdentity(me.id);
    } catch {
      await api.clearToken();
      setUser(null);
      await bindRevenueCatIdentity(null);
    }
  }, [bindRevenueCatIdentity]);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const r = await api.login(email, password);
      await api.setToken(r.token);
      setUser(r.user);
      await bindRevenueCatIdentity(r.user.id);
    },
    [bindRevenueCatIdentity],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      name?: string,
      referralCode?: string,
    ) => {
      const r = await api.register(email, password, name, referralCode);
      await api.setToken(r.token);
      setUser(r.user);
      await bindRevenueCatIdentity(r.user.id);
    },
    [bindRevenueCatIdentity],
  );

  const signOut = useCallback(async () => {
    await api.clearToken();
    setUser(null);
    await bindRevenueCatIdentity(null);
  }, [bindRevenueCatIdentity]);

  const value = useMemo(
    () => ({
      user,
      loading,
      purchaseIdentityError,
      signIn,
      signUp,
      signOut,
      refresh,
    }),
    [user, loading, purchaseIdentityError, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
