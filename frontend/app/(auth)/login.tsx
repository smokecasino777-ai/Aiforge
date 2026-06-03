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
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuth } from '@/src/context/AuthContext';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import PulsingLogo from '@/src/components/Logo';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { Mail, Lock, Globe } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const router = useRouter();
  const { signIn, signInWithGoogleSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (!hash) return;
    const m = hash.match(/session_id=([^&]+)/);
    if (m && m[1]) {
      const sid = decodeURIComponent(m[1]);
      window.history.replaceState(null, '', window.location.pathname);
      setGoogleLoading(true);
      signInWithGoogleSession(sid)
        .then(() => router.replace('/(tabs)'))
        .catch((e) => Alert.alert('Google sign-in failed', e.message))
        .finally(() => setGoogleLoading(false));
    }
  }, [signInWithGoogleSession, router]);

  const onLogin = async () => {
    if (!email || !password) {
      Alert.alert('Required', 'Enter email and password');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Sign-in failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setGoogleLoading(true);
    try {
      const redirect =
        Platform.OS === 'web'
          ? (typeof window !== 'undefined' ? window.location.origin + '/login' : '')
          : Linking.createURL('auth');
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.location.href = authUrl;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      if (result.type !== 'success' || !result.url) {
        setGoogleLoading(false);
        return;
      }
      const m = result.url.match(/[#?]session_id=([^&]+)/);
      if (!m) throw new Error('No session in callback URL');
      await signInWithGoogleSession(decodeURIComponent(m[1]));
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Google sign-in failed', e.message);
    } finally {
      setGoogleLoading(false);
    }
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
                  keyboardType="email-address"
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

              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.line} />
              </View>

              <GradientButton
                title="Continue with Google"
                onPress={onGoogle}
                loading={googleLoading}
                variant="outline"
                icon={<Globe size={18} color={colors.text} />}
                testID="google-signin"
              />

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
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.textMuted, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  linkText: { color: colors.textDim, textAlign: 'center', fontSize: 13 },
  linkAccent: { color: colors.green, fontWeight: '700' },
  footer: { alignItems: 'center' },
  footerText: { color: colors.textMuted, fontSize: 12, letterSpacing: 1 },
});
