import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  const refresh = async () => {
    try {
      const token = await api.getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const me = await api.me();
      setUser(me);
    } catch {
      await api.clearToken();
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const r = await api.login(email, password);
    await api.setToken(r.token);
    setUser(r.user);
  };

  const signUp = async (email: string, password: string, name?: string) => {
    const r = await api.register(email, password, name);
    await api.setToken(r.token);
    setUser(r.user);
  };

  const signInWithGoogleSession = async (sessionId: string) => {
    const r = await api.googleAuth(sessionId);
    await api.setToken(r.token);
    setUser(r.user);
  };

  const signOut = async () => {
    await api.clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogleSession, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
