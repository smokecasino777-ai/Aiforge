/**
 * Voice helpers for the chat screen — TTS (read aloud) + STT (voice input).
 *
 * Playbook rules enforced here:
 *   - Set `playsInSilentMode: true` + flip `allowsRecording` between the two
 *     modes. Leaving `allowsRecording: true` while playing routes TTS to the
 *     earpiece on iOS (inaudible).
 *   - ONE module-level audio player, stopped on blur / unmount / background.
 *   - Mic permission is requested in the tap handler, never on mount.
 *   - Mic metering must be enabled or auto-stop never fires.
 *   - Half-duplex: close the mic while assistant TTS is playing.
 *   - Hard upper bound on recording length (watchdog) to prevent runaway
 *     recordings that would blow past the backend's 5 MB STT cap.
 */
import { Platform } from 'react-native';
import {
  AudioModule,
  createAudioPlayer,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useCallback, useRef, useState } from 'react';

import { api } from '@/src/api/client';
import { uploadForm } from '@/src/utils/upload';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

// ---- Audio session helpers -----------------------------------------------

export async function enterPlaybackSession(): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  } catch {
    // non-fatal — some platforms (web) ignore
  }
}

export async function enterRecordingSession(): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
  } catch {
    // non-fatal
  }
}

// ---- Module-level player (ONE instance for the app lifecycle) ------------

let player: ReturnType<typeof createAudioPlayer> | null = null;

function ensurePlayer() {
  if (!player) {
    player = createAudioPlayer();
  }
  return player;
}

/**
 * Stop + release any current TTS playback. Call this on screen blur, unmount
 * and app background so stale narration doesn't bleed into the next screen.
 */
export function stopTts(): void {
  try {
    player?.pause();
  } catch {
    // ignore
  }
}

/**
 * Fetch TTS audio for `text`, write to the local cache, play it.
 * Returns a promise that resolves when playback FINISHES (not when it starts).
 *
 * Throws on fetch / quota / permission errors so callers can show a retry.
 */
export async function speak(
  text: string,
  opts: { voice?: string; signal?: AbortSignal } = {},
): Promise<void> {
  if (!text?.trim()) return;
  const trimmed = text.length > 4000 ? text.slice(0, 4000) : text;

  // 1) Fetch bytes from backend.
  const buf = await api.ttsFetchAudio(trimmed, opts.voice);
  if (opts.signal?.aborted) return;

  // 2) Write to a cache file (playbook: never play from data: URIs on RN).
  const name = `tts-${Date.now()}.mp3`;
  const file = new File(Paths.cache, name);
  const bytes = new Uint8Array(buf);
  await file.write(bytes);

  // 3) Switch to playback audio session and play.
  await enterPlaybackSession();
  const p = ensurePlayer();
  // Reset any previous source.
  try {
    p.replace({ uri: file.uri });
  } catch {
    // Older expo-audio API fallback
    (p as any).source = { uri: file.uri };
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    try {
      // expo-audio API: player emits 'playbackStatusUpdate' with didJustFinish
      const sub = p.addListener('playbackStatusUpdate', (status: any) => {
        if (opts.signal?.aborted && !settled) {
          settled = true;
          try { sub.remove(); } catch { /* noop */ }
          resolve();
          return;
        }
        if (status?.didJustFinish && !settled) {
          settled = true;
          try { sub.remove(); } catch { /* noop */ }
          resolve();
        }
      });
    } catch {
      // No listener API available — fall back to a hard watchdog.
    }
    try {
      p.play();
    } catch (e) {
      reject(e as any);
    }
    // Safety watchdog — resolve after 60s so a stuck player never deadlocks.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, 60_000);
  });
}

// ---- Hold-to-talk recorder hook ------------------------------------------

const MAX_RECORD_MS = 55_000; // under 60s and under 5 MB m4a HQ.
const MIN_RECORD_MS = 350;

export type RecorderState = 'idle' | 'listening' | 'uploading';

export function useHoldToTalk() {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const _state = useAudioRecorderState(recorder, 100);
  const [state, setState] = useState<RecorderState>('idle');
  const startedAt = useRef<number | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPreparing = useRef(false);
  // Breaks the start↔stop circular dep for useCallback: start triggers the
  // watchdog which force-stops; we read `stop` through this ref so start
  // doesn't need `stop` in its dep array.
  const stopRef = useRef<(opts?: { force?: boolean }) => Promise<string | null>>(async () => null);

  const clearWatchdog = () => {
    if (watchdog.current) {
      clearTimeout(watchdog.current);
      watchdog.current = null;
    }
  };

  const start = useCallback(async (): Promise<boolean> => {
    if (isPreparing.current || state !== 'idle') return false;
    isPreparing.current = true;
    try {
      // Permission check — in the tap handler, per playbook.
      const perms = await AudioModule.requestRecordingPermissionsAsync();
      if (!perms.granted) {
        return false;
      }
      await enterRecordingSession();
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setState('listening');
      watchdog.current = setTimeout(() => {
        // Force-stop at MAX_RECORD_MS so we don't blow past 5 MB.
        void stopRef.current({ force: true });
      }, MAX_RECORD_MS);
      return true;
    } catch (e) {
      console.warn('[voice] recorder.start failed:', e);
      setState('idle');
      return false;
    } finally {
      isPreparing.current = false;
    }
  }, [recorder, state]);

  const stop = useCallback(
    async ({ force = false }: { force?: boolean } = {}): Promise<string | null> => {
      clearWatchdog();
      if (state === 'idle') return null;
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      try {
        try {
          if (recorder.isRecording) await recorder.stop();
        } catch {
          // Guard: useAudioRecorder may have released on unmount.
        }
      } finally {
        startedAt.current = null;
      }
      if (!force && elapsed < MIN_RECORD_MS) {
        // Stray tap — don't upload.
        setState('idle');
        return null;
      }
      const uri = recorder.uri;
      if (!uri) {
        setState('idle');
        return null;
      }
      setState('uploading');
      try {
        const token = await (await import('@/src/api/client')).api.getToken();
        const res = await uploadForm<{ text: string; seconds_est: number }>(
          `${BACKEND_URL}/api/voice/stt`,
          {
            files: { audio: { uri, name: 'recording.m4a', mimeType: 'audio/m4a' } },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        return (res.text || '').trim() || null;
      } finally {
        setState('idle');
      }
    },
    [recorder, state],
  );

  // Keep stopRef in sync so the start-callback's watchdog can force-stop
  // without pulling `stop` into its deps.
  stopRef.current = stop;

  return {
    state,
    isListening: state === 'listening',
    isUploading: state === 'uploading',
    metering: _state.metering,
    start,
    stop,
  };
}
