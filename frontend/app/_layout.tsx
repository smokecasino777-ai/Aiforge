import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider } from '@/src/context/AuthContext';
import {
  initializeRevenueCat,
  SubscriptionProvider,
} from '@/src/lib/revenuecat';

SplashScreen.preventAutoHideAsync();

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

export default function RootLayout() {
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
