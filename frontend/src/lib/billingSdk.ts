import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

export const rcEnabled = Platform.OS !== 'web' || __DEV__;
let configured = false;
export const isBillingConfigured = () => configured;

export function initializeRevenueCat(): void {
  if (!rcEnabled || configured) return;
  const testing = Platform.OS === 'web' || __DEV__;
  const key = testing ? process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY
    : Platform.OS === 'android' ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  const prefix = testing ? 'test_' : Platform.OS === 'android' ? 'goog_' : 'appl_';
  if (!key?.startsWith(prefix)) throw new Error('Billing configuration unavailable for this platform.');
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: key });
  configured = true;
}

export async function requireIdentity(expectedUserId: string | undefined): Promise<void> {
  // originalAppUserId can remain anonymous after an alias merge.
  // getAppUserID is the currently logged-in SDK identity.
  const currentId = await Purchases.getAppUserID();
  if (!expectedUserId || currentId !== expectedUserId || currentId.startsWith('$RCAnonymousID:')) {
    throw new Error('identity_not_ready');
  }
}

export async function rcLogIn(userId: string): Promise<string | null> {
  if (!rcEnabled || !configured) return null;
  try {
    await Purchases.logIn(userId);
    await requireIdentity(userId);
    return userId;
  } catch {
    // AuthContext surfaces this null as a blocking purchase-identity banner.
    return null;
  }
}

export async function rcLogOut(): Promise<void> {
  if (!rcEnabled || !configured) return;
  try {
    if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch {
    // The auth user is already cleared; purchase guards stay closed.
    console.warn('Billing sign-out unavailable; purchases remain blocked until sign-in.');
  }
}