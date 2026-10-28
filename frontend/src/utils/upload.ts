/**
 * Multipart upload helper for Expo + FastAPI.
 *
 * Rules enforced here (see TTS/STT playbooks):
 *   - NEVER append RN's bare { uri, name, type } shape — throws
 *     `Unsupported FormDataPart implementation` on real phones.
 *   - On native, read `file://` with `fetch` from `expo/fetch` (the module
 *     named import, same as the global in SDK 54+), take its `.blob()`, and
 *     append the Blob. `expo/fetch` reads file:// on both iOS and Android;
 *     RN's own fetch does not.
 *   - On web, use the standard `fetch(uri).blob()`.
 *   - Do NOT set Content-Type on the request — the FormData boundary header
 *     is set for us.
 *   - Never set `Accept: application/json` only; let the server reply as it will.
 */
import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { requestCreditQuote } from '@/src/lib/creditQuote';

export type UploadFilePart = {
  uri: string;
  name: string;
  mimeType?: string;
};

export type UploadOptions = {
  files?: Record<string, UploadFilePart>;
  fields?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

async function readAsBlob(part: UploadFilePart): Promise<Blob> {
  if (Platform.OS === 'web') {
    const r = await fetch(part.uri);
    return r.blob();
  }
  // Native: use expo/fetch to read file:// — the only cross-platform way.
  const r = await expoFetch(part.uri);
  return r.blob() as unknown as Promise<Blob>;
}

export async function uploadForm<T = unknown>(
  url: string,
  { files = {}, fields = {}, headers = {}, timeoutMs = 60_000 }: UploadOptions,
): Promise<T> {
  if (url.endsWith('/voice/stt')) {
    headers = { ...headers, 'X-Credit-Quote': await requestCreditQuote({ apiBase: url.slice(0, -'/voice/stt'.length), path: '/voice/stt', payload: { seconds: 60 }, headers }) };
  }
  const form = new FormData();

  for (const [field, part] of Object.entries(files)) {
    const blob = await readAsBlob(part);
    // Use the three-arg FormData.append so the server sees the filename.
    form.append(field, blob as any, part.name);
  }
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      body: form as any,
      headers, // DO NOT set Content-Type — RN sets the boundary.
      signal: controller.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(body || `Upload failed (${r.status})`);
    }
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      return (await r.json()) as T;
    }
    return (await r.text()) as unknown as T;
  } finally {
    clearTimeout(timeoutId);
  }
}
