import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';
import { extractSessionId } from '@/src/utils/googleAuth';

SplashScreen.preventAutoHideAsync();

/**
 * Catches the `session_id` Emergent Google Auth bounces back to us:
 * web = URL hash on mount; native = cold-start URL or hot deep link.
 * Exchanges it for our JWT, then routes into the app.
 */
function OAuthSessionCatcher() {
  const { signInWithGoogleSession } = useAuth();
  const router = useRouter();
  const processedRef = useRef<Set<string>>(new Set());

  const process = async (url: string | null | undefined) => {
    const sid = extractSessionId(url);
    if (!sid || processedRef.current.has(sid)) return;
    processedRef.current.add(sid);
    try {
      await signInWithGoogleSession(sid);
      router.replace('/(tabs)');
    } catch {
      // silent — user stays on the current screen and can retry
    } finally {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch {
          /* ignore */
        }
      }
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.location.href.includes('session_id=')) {
        void process(window.location.href);
      }
      return;
    }
    Linking.getInitialURL().then((url) => {
      if (url && url.includes('session_id=')) void process(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url && url.includes('session_id=')) void process(url);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

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
        <AuthProvider>
          <OAuthSessionCatcher />
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
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
