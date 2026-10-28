import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { api } from '@/src/api/client';

export default function CreditHistory() {
  const router = useRouter();
  const [requests, setRequests] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const load = () => api.creditsHistory().then((d) => { setRequests(d.requests); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  return <SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.content}>
    <Pressable testID="history-back" onPress={() => router.back()} style={s.button}><Text style={s.link}>Back</Text></Pressable>
    <Text style={s.title} testID="credit-history-title">Credit activity</Text>
    <Text style={s.body}>Completed requests spend credits. Released requests return their reservation. Quoted requests have not started.</Text>
    {!requests && !error && <ActivityIndicator color={colors.cyan} testID="history-loading" />}
    {!!error && <Text style={s.body} testID="history-error">{error}</Text>}
    {requests?.length === 0 && <Text style={s.body} testID="history-empty">No AI requests yet. Your first quote will appear here.</Text>}
    {requests?.map((r) => <View key={r.quote_id} testID={`history-${r.quote_id}`} style={s.card}>
      <Text style={s.label}>{r.model.label}</Text><Text style={s.body}>{r.credits} credits · {r.status}</Text>
      <Text style={s.body}>{new Date(r.created_at).toLocaleString()}</Text>
    </View>)}
    <Pressable testID="history-refresh" style={s.button} onPress={load}><Text style={s.link}>Refresh activity</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg }, content: { padding: 24, gap: 24 },
  title: { fontSize: 30, fontWeight: '800', color: colors.text }, body: { fontSize: 14, lineHeight: 22, color: colors.textDim },
  button: { minHeight: 48, justifyContent: 'center' }, link: { color: colors.cyan, fontSize: 16 },
  card: { padding: 18, gap: 10, borderWidth: 1, borderColor: colors.text + '22', borderRadius: 18 }, label: { color: colors.text, fontSize: 17, fontWeight: '700' },
});