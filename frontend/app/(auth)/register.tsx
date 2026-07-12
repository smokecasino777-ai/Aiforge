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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import PulsingLogo from '@/src/components/Logo';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { Mail, Lock, User, Gift, Github } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { startGoogleSignIn, startGitHubSignIn } from '@/src/utils/googleAuth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { signUp, signInWithOAuth } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill email when forwarded from login (e.g. "Create account" button).
  useEffect(() => {
    if (typeof params.email === 'string' && params.email && !email) {
      setEmail(params.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.email]);

  const onRegister = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      Alert.alert('Required', 'Enter your email and password.');
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert('Check email format', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp(
        trimmed,
        password,
        name.trim() || undefined,
        referral.trim() || undefined,
      );
      router.replace('/(tabs)');
    } catch (e: any) {
      const raw = (e?.message || '').toLowerCase();
      const taken =
        raw.includes('already registered') ||
        raw.includes('already exists') ||
        raw.includes('400');
      if (taken) {
        Alert.alert(
          'Email already registered',
          'Looks like you already have an account with this email. Want to sign in instead?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign in',
              onPress: () =>
                router.replace({
                  pathname: '/(auth)/login',
                  params: { email: trimmed },
                }),
            },
          ],
        );
      } else {
        Alert.alert('Sign-up failed', e?.message || 'Something went wrong.');
      }
    } finally {
      setLoading(false);
    }
  };

  const [googleLoading, setGoogleLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  const onGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const sid = await startGoogleSignIn();
      if (sid) {
        await signInWithOAuth(sid);
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      Alert.alert(
        'Google sign-in failed',
        e?.message || 'Could not complete Google sign-in. Please try again.',
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const onGitHubSignIn = async () => {
    setGithubLoading(true);
    try {
      const sid = await startGitHubSignIn();
      if (sid) {
        await signInWithOAuth(sid);
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      Alert.alert(
        'GitHub sign-in failed',
        e?.message || 'Could not complete GitHub sign-in. Please try again.',
      );
    } finally {
      setGithubLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <PulsingLogo size={56} textSize={28} />
              <Text style={styles.tag}>Join the Forge</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Create your account</Text>
              <Text style={styles.sub}>5 free generations every single day</Text>

              <View style={styles.field}>
                <User size={18} color={colors.textDim} />
                <TextInput
                  testID="reg-name"
                  placeholder="Display name (optional)"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Mail size={18} color={colors.textDim} />
                <TextInput
                  testID="reg-email"
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Lock size={18} color={colors.textDim} />
                <TextInput
                  testID="reg-password"
                  placeholder="Password (6+ characters)"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Gift size={18} color={colors.green} />
                <TextInput
                  testID="reg-referral"
                  placeholder="Referral code (optional, +20/day for a week)"
                  placeholderTextColor={colors.textMuted}
                  value={referral}
                  onChangeText={(t) => setReferral(t.toUpperCase())}
                  autoCapitalize="characters"
                  style={styles.input}
                />
              </View>

              <GradientButton
                title="Forge My Account"
                onPress={onRegister}
                loading={loading}
                testID="register-submit"
                style={{ marginTop: 18 }}
              />

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.socialRow}>
                <PressableScale
                  onPress={onGoogleSignIn}
                  disabled={googleLoading || githubLoading || loading}
                  testID="register-google"
                  style={{ flex: 1 }}
                >
                  <View style={styles.socialBtn}>
                    <View style={styles.googleBadge}>
                      <Text style={styles.googleBadgeText}>G</Text>
                    </View>
                    <Text style={styles.socialBtnText}>
                      {googleLoading ? 'Wait…' : 'Google'}
                    </Text>
                  </View>
                </PressableScale>

                <PressableScale
                  onPress={onGitHubSignIn}
                  disabled={googleLoading || githubLoading || loading}
                  testID="register-github"
                  style={{ flex: 1 }}
                >
                  <View style={styles.socialBtn}>
                    <Github size={20} color={colors.text} />
                    <Text style={styles.socialBtnText}>
                      {githubLoading ? 'Wait…' : 'GitHub'}
                    </Text>
                  </View>
                </PressableScale>
              </View>

              <PressableScale onPress={() => router.back()} style={{ marginTop: 22 }}>
                <Text style={styles.linkText} testID="goto-login">
                  Already have an account? <Text style={styles.linkAccent}>Sign in</Text>
                </Text>
              </PressableScale>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingBottom: 48, gap: 24 },
  header: { alignItems: 'center', marginTop: 16, gap: 8 },
  tag: { color: colors.green, fontWeight: '700', letterSpacing: 2, fontSize: 11, textTransform: 'uppercase' },
  card: {
    backgroundColor: 'rgba(10,10,20,0.7)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 24,
    gap: 14,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
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
  linkAccent: { color: colors.cyan, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  googleBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBadgeText: { color: '#4285F4', fontSize: 12, fontWeight: '900' },
  socialRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#141420',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    height: 52,
  },
  socialBtnText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
