import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Lock, ShieldCheck, AlertTriangle, KeyRound, Eye, EyeOff, RotateCcw, ExternalLink } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { api } from '@/src/api/client';

type Status = {
  mode: string;
  fingerprint: string;
  updated_at: string;
  is_sandbox: boolean;
  is_live: boolean;
};

export default function AdminSecrets() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.adminMe();
        setIsAdmin(me.is_admin);
        if (me.is_admin) {
          const s = await api.adminGetStripeKey();
          setStatus(s);
        }
      } catch (e: any) {
        setIsAdmin(false);
      }
      setLoading(false);
    })();
  }, []);

  const onSave = async () => {
    setError(null);
    setSuccess(null);
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Please paste your Stripe Secret Key.');
      return;
    }
    if (!(trimmed.startsWith('sk_live_') || trimmed.startsWith('sk_test_'))) {
      setError('Key must start with sk_live_ or sk_test_');
      return;
    }
    setSaving(true);
    try {
      const r = await api.adminSetStripeKey(trimmed);
      setSuccess(`${r.message} (Mode: ${r.mode.toUpperCase()})`);
      setKey('');
      setReveal(false);
      const s = await api.adminGetStripeKey();
      setStatus(s);
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    Alert.alert(
      'Reset to sandbox?',
      'This will revert to the Emergent test sandbox key. Real payments will stop until you set a live key again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await api.adminResetStripeKey();
              const s = await api.adminGetStripeKey();
              setStatus(s);
              setSuccess('Reverted to sandbox test mode.');
              setError(null);
            } catch (e: any) {
              setError(e.message || 'Failed to reset');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <StarryBackground />
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  if (isAdmin === false) {
    return (
      <View style={styles.root}>
        <StarryBackground />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.topBar}>
            <PressableScale onPress={() => router.back()}>
              <View style={styles.backBtn}><ArrowLeft size={18} color={colors.text} /><Text style={styles.backText}>Back</Text></View>
            </PressableScale>
          </View>
          <View style={[styles.center, { flex: 1, padding: 24 }]}>
            <Lock size={48} color={colors.red} />
            <Text style={styles.title}>Admin only</Text>
            <Text style={styles.subtitle}>You don’t have access to manage app secrets.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const modeColor =
    status?.is_live ? colors.green : status?.is_sandbox ? colors.yellow : colors.cyan;
  const modeLabel = status?.is_live
    ? 'LIVE (real payments)'
    : status?.is_sandbox
      ? 'SANDBOX (test only)'
      : status?.mode?.toUpperCase() || 'UNKNOWN';

  return (
    <View style={styles.root}>
      <StarryBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <PressableScale onPress={() => router.back()} testID="back-btn">
              <View style={styles.backBtn}><ArrowLeft size={18} color={colors.text} /><Text style={styles.backText}>Back</Text></View>
            </PressableScale>
            <View style={[styles.tag, { borderColor: colors.red + '88', backgroundColor: colors.red + '22' }]}>
              <Text style={[styles.tagText, { color: colors.red }]}>OWNER·ADMIN</Text>
            </View>
          </View>

          <Text style={styles.title}>App Secrets</Text>
          <Text style={styles.subtitle}>Manage your Stripe API key securely — never paste it in chat.</Text>

          {/* Status card */}
          <View style={[styles.card, { borderColor: modeColor + '66' }]}>
            <View style={styles.row}>
              <ShieldCheck size={20} color={modeColor} />
              <Text style={styles.cardTitle}>Stripe key</Text>
              <View style={[styles.modeBadge, { backgroundColor: modeColor + '22', borderColor: modeColor }]}>
                <Text style={[styles.modeBadgeText, { color: modeColor }]}>{modeLabel}</Text>
              </View>
            </View>
            <Text style={styles.kv}>
              <Text style={styles.kvKey}>Fingerprint: </Text>
              <Text style={styles.kvVal}>{status?.fingerprint || '—'}</Text>
            </Text>
            <Text style={styles.kv}>
              <Text style={styles.kvKey}>Updated: </Text>
              <Text style={styles.kvVal}>
                {status?.updated_at ? new Date(status.updated_at).toLocaleString() : 'never'}
              </Text>
            </Text>
          </View>

          {/* Security notice */}
          <View style={styles.warn}>
            <LinearGradient colors={[colors.red + '20', 'transparent']} style={StyleSheet.absoluteFill} />
            <AlertTriangle size={16} color={colors.red} />
            <Text style={styles.warnText}>
              Your previous key was auto-revoked by Stripe because it was exposed in chat.
              {' '}Always <Text style={{ fontWeight: '900', color: colors.red }}>roll a fresh key</Text>{' '}
              in your Stripe Dashboard, then paste it into the secure box below — not into chat.
            </Text>
          </View>

          {/* Open Stripe dashboard quick link */}
          <PressableScale
            onPress={() => Linking.openURL('https://dashboard.stripe.com/apikeys')}
            testID="open-stripe"
          >
            <View style={styles.linkRow}>
              <ExternalLink size={14} color={colors.cyan} />
              <Text style={styles.linkText}>Open Stripe → API keys (dashboard)</Text>
            </View>
          </PressableScale>

          {/* Input */}
          <View style={styles.inputCard}>
            <View style={styles.row}>
              <KeyRound size={16} color={colors.cyan} />
              <Text style={styles.inputLabel}>New Stripe Secret Key</Text>
            </View>
            <View style={styles.inputBox}>
              <TextInput
                value={key}
                onChangeText={setKey}
                placeholder="sk_live_… or sk_test_…"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                secureTextEntry={!reveal}
                testID="stripe-key-input"
              />
              <PressableScale onPress={() => setReveal((v) => !v)} testID="reveal-toggle">
                <View style={styles.revealBtn}>
                  {reveal ? <EyeOff size={16} color={colors.textDim} /> : <Eye size={16} color={colors.textDim} />}
                </View>
              </PressableScale>
            </View>
            <Text style={styles.helper}>
              We validate the key against Stripe before saving it, then write it to{' '}
              <Text style={{ color: colors.cyan }}>backend/.env</Text> and hot-swap it server-side.
              No restart needed.
            </Text>

            {error ? <Text style={styles.errText}>{error}</Text> : null}
            {success ? <Text style={styles.successText}>{success}</Text> : null}

            <GradientButton
              title="Save & Activate"
              onPress={onSave}
              loading={saving}
              testID="save-stripe-key"
              style={{ marginTop: 12 }}
            />
          </View>

          <View style={{ height: 8 }} />
          <GradientButton
            title="Reset to Sandbox"
            onPress={onReset}
            variant="outline"
            icon={<RotateCcw size={14} color={colors.yellow} />}
            testID="reset-stripe-key"
            small
          />

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 18, paddingBottom: 30, gap: 14 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  tagText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 },
  modeBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  modeBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  kv: { color: colors.textDim, fontSize: 12 },
  kvKey: { color: colors.textMuted, fontWeight: '700' },
  kvVal: { color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  warn: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    padding: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.red + '66',
    overflow: 'hidden',
  },
  warnText: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 17 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  linkText: { color: colors.cyan, fontSize: 13, fontWeight: '700' },
  inputCard: {
    backgroundColor: colors.bgElev,
    borderColor: colors.cyan + '55',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
  },
  inputLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#06060c',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    paddingVertical: 12,
  },
  revealBtn: { padding: 8 },
  helper: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
  errText: { color: colors.red, fontSize: 12, fontWeight: '700' },
  successText: { color: colors.green, fontSize: 12, fontWeight: '700' },
});
