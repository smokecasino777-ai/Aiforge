import React, { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Mic } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { useHoldToTalk } from '@/src/lib/voice';

/**
 * Hold-to-talk mic button for the chat composer.
 *
 * - Free users: tap opens the Plans screen (lock icon shown).
 * - Pro: hold → record, release → upload to STT → onTranscript(text) called
 *   with the transcription. Caller inserts the text into the composer and
 *   fires the normal send flow.
 *
 * While `isListening` or `isUploading`, the button pulses to indicate state.
 */
export default function MicButton({
  onTranscript,
  onError,
}: {
  isPro: boolean;
  onTranscript: (text: string) => void;
  onError?: (msg: string) => void;
}) {
  const router = useRouter();
  const { isListening, isUploading, start, stop } = useHoldToTalk();

  const guardedStart = useCallback(async () => {
    const ok = await start();
    if (!ok) {
      onError?.('Microphone unavailable. Grant mic permission in Settings and try again.');
    }
  }, [start, onError]);

  const guardedStop = useCallback(async () => {
    try {
      const text = await stop();
      if (text) onTranscript(text);
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (msg.includes('Pro') || msg.includes('upgrade')) {
        router.push('/(tabs)/plans');
      } else {
        onError?.(msg || 'Could not transcribe the recording. Try again.');
      }
    }
  }, [stop, onTranscript, onError, router]);

  return (
    <PressableScale
      testID="chat-record-voice"
      disabled={isUploading}
      onPressIn={guardedStart}
      onPressOut={guardedStop}
    >
      <View
        style={[
          styles.btn,
          isListening && styles.btnListening,
          isUploading && styles.btnUploading,
        ]}
      >
        {isUploading ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Mic
            size={18}
            color={isListening ? '#000' : colors.text}
            strokeWidth={2.5}
          />
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 48,
    height: 48,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    gap: 2,
  },
  btnListening: {
    backgroundColor: colors.cyan,
    borderColor: colors.cyan,
  },
  btnUploading: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  locked: {
    borderStyle: 'dashed',
    opacity: 0.75,
  },
  lockedMic: {
    marginLeft: -4,
    opacity: 0.6,
  },
});

export const micBtnRadius = radius; // keep import alive