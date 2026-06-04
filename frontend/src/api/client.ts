import { storage } from '@/src/utils/storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const API = `${BASE}/api`;
const TOKEN_KEY = 'aiforge_token';

export type User = {
  id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  plan: string;
  daily_used: number;
  daily_limit: number;
  referral_code?: string | null;
  bonus_until?: string | null;
  bonus_amount?: number;
};

export type Creation = {
  id: string;
  type: 'image' | 'video' | 'model3d' | 'chat';
  title: string;
  prompt: string;
  status: 'ready' | 'processing' | 'failed';
  media_data?: string | null;
  media_mime?: string | null;
  preview_image?: string | null;
  error?: string | null;
  created_at: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
};

export type Plan = {
  id: string;
  name: string;
  price: number;
  limit: number;
  features: string[];
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, '');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = `Request failed: ${res.status}`;
    try {
      const j = await res.json();
      detail = (j.detail as string) || detail;
    } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  async register(email: string, password: string, name?: string, referralCode?: string) {
    return request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, referral_code: referralCode || undefined }),
    });
  },
  async login(email: string, password: string) {
    return request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  async googleAuth(sessionId: string) {
    return request<{ token: string; user: User }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  },
  async me() {
    return request<User>('/auth/me');
  },
  async deleteMe() {
    return request<{ deleted: boolean }>('/auth/me', { method: 'DELETE' });
  },
  async setToken(token: string) {
    await storage.secureSet(TOKEN_KEY, token);
  },
  async clearToken() {
    await storage.secureRemove(TOKEN_KEY);
  },
  async getToken() {
    return storage.secureGet<string>(TOKEN_KEY, '');
  },
  async generate(payload: {
    type: 'image' | 'video' | 'model3d' | 'chat';
    prompt: string;
    title?: string;
    duration?: number;
    size?: string;
  }) {
    return request<Creation>('/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async chat(prompt: string, sessionId?: string) {
    return request<{ reply: string; session_id: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt, session_id: sessionId }),
    });
  },
  async generateScad(prompt: string) {
    return request<Creation>('/generate/scad', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  },
  async listCreations(type?: string) {
    const q = type ? `?type=${type}` : '';
    return request<Creation[]>(`/creations${q}`);
  },
  async getCreation(id: string) {
    return request<Creation>(`/creations/${id}`);
  },
  async deleteCreation(id: string) {
    return request<{ deleted: boolean }>(`/creations/${id}`, { method: 'DELETE' });
  },
  async creationStats() {
    return request<{ image: number; video: number; model3d: number; chat: number }>(
      '/creations/stats',
    );
  },
  async referralsMe() {
    return request<{
      code: string;
      referred_count: number;
      bonus_amount: number;
      bonus_until: string | null;
      share_text: string;
    }>('/referrals/me');
  },
  async plans() {
    return request<Plan[]>('/plans');
  },
  async createCheckout(plan: string, originUrl: string) {
    return request<{ url: string; session_id: string }>('/checkout/create', {
      method: 'POST',
      body: JSON.stringify({ plan, origin_url: originUrl }),
    });
  },
  async checkoutStatus(sessionId: string) {
    return request<{
      session_id: string;
      status: string;
      payment_status: string;
      amount_total: number;
      currency: string;
      plan: string;
    }>(`/checkout/status/${sessionId}`);
  },
  // ---- Admin (owner-only) ----
  async adminMe() {
    return request<{ is_admin: boolean; email: string }>('/admin/me');
  },
  async adminGetStripeKey() {
    return request<{
      mode: string;
      fingerprint: string;
      updated_at: string;
      is_sandbox: boolean;
      is_live: boolean;
    }>('/admin/stripe-key');
  },
  async adminSetStripeKey(key: string) {
    return request<{
      ok: boolean;
      mode: string;
      fingerprint: string;
      updated_at: string;
      message: string;
    }>('/admin/stripe-key', {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
  },
  async adminResetStripeKey() {
    return request<{ ok: boolean; mode: string; fingerprint: string; updated_at: string }>(
      '/admin/stripe-key',
      { method: 'DELETE' },
    );
  },
};

export const BACKEND_URL = BASE;
