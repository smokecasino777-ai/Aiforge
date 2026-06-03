import React, { useState } from 'react';
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
import { useAuth } from '@/src/context/AuthContext';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import PulsingLogo from '@/src/components/Logo';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { Mail, Lock, User } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    if (!email || !password) {
      Alert.alert('Required', 'Enter email and password');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim() || undefined);
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Sign-up failed', e.message);
    } finally {
      setLoading(false);
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

              <GradientButton
                title="Forge My Account"
                onPress={onRegister}
                loading={loading}
                testID="register-submit"
                style={{ marginTop: 18 }}
              />

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
});
