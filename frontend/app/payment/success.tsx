import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2 } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PulsingLogo from '@/src/components/Logo';
import { colors } from '@/src/theme/colors';
import { api } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';

export default function PaymentSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const { refresh, user } = useAuth();
  const [status, setStatus] = useState<'checking' | 'paid' | 'pending' | 'error'>('checking');

  useEffect(() => {
    let mounted = true;
    let sessionId = params.session_id;
    if (Platform.OS === 'web' && !sessionId && typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      sessionId = q.get('session_id') || undefined;
    }
    if (!sessionId) {
      setStatus('error');
      return;
    }
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const s = await api.checkoutStatus(sessionId!);
        if (!mounted) return;
        if (s.payment_status === 'paid') {
          await refresh();
          setStatus('paid');
          return;
        }
      } catch {}
      if (attempts >= 8) {
        if (mounted) setStatus('pending');
        return;
      }
      setTimeout(poll, 1500);
    };
    poll();
    return () => {
      mounted = false;
    };
  }, [params.session_id, refresh]);

  return (
    <View style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.center}>
          <PulsingLogo size={56} textSize={26} />
          {status === 'checking' ? (
            <>
              <ActivityIndicator color={colors.cyan} size="large" style={{ marginTop: 30 }} />
              <Text style={styles.title}>Confirming payment…</Text>
            </>
          ) : status === 'paid' ? (
            <>
              <CheckCircle2 size={64} color={colors.green} strokeWidth={2} style={{ marginTop: 24 }} />
              <Text style={styles.title}>Welcome aboard!</Text>
              <Text style={styles.sub}>
                Your plan is now <Text style={{ color: colors.green, fontWeight: '900' }}>{(user?.plan || 'spark').toUpperCase()}</Text>. Time to forge.
              </Text>
              <GradientButton
                title="Start Creating"
                onPress={() => router.replace('/(tabs)')}
                style={{ marginTop: 28 }}
                testID="pay-back-home"
              />
            </>
          ) : (
            <>
              <Text style={[styles.title, { marginTop: 30 }]}>Almost there…</Text>
              <Text style={styles.sub}>Your payment is still processing. Check Profile shortly.</Text>
              <GradientButton
                title="Back to App"
                onPress={() => router.replace('/(tabs)')}
                style={{ marginTop: 24 }}
                variant="outline"
                testID="pay-back-pending"
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 16, textAlign: 'center' },
  sub: { color: colors.textDim, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 21 },
});
