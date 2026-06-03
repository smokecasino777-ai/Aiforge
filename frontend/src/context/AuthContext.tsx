import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, User } from '@/src/api/client';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogleSession: (sessionId: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await api.getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const me = await api.me();
      setUser((prev) => {
        if (
          prev &&
          prev.id === me.id &&
          prev.plan === me.plan &&
          prev.daily_used === me.daily_used &&
          prev.daily_limit === me.daily_limit &&
          prev.name === me.name &&
          prev.picture === me.picture
        ) {
          return prev;
        }
        return me;
      });
    } catch {
      await api.clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    await api.setToken(r.token);
    setUser(r.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const r = await api.register(email, password, name);
    await api.setToken(r.token);
    setUser(r.user);
  }, []);

  const signInWithGoogleSession = useCallback(async (sessionId: string) => {
    const r = await api.googleAuth(sessionId);
    await api.setToken(r.token);
    setUser(r.user);
  }, []);

  const signOut = useCallback(async () => {
    await api.clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signInWithGoogleSession, signOut, refresh }),
    [user, loading, signIn, signUp, signInWithGoogleSession, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
