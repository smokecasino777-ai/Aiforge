import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XCircle } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PulsingLogo from '@/src/components/Logo';
import { colors } from '@/src/theme/colors';

/**
 * Landing page when a user cancels / dismisses the Stripe hosted checkout.
 * No plan change happens here — this screen just reassures them and offers
 * a way back into the app. (See routes/checkout.py cancel_url builder.)
 */
export default function PaymentCancel() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <View style={styles.center}>
        <View style={styles.logoWrap}>
          <PulsingLogo size={72} />
        </View>
        <XCircle color={colors.red} size={56} />
        <Text style={styles.title}>Checkout cancelled</Text>
        <Text style={styles.sub}>
          No charge was made and your plan is unchanged. You can pick a plan
          again whenever you’re ready.
        </Text>
        <View style={styles.actions}>
          <GradientButton
            title="Back to Plans"
            onPress={() => router.replace('/(tabs)/plans')}
          />
          <View style={{ height: 12 }} />
          <GradientButton
            title="Keep Browsing"
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoWrap: { marginBottom: 24 },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  sub: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  actions: { marginTop: 32, width: '100%', maxWidth: 320 },
});
