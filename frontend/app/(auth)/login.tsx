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
import { Mail, Lock, GitBranch } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { startGoogleSignIn } from '@/src/utils/googleAuth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_EMAIL = 'jraycwalker@gmail.com';

export default function Login() {

  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  const {
    signIn,
    signInWithGoogle,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // GitHub is disabled → no need for useState
  const githubLoading = false;

  useEffect(() => {
    if (
      typeof params.email === 'string' &&
      params.email &&
      !email
    ) {
      setEmail(params.email);
    }
  }, [params.email]);

  const doSignIn = async (e: string, p: string) => {
    setLoading(true);

    try {
      await signIn(e, p);
      router.replace('/(tabs)');
    } catch (err:any) {
      const raw = (err?.message || '').toLowerCase();

      const friendly =
        raw.includes('invalid') ||
        raw.includes('401')
        ? 'Email and password don’t match.'
        : err?.message || 'Something went wrong. Try again.';

      Alert.alert('Sign-in failed', friendly);
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
      `Email us at ${SUPPORT_EMAIL} from your registered email address.`,
      [
        {
          text:'Email support',
          onPress:()=> 
            Linking.openURL(
              `mailto:${SUPPORT_EMAIL}?subject=AiForge password reset`
            ).catch(()=>{})
        },
        { text:'OK' }
      ]
    );
  };

  const onGoogleSignIn = async () => {
    setGoogleLoading(true);

    try {
      const firebaseToken = await startGoogleSignIn();

      if (firebaseToken) {
        await signInWithGoogle(firebaseToken);
        router.replace('/(tabs)');
      }

    } catch(e:any) {
      Alert.alert(
        'Google sign-in failed',
        e?.message || 'Could not complete Google sign-in. Please try again.'
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const onGitHubSignIn = () => {
    Alert.alert(
      'Coming Soon',
      'GitHub sign-in has not been connected yet.'
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

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >

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
                  onSubmitEditing={onLogin}
                  style={styles.input}
                />
              </View>

              <GradientButton
                title="Sign In"
                onPress={onLogin}
                loading={loading}
                testID="login-submit"
                style={{ marginTop:18 }}
              />

              <View style={styles.divider}>
                <View style={styles.dividerLine}/>
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine}/>
              </View>

              <View style={styles.socialRow}>

                <PressableScale
                  onPress={onGoogleSignIn}
                  disabled={googleLoading || githubLoading || loading}
                  style={{flex:1}}
                  testID="google-signin"
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
                  style={{flex:1}}
                  testID="github-signin"
                >
                  <View style={styles.socialBtn}>
                    <GitBranch size={20} color={colors.text} />
                    <Text style={styles.socialBtnText}>GitHub</Text>
                  </View>
                </PressableScale>

              </View>

              <PressableScale
                onPress={showRecovery}
                style={{ marginTop:14, alignSelf:'center' }}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </PressableScale>

              <PressableScale
                onPress={() => router.push('/(auth)/register')}
                style={{marginTop:22}}
              >
                <Text style={styles.linkText}>
                  Don't have an account?
                  <Text style={styles.linkAccent}> Create one</Text>
                </Text>
              </PressableScale>

            </View>

            <View style={styles.footer}>
              <LinearGradient
                colors={[
                  colors.cyan + '00',
                  colors.cyan + '88',
                  colors.cyan + '00'
                ]}
                style={{
                  height:1,
                  width:'60%',
                  marginBottom:12
                }}
              />
              <Text style={styles.footerText}>
                Forge intelligence. Forge art.
              </Text>
            </View>

          </ScrollView>

        </KeyboardAvoidingView>

      </SafeAreaView>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingBottom: 80 },
  header: { alignItems: 'center', marginBottom: 28 },
  tag: { color: colors.textDim, marginTop: 6 },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: radius.lg,
    marginBottom: 40,
  },
  title: { fontSize: 24, fontWeight: '600', color: colors.text },
  sub: { fontSize: 14, color: colors.textDim, marginBottom: 20 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    color: colors.text,
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.textMuted,
  },
  dividerText: {
    marginHorizontal: 10,
    color: colors.textDim,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.input,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  googleBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  googleBadgeText: {
    fontWeight: '700',
    color: '#4285F4',
  },
  socialBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  forgotText: {
    color: colors.textDim,
    fontSize: 14,
  },
  linkText: {
    color: colors.textDim,
    fontSize: 14,
  },
  linkAccent: {
    color: colors.cyan,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
  },
  footerText: {
    color: colors.textDim,
    fontSize: 13,
  },
});
