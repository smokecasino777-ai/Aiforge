import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider } from '@/src/context/AuthContext';
import {
  initializeRevenueCat,
  SubscriptionProvider,
} from '@/src/lib/revenuecat';
import CreditQuoteModal from '@/src/components/CreditQuoteModal';

SplashScreen.preventAutoHideAsync();

// MODULE-SCOPE Sentry init — must run before any screen renders so a crash
// during the first paint is still captured. The DSN is a PUBLIC key (safe
// to ship in the client bundle), hence EXPO_PUBLIC_*.
//
// Validation: a real DSN looks like `https://<key>@o<org>.ingest.sentry.io/<id>`.
// We've been bitten by users pasting documentation / CLI output into the
// secrets form, which Sentry.init treats as a fatal boot error. The regex
// below rejects anything that isn't a plausible HTTPS DSN BEFORE we call
// Sentry.init, so a bad value just disables crash reporting instead of
// crashing the app on launch night.
const RAW_SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const DSN_PATTERN = /^https:\/\/[^@\s]+@[^/\s]+\/\d+$/;
const SENTRY_DSN =
  typeof RAW_SENTRY_DSN === 'string' && DSN_PATTERN.test(RAW_SENTRY_DSN.trim())
    ? RAW_SENTRY_DSN.trim()
    : undefined;
if (!SENTRY_DSN && RAW_SENTRY_DSN) {
  console.warn(
    'Sentry disabled: EXPO_PUBLIC_SENTRY_DSN is not a valid DSN URL. ' +
      "Expected 'https://<key>@o<org>.ingest.sentry.io/<id>'.",
  );
}
if (SENTRY_DSN) {
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      // Opt in to session tracking so error-free sessions show up on the
      // Sentry dashboard, which is what the Play Store launch dashboard
      // reads. tracesSampleRate 0 keeps perf costs flat for launch night;
      // we can turn it up post-launch.
      enableAutoSessionTracking: true,
      tracesSampleRate: 0,
      // Only report in prod and preview — dev crashes are developer noise.
      enabled: !__DEV__,
      environment: __DEV__ ? 'development' : 'production',
    });
  } catch (err) {
    console.warn('Sentry init failed (non-fatal):', err);
  }
}

// MODULE-SCOPE: configure RevenueCat exactly once, before any component
// mounts. Wrapped in try/catch so a misconfiguration never crashes the app.
try {
  initializeRevenueCat();
} catch (err) {
  // Non-fatal: the paywall will render the "unavailable" branch and the rest
  // of the app continues to work on the free tier.
  console.warn('RevenueCat unavailable:', err);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#020208' }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SubscriptionProvider>
              <CreditQuoteModal />
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#020208' } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="creation/[id]" options={{ presentation: 'card', animation: 'slide_from_right' }} />
                <Stack.Screen name="editor" options={{ presentation: 'card', animation: 'slide_from_right' }} />
                <Stack.Screen name="cad" options={{ presentation: 'card', animation: 'slide_from_right' }} />
                <Stack.Screen name="avatar" options={{ presentation: 'card', animation: 'slide_from_right' }} />
                <Stack.Screen name="legal/privacy" options={{ presentation: 'card', animation: 'slide_from_right' }} />
                <Stack.Screen name="legal/terms" options={{ presentation: 'card', animation: 'slide_from_right' }} />
                <Stack.Screen name="admin/secrets" options={{ presentation: 'card', animation: 'slide_from_right' }} />
                <Stack.Screen name="payment/success" options={{ presentation: 'modal' }} />
                <Stack.Screen name="payment/cancel" options={{ presentation: 'modal' }} />
              </Stack>
            </SubscriptionProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Wrap the root so render-time crashes also reach Sentry. In dev or when
// no DSN is set, Sentry.wrap is a cheap passthrough.
export default SENTRY_DSN ? Sentry.wrap(RootLayout) : RootLayout;
