import { storage } from '@/src/utils/storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const API = `${BASE}/api`;
const TOKEN_KEY = 'aiforge_token';

// Short-lived sudo token for the locked admin panel. Memory-only by design:
// it never persists, so the panel relocks on every app launch.
let adminUnlockToken: string | null = null;
export function setAdminUnlockToken(t: string | null) {
  adminUnlockToken = t;
}

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
    ...(path.startsWith('/admin') && adminUnlockToken
      ? { 'X-Admin-Unlock': adminUnlockToken }
      : {}),
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
  async adminUnlock(password: string) {
    return request<{ sudo_token: string; expires_in_minutes: number }>('/admin/unlock', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
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
  async adminListUsers() {
    return request<{
      users: Array<{
        user_id: string;
        email: string;
        name?: string;
        plan: string;
        auth_provider?: string;
        created_at?: string;
        is_admin?: boolean;
      }>;
      count: number;
    }>('/admin/users');
  },
  async adminResetUserPassword(email: string, newPassword: string) {
    return request<{ ok: boolean; email: string; message: string }>(
      '/admin/reset-user-password',
      {
        method: 'POST',
        body: JSON.stringify({ email, new_password: newPassword }),
      },
    );
  },
  // ---- Editor (AI image / video edit) ----
  async editorEnhance(image_b64: string) {
    return request<{ image_b64: string; media_mime: string; op: string }>(
      '/editor/enhance',
      { method: 'POST', body: JSON.stringify({ image_b64 }) },
    );
  },
  async editorStyle(image_b64: string, style: string) {
    return request<{ image_b64: string; media_mime: string; op: string }>(
      '/editor/style',
      { method: 'POST', body: JSON.stringify({ image_b64, style }) },
    );
  },
  async editorBgRemove(image_b64: string) {
    return request<{ image_b64: string; media_mime: string; op: string }>(
      '/editor/bg-remove',
      { method: 'POST', body: JSON.stringify({ image_b64 }) },
    );
  },
  async editorCaption(prompt: string, opts?: { title?: string; media_type?: string }) {
    return request<{ hook: string; caption: string; hashtags: string[] }>(
      '/editor/caption',
      {
        method: 'POST',
        body: JSON.stringify({ prompt, ...(opts || {}) }),
      },
    );
  },
  async editorSave(payload: {
    media_b64: string;
    media_mime: string;
    type: 'image' | 'video' | 'model3d';
    title: string;
    prompt: string;
    width?: number;
    height?: number;
    duration?: number;
  }) {
    return request<{ creation_id: string; ok: boolean }>('/editor/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  // ---- Avatar Maker ----
  async avatarGenerate(prompt: string, style: string) {
    return request<{ creation_id: string; image_b64: string; media_mime: string; style: string }>(
      '/avatar/generate',
      { method: 'POST', body: JSON.stringify({ prompt, style }) },
    );
  },
  async avatarSet(image_b64: string, media_mime = 'image/png') {
    return request<{ ok: boolean; user: any }>(
      '/avatar/set',
      { method: 'POST', body: JSON.stringify({ image_b64, media_mime }) },
    );
  },
  async avatarClear() {
    return request<{ ok: boolean; user: any }>('/avatar/clear', { method: 'POST' });
  },
};

export const BACKEND_URL = BASE;
