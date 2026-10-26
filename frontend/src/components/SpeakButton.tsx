import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Volume2, Square } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { speak, stopTts } from '@/src/lib/voice';
import { useRouter } from 'expo-router';

/**
 * Small 🔊 button shown next to assistant messages.
 *
 * - Free users: shows a lock badge; tap opens the Plans screen.
 * - Pro users (or legacy tiers): fetches TTS, plays audio. Tapping again
 *   stops playback.
 *
 * Non-fatal: a 429 (quota exceeded) also redirects to Plans with a toast.
 */
export default function SpeakButton({
  text,
  isPro,
  voice,
}: {
  text: string;
  isPro: boolean;
  voice?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  const onPress = useCallback(async () => {
    if (!isPro) {
      router.push('/(tabs)/plans');
      return;
    }
    if (speaking) {
      stopTts();
      abortRef.current?.abort();
      setSpeaking(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setSpeaking(true);
      await speak(text, { voice, signal: ac.signal });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('Pro') || msg.includes('upgrade')) {
        router.push('/(tabs)/plans');
      }
    } finally {
      setLoading(false);
      setSpeaking(false);
    }
  }, [text, speaking, isPro, voice, router]);

  const Icon = speaking ? Square : Volume2;

  return (
    <PressableScale onPress={onPress}>
      <View style={[styles.btn, speaking && styles.btnActive, !isPro && styles.btnLocked]}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.yellow} />
        ) : (
          <Icon size={13} color={isPro ? colors.yellow : colors.textDim} />
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  btnActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.22)',
    borderColor: colors.yellow,
  },
  btnLocked: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
});
