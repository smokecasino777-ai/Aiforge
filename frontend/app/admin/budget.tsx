import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { api, setAdminUnlockToken } from '@/src/api/client';

export default function Budget() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [funds, setFunds] = useState('');
  const [evidence, setEvidence] = useState('');
  const [attested, setAttested] = useState(false);
  const [sales, setSales] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('caption');
  const [rate, setRate] = useState('');
  const [rateEvidence, setRateEvidence] = useState('');
  const [rateAttested, setRateAttested] = useState(false);
  const [password, setPassword] = useState('');
  const [unlockedUntil, setUnlockedUntil] = useState(0);
  const unlocked = unlockedUntil > Date.now();
  const unlock = async () => {
    setBusy(true); setError('');
    try { const result = await api.adminUnlock(password); setAdminUnlockToken(result.sudo_token); setUnlockedUntil(Date.now() + 14 * 60 * 1000); setError('Financial settings unlocked temporarily.'); }
    catch (e: any) { setError(e.message); } finally { setPassword(''); setBusy(false); }
  };
  const load = async () => {
    try { const next = await api.creditBudget(); setData(next); setFunds(String(next.funded_micros / 1000000)); setSales(!!next.sales_enabled); }
    catch (e: any) { setError(e.message); }
  };
  useEffect(() => { void load(); return () => setAdminUnlockToken(null); }, []);
  const saveFunds = async () => {
    setBusy(true); setError('');
    try { await api.updateCreditBudget({ funded_usd: funds, evidence, existing_prepaid_only: attested, sales_enabled: sales }); await load(); setError('Reserve record saved. No provider funds were purchased or topped up.'); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const saveRate = async () => {
    setBusy(true); setError('');
    try { await api.updateCreditRate({ action, quality: 'economy', max_cost_usd: rate, evidence: rateEvidence, includes_all_inputs_outputs_and_surcharges: rateAttested }); await load(); setError('Economy rate recorded for 7 days. New quotes include a 25% safety allowance.'); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <SafeAreaView style={s.root}><KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Pressable testID="budget-back" onPress={() => router.back()} style={s.button}><Text style={s.link}>Back</Text></Pressable>
    <Text style={s.title} testID="budget-title">AI spending & reserves</Text>
    <Text style={s.body}>Owner only. Existing customer obligations have priority. No automatic provider purchases or top-ups.</Text>
    {!!error && <Text style={s.warning} testID="budget-message">{error}</Text>}
    {data && <>
      {[['Verified funds', 'funded_micros'], ['Credit obligations', 'held_micros'], ['Conservative usage cost', 'spent_micros'], ['In-flight reservations', 'running_micros']].map(([label, key]) => <View key={key} style={s.stat}><Text style={s.body}>{label}</Text><Text testID={`budget-${key}`} style={s.value}>${(data[key] / 1000000).toFixed(2)}</Text></View>)}
      <Text testID="budget-headroom-warning" style={s.warning}>{data.funded_micros - data.held_micros - data.spent_micros - data.running_micros <= 0 ? 'Low reserve: new AI requests and sales cannot be funded.' : 'Headroom is reserved conservatively, including failure costs.'}</Text>
      <Text testID="budget-promo-cap" style={s.body}>Promotional and owner-funded usage ceiling: $25 per UTC month. Provider-funded balance is not inferred from store sales or pending payouts.</Text>
      <Text style={s.subtitle}>Record existing purchased funds</Text>
      {!unlocked && <View style={{ gap: 12 }}><Text testID="budget-unlock-explanation" style={s.body}>Re-enter your owner password to change financial settings. Read-only totals remain visible.</Text>
        <TextInput testID="budget-owner-password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" style={s.input} placeholder="Owner password" placeholderTextColor={colors.textMuted} />
        <Pressable testID="budget-unlock" disabled={busy || !password} onPress={unlock} style={s.primary}><Text style={s.primaryText}>Unlock financial changes</Text></Pressable></View>}
      <Text style={s.body}>Enter the total funded envelope, including amounts already spent in this ledger. Check the actual connected-provider balance first. This form records evidence; it does not independently verify or add provider money.</Text>
      <TextInput testID="budget-funded-usd" style={s.input} value={funds} onChangeText={setFunds} keyboardType="decimal-pad" placeholder="Verified total USD" placeholderTextColor={colors.textMuted} />
      <TextInput testID="budget-evidence" style={s.input} value={evidence} onChangeText={setEvidence} multiline placeholder="Verification date and balance source — no passwords or keys" placeholderTextColor={colors.textMuted} />
      <View style={s.stat}><Text style={[s.body, s.flex]}>I verified these are already-purchased provider funds</Text><Switch testID="budget-prepaid-attestation" value={attested} onValueChange={setAttested} /></View>
      <View style={s.stat}><Text style={[s.body, s.flex]}>Allow new sales only when matching store products and reserves are ready</Text><Switch testID="budget-sales-toggle" value={sales} onValueChange={setSales} /></View>
      <Pressable testID="budget-save" onPress={saveFunds} disabled={busy || !unlocked || !attested || evidence.length < 10} style={[s.primary, (!attested || busy || !unlocked) && s.disabled]}><Text style={s.primaryText}>Save reserve record — no purchase</Text></Pressable>
      <Text style={s.subtitle}>Connected-provider cost evidence</Text>
      <Text style={s.body}>Maximum total charge per bounded request, including input, output, context and connected-service surcharges. Text: up to 12,000 prompt/context characters + 4,000 system characters and the displayed output cap. Image edit: 1024px input, one image output. Voice: 4,000 characters or 60 seconds. Do not use a headline output-only price.</Text>
      <View style={s.wrap}>{['caption', 'chat', 'scad', 'image', 'image_edit', 'avatar', 'model3d', 'tts', 'stt'].map((v) => <Pressable key={v} testID={`budget-rate-${v}`} onPress={() => setAction(v)} style={[s.chip, action === v && s.active]}><Text style={s.link}>{v.replace('_', ' ')}</Text></Pressable>)}</View>
      <TextInput testID="budget-max-cost" style={s.input} value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="Verified upper bound in USD" placeholderTextColor={colors.textMuted} />
      <TextInput testID="budget-rate-evidence" style={s.input} value={rateEvidence} onChangeText={setRateEvidence} multiline placeholder="Connected rate source and calculation — no secrets" placeholderTextColor={colors.textMuted} />
      <View style={s.stat}><Text style={[s.body, s.flex]}>This maximum covers all billable inputs, outputs and provider surcharges</Text><Switch testID="budget-rate-attestation" value={rateAttested} onValueChange={setRateAttested} /></View>
      <Pressable testID="budget-save-rate" disabled={busy || !unlocked || !rateAttested || rateEvidence.length < 10} onPress={saveRate} style={[s.primary, (!rateAttested || busy || !unlocked) && s.disabled]}><Text style={s.primaryText}>Record verified Economy rate</Text></Pressable>
      <Text style={s.body}>Provider reporting can lag; app estimates cannot guarantee an exact external bill. Keep provider-side hard spending limits enabled where available. Full multi-tier and consumable products require separately verified store/billing configuration.</Text>
    </>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg }, content: { padding: 24, gap: 22, paddingBottom: 80 }, title: { color: colors.text, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.text, fontSize: 21, fontWeight: '700', marginTop: 15 }, body: { color: colors.textDim, fontSize: 14, lineHeight: 22 }, warning: { color: colors.yellow, fontSize: 14, lineHeight: 22 }, link: { color: colors.cyan, fontSize: 15 }, button: { minHeight: 48, justifyContent: 'center' }, stat: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }, value: { color: colors.text, fontSize: 22, fontWeight: '700' }, flex: { flex: 1 }, input: { minHeight: 52, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, fontSize: 15 }, primary: { padding: 16, borderRadius: 16, minHeight: 52, backgroundColor: colors.cyan, alignItems: 'center' }, primaryText: { color: colors.bg, fontWeight: '800', textAlign: 'center' }, disabled: { opacity: 0.4 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 30 }, active: { borderColor: colors.cyan } });