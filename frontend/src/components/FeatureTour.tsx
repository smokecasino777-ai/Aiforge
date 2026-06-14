import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, X } from 'lucide-react-native';
import { storage } from '@/src/utils/storage';
import { colors, radius } from '@/src/theme/colors';
import PressableScale from './PressableScale';

const { width: W } = Dimensions.get('window');

export type TourStep = {
  title: string;
  body: string;
  emoji: string;
  color: string;
};

type Props = {
  /** Storage key — once dismissed, never shown again unless cleared. */
  storageKey: string;
  steps: TourStep[];
  /** Disable entirely while testing if needed. */
  enabled?: boolean;
};

/**
 * One-shot feature tour overlay. Slides in on first mount (when storageKey is
 * unseen), walks the user through `steps`, and writes the storageKey so it
 * never reappears.
 */
export default function FeatureTour({ storageKey, steps, enabled = true }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      const seen = await storage.getItem<string>(storageKey, '');
      if (!seen) {
        // Tiny delay so the host screen renders behind the modal first.
        setTimeout(() => setVisible(true), 280);
      }
    })();
  }, [enabled, storageKey]);

  const finish = async () => {
    setVisible(false);
    await storage.setItem(storageKey, '1');
  };

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else finish();
  };

  if (!visible) return null;
  const current = steps[step];
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={finish}>
      <Pressable style={styles.scrim} onPress={finish}>
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
          style={[styles.card, { borderColor: current.color + '88' }]}
        >
          <LinearGradient
            colors={[current.color + '24', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <PressableScale onPress={finish}>
            <View style={styles.closeBtn}>
              <X size={14} color={colors.textDim} />
            </View>
          </PressableScale>
          <Text style={styles.emoji}>{current.emoji}</Text>
          <Text style={[styles.title, { color: current.color }]}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>
          {/* Pagination dots */}
          <View style={styles.dots}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step && { backgroundColor: current.color, width: 18 },
                ]}
              />
            ))}
          </View>
          <Pressable onPress={next} style={styles.nextBtn} testID="tour-next">
            <LinearGradient
              colors={[current.color, '#000']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.nextBtnGrad}
            >
              <Text style={styles.nextText}>
                {step === steps.length - 1 ? "GOT IT \u00b7 LET\u2019S CREATE" : 'NEXT'}
              </Text>
              <ArrowRight size={14} color="#000" />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: Math.min(380, W - 48),
    backgroundColor: '#0A0A14',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 24,
    gap: 12,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: '#020208',
    borderColor: '#ffffff14', borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 40 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  body: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  nextBtn: { marginTop: 6, alignSelf: 'flex-start' },
  nextBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
  },
  nextText: { color: '#000', fontWeight: '900', letterSpacing: 0.6, fontSize: 12 },
});
