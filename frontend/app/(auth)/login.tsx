import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/src/context/AuthContext';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import PulsingLogo from '@/src/components/Logo';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { Mail, Lock } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_EMAIL = 'jraycwalker@gmail.com';

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill email when user is forwarded from "Email already registered → Sign in instead"
  useEffect(() => {
    if (typeof params.email === 'string' && params.email && !email) {
      setEmail(params.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.email]);

  const doSignIn = async (e: string, p: string) => {
    setLoading(true);
    try {
      await signIn(e, p);
      router.replace('/(tabs)');
    } catch (err: any) {
      const raw = (err?.message || '').toLowerCase();
      const isCreds = raw.includes('invalid') || raw.includes('401');
      const friendly = isCreds
        ? 'Email and password don’t match.'
        : err?.message || 'Something went wrong. Try again.';
      Alert.alert('Sign-in failed', friendly, [
        { text: 'Try again', style: 'cancel' },
        { text: 'Forgot password?', onPress: showRecovery },
        {
          text: 'Create account',
          onPress: () =>
            router.push({ pathname: '/(auth)/register', params: { email: e } }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onLogin = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      Alert.alert('Required', 'Enter your email and password to sign in.');
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert('Check email format', 'Please enter a valid email address.');
      return;
    }
    await doSignIn(trimmed, password);
  };

  const showRecovery = () => {
    Alert.alert(
      'Reset your password',
      `Email us at ${SUPPORT_EMAIL} from your registered email address and a fresh password will be issued for your account right away.`,
      [
        {
          text: 'Email support',
          onPress: () =>
            Linking.openURL(
              `mailto:${SUPPORT_EMAIL}?subject=AiForge password reset&body=Please reset the password for my AiForge account: ${email.trim() || '(your account email)'}`,
            ).catch(() => {}),
        },
        { text: 'OK' },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <PulsingLogo size={66} textSize={32} />
              <Text style={styles.tag}>AI-Powered Creation</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.sub}>Sign in to keep creating</Text>

              <View style={styles.field}>
                <Mail size={18} color={colors.textDim} />
                <TextInput
                  testID="login-email"
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Lock size={18} color={colors.textDim} />
                <TextInput
                  testID="login-password"
                  placeholder="Password"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="go"
                  onSubmitEditing={onLogin}
                  style={styles.input}
                />
              </View>

              <GradientButton
                title="Sign In"
                onPress={onLogin}
                loading={loading}
                testID="login-submit"
                style={{ marginTop: 18 }}
              />

              <PressableScale
                onPress={showRecovery}
                style={{ marginTop: 14, alignSelf: 'center' }}
                testID="forgot-password"
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </PressableScale>

              <PressableScale
                onPress={() => router.push('/(auth)/register')}
                style={{ marginTop: 22 }}
              >
                <Text style={styles.linkText} testID="goto-register">
                  Don&apos;t have an account?{' '}
                  <Text style={styles.linkAccent}>Create one</Text>
                </Text>
              </PressableScale>
            </View>

            <View style={styles.footer}>
              <LinearGradient
                colors={[colors.cyan + '00', colors.cyan + '88', colors.cyan + '00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: 1, width: '60%', marginBottom: 12 }}
              />
              <Text style={styles.footerText}>Forge intelligence. Forge art.</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingBottom: 48, gap: 28 },
  header: { alignItems: 'center', marginTop: 24, gap: 8 },
  tag: { color: colors.cyan, fontWeight: '700', letterSpacing: 2, fontSize: 11, textTransform: 'uppercase' },
  card: {
    backgroundColor: 'rgba(10,10,20,0.7)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 24,
    gap: 14,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sub: { color: colors.textDim, fontSize: 14, marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  input: { flex: 1, color: colors.text, fontSize: 15 },
  linkText: { color: colors.textDim, textAlign: 'center', fontSize: 13 },
  linkAccent: { color: colors.green, fontWeight: '700' },
  forgotText: { color: colors.cyan, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textDecorationLine: 'underline' },
  footer: { alignItems: 'center' },
  footerText: { color: colors.textMuted, fontSize: 12, letterSpacing: 1 },
});
