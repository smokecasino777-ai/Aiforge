/**
 * Emergent-managed Google Auth helpers.
 *
 * Flow (per Emergent Mobile Auth playbook):
 *  - Mobile: openAuthSessionAsync → read session_id from result.url.
 *  - Web: full-page redirect to auth.emergentagent.com; on return the root
 *    layout's GoogleSessionCatcher parses #session_id from the URL.
 *  - The session_id is exchanged for our own JWT via POST /api/auth/google.
 */
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

const AUTH_PORTAL = 'https://auth.emergentagent.com/';

export function extractSessionId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[#?&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Starts Google sign-in.
 * Returns the session_id on mobile success, or null when the flow completes
 * elsewhere (web full-page redirect) or the user cancelled.
 */
export async function startGoogleSignIn(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const redirectUrl = window.location.origin + '/';
    window.location.href = `${AUTH_PORTAL}?redirect=${encodeURIComponent(redirectUrl)}`;
    return null;
  }
  // 'login' is a real route (app/(auth)/login.tsx → /login) so cold-start
  // deep links (aiforge://login#session_id=...) land somewhere valid.
  const redirectUrl = Linking.createURL('login');
  const authUrl = `${AUTH_PORTAL}?redirect=${encodeURIComponent(redirectUrl)}`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
  if (result.type === 'success' && 'url' in result && result.url) {
    return extractSessionId(result.url);
  }
  return null;
}
