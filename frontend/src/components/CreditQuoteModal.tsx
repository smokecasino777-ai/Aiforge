import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '@/src/theme/colors';
import { Quote, QuotePrompt, setQuotePresenter } from '@/src/lib/creditQuote';

export default function CreditQuoteModal() {
  const [request, setRequest] = useState<QuotePrompt | null>(null);
  const active = useRef<QuotePrompt | null>(null);
  const [quality, setQuality] = useState('economy');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setQuotePresenter((next) => {
      if (active.current) { next.reject(new Error('Review the current quote first.')); return; }
      active.current = next; setQuality('economy'); setQuote(null); setError(''); setRequest(next);
    });
    return () => { setQuotePresenter(null); active.current?.reject(new Error('Request cancelled before processing.')); };
  }, []);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLoading(true); setQuote(null); setError('');
    fetch(`${request.apiBase}/credits/quote`, { method: 'POST', signal: controller.signal,
      headers: { ...request.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: request.path, payload: request.payload, quality }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'This request cannot be quoted.');
      if (!controller.signal.aborted) setQuote(result);
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request, quality]);
  const close = (accept = false) => {
    if (accept && quote && new Date(quote.expires_at).getTime() <= Date.now()) { setError('Quote expired. Cancel and request a new quote.'); return; }
    if (accept && quote) request?.resolve(quote.quote_id);
    else request?.reject(new Error('Request cancelled before processing. No credits were spent.'));
    active.current = null; setRequest(null);
  };
  return <Modal testID="credit-quote-dialog" visible={!!request} transparent animationType="slide" onRequestClose={() => close()}>
    <View testID="credit-quote-modal" style={styles.scrim}><SafeAreaView style={styles.card} edges={['bottom']}>
      <Text testID="credit-quote-title" style={styles.title}>Before you create</Text>
      <Text style={styles.body}>One fixed quote. No surprise upgrades or automatic retries.</Text>
      <View style={styles.row}>{['economy', 'higher'].map((value) => <Pressable testID={`quote-quality-${value}`} key={value} onPress={() => setQuality(value)} style={[styles.choice, quality === value && styles.selected]}>
        <Text style={styles.text}>{value === 'economy' ? 'Economy' : 'Higher quality'}</Text>
      </Pressable>)}</View>
      {loading && <ActivityIndicator testID="quote-loading" color={colors.cyan} />}
      {!!error && <Text testID="quote-error" style={styles.error}>{error}</Text>}
      {quote && <View testID="quote-details" style={styles.details}>
        <Text testID="quote-credit-cost" style={styles.price}>{quote.legacy ? 'Existing allowance' : `${quote.credits.toLocaleString()} credits`}</Text>
        <Text testID="quote-output" style={styles.text}>{quote.model.label}</Text>
        <Text testID="quote-model" style={styles.body}>{quote.model.model}</Text>
        {quote.model.max_output_tokens > 0 && <Text testID="quote-output-limit" style={styles.body}>Output limit: {quote.model.max_output_tokens.toLocaleString()} tokens · bounded context</Text>}
        <Text testID="quote-expiry" style={styles.body}>Quote expires in 5 minutes. Failed requests release your credit reservation.</Text>
      </View>}
      <Pressable testID="quote-confirm" disabled={!quote || loading || !!error} onPress={() => close(true)} style={[styles.button, (!quote || loading || !!error) && styles.disabled]}>
        <Text style={styles.buttonText}>{quote ? 'Accept quote & create' : 'Creation unavailable'}</Text>
      </Pressable>
      <Pressable testID="quote-cancel" style={styles.cancel} onPress={() => close()}><Text style={styles.text}>Cancel — no charge</Text></Pressable>
    </SafeAreaView></View>
  </Modal>;
}
const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.bg + 'DD', justifyContent: 'flex-end' },
  card: { padding: 24, gap: 18, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text }, body: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', gap: 12 }, choice: { padding: 14, minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.textMuted },
  selected: { borderColor: colors.cyan, backgroundColor: colors.cyan + '18' }, text: { color: colors.text, fontSize: 15 },
  details: { gap: 10 }, price: { color: colors.cyan, fontSize: 32, fontWeight: '800' }, error: { color: colors.yellow, fontSize: 15, lineHeight: 23 },
  button: { backgroundColor: colors.cyan, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  buttonText: { color: colors.bg, fontWeight: '800', fontSize: 16 }, disabled: { opacity: 0.4 }, cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});