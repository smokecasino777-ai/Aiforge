/**
 * Emergent-managed Google Sign-In helpers.
 *
 * Flow: user taps "Continue with Google" → we open Emergent's auth URL with
 * a `redirect=` param → after Google confirms the user, Emergent bounces the
 * browser back to our redirect URL with a `session_id` fragment. We hand that
 * `session_id` to our backend (`POST /api/auth/google`) which exchanges it for
 * user data + our JWT.
 */
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// NOTE: Emergent's docs recommend calling WebBrowser.maybeCompleteAuthSession()
// at module load, but on web this can wedge some tunnel setups. We defer it
// to inside startGoogleSignIn() where it's actually needed.
const AUTH_BASE = 'https://auth.emergentagent.com/';

/** Extract session_id from any URL — supports both hash (#) and query (?) params. */
export function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    // hash fragment: aiforge://auth#session_id=xxx
    const hashIdx = url.indexOf('#');
    if (hashIdx >= 0) {
      const frag = url.slice(hashIdx + 1);
      const params = new URLSearchParams(frag);
      const id = params.get('session_id');
      if (id) return id;
    }
    // query param fallback: aiforge://auth?session_id=xxx
    const qIdx = url.indexOf('?');
    if (qIdx >= 0) {
      const q = url.slice(qIdx + 1).split('#')[0];
      const params = new URLSearchParams(q);
      const id = params.get('session_id');
      if (id) return id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Kick off Google Sign-In. Returns a session_id if the user completes the flow.
 * Returns null if the user cancelled OR (on web) navigation is in progress and
 * the caller should not block the UI.
 */
export async function startGoogleSignIn(): Promise<string | null> {
  if (Platform.OS === 'web') {
    // Web: full-page redirect. The redirect URL must be an existing route so
    // we point at the app's root — the root layout re-parses window.location
    // on mount and processes any session_id it finds.
    const redirectUrl = window.location.origin + '/';
    const authUrl = `${AUTH_BASE}?redirect=${encodeURIComponent(redirectUrl)}`;
    window.location.href = authUrl;
    // Navigation is happening; nothing to return synchronously.
    return null;
  }

  // Mobile: open in an in-app browser tab and await the redirect.
  // `Linking.createURL('auth')` resolves to:
  //   Expo Go   → exp://<host>/--/auth
  //   Standalone → aiforge://auth (scheme from app.json)
  const redirectUrl = Linking.createURL('auth');
  const authUrl = `${AUTH_BASE}?redirect=${encodeURIComponent(redirectUrl)}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    return null;
  }
  return extractSessionId(result.url);
}
