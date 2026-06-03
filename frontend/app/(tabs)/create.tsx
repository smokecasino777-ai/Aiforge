import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ImageIcon,
  Video,
  Box,
  MessageSquare,
  Sparkles,
  Wand2,
  Hammer,
} from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';
import { api } from '@/src/api/client';
import { useAuth } from '@/src/context/AuthContext';

type GenType = 'image' | 'video' | 'model3d' | 'scad' | 'chat';

const TYPES: { id: GenType; label: string; sub: string; color: string; Icon: any }[] = [
  { id: 'image', label: 'Image', sub: 'Text → image', color: colors.green, Icon: ImageIcon },
  { id: 'video', label: 'Video', sub: 'Text → motion', color: colors.cyan, Icon: Video },
  { id: 'model3d', label: '3D Render', sub: 'Isometric render', color: colors.purple, Icon: Box },
  { id: 'scad', label: 'Mesh / SCAD', sub: 'STL-ready code', color: colors.red, Icon: Hammer },
  { id: 'chat', label: 'AI Assist', sub: 'Prompt coach', color: colors.yellow, Icon: MessageSquare },
];

const DURATIONS = [4, 8, 12];

const PROMPT_IDEAS: Record<GenType, string[]> = {
  image: [
    'Cyberpunk samurai in neon Tokyo rain, cinematic lighting',
    'Holographic dragon emerging from a quantum portal',
    'Futuristic city built on floating crystal islands at sunset',
  ],
  video: [
    'Time-lapse of a galaxy forming, cinematic camera move',
    'Drone shot over alien forest with bioluminescent trees',
    'Liquid chrome morphing into a roaring lion',
  ],
  model3d: [
    'Isometric robot warrior with glowing rune armor',
    'Cyberpunk hover-bike on chrome pedestal',
    'Crystal castle floating on a clockwork base',
  ],
  scad: [
    'Parametric vase with twisted petals, 12cm tall',
    'Customizable phone stand with cable channel',
    'Mechanical gear assembly with 3 interlocked gears',
  ],
  chat: [
    'Give me 5 epic image prompts for a cyberpunk theme',
    'How do I describe motion for a video prompt?',
    'Help me write a 3D model description for jewelry',
  ],
};

export default function CreateScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [type, setType] = useState<GenType>('image');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<number>(4);
  const [loading, setLoading] = useState(false);
  const [chatReply, setChatReply] = useState<string | null>(null);

  const remaining = Math.max(0, (user?.daily_limit ?? 0) - (user?.daily_used ?? 0));
  const overLimit = remaining === 0;

  const onGenerate = async () => {
    if (!prompt.trim()) {
      Alert.alert('Prompt required', 'Describe what you want to create.');
      return;
    }
    if (overLimit) {
      Alert.alert('Daily limit hit', 'Upgrade your plan for more.', [
        { text: 'Later', style: 'cancel' },
        { text: 'See plans', onPress: () => router.push('/(tabs)/plans') },
      ]);
      return;
    }
    setLoading(true);
    setChatReply(null);
    try {
      if (type === 'chat') {
        const r = await api.chat(prompt);
        setChatReply(r.reply);
        await refresh();
        return;
      }
      let creation;
      if (type === 'scad') {
        creation = await api.generateScad(prompt);
      } else {
        creation = await api.generate({
          type,
          prompt,
          duration: type === 'video' ? duration : undefined,
        });
      }
      await refresh();
      router.push(`/creation/${creation.id}` as any);
    } catch (e: any) {
      Alert.alert('Generation failed', e.message);
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
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Wand2 size={20} color={colors.cyan} />
                <Text style={styles.title}>Create</Text>
              </View>
              <View
                style={[
                  styles.creditChip,
                  { borderColor: overLimit ? colors.red + '88' : colors.green + '66', backgroundColor: overLimit ? colors.red + '15' : colors.green + '15' },
                ]}
                testID="credit-chip"
              >
                <Sparkles size={11} color={overLimit ? colors.red : colors.green} />
                <Text style={[styles.creditText, { color: overLimit ? colors.red : colors.green }]}>
                  {remaining} left
                </Text>
              </View>
            </View>

            <Text style={styles.section}>What do you want to forge?</Text>
            <View style={styles.typeGrid}>
              {TYPES.map((t) => (
                <PressableScale
                  key={t.id}
                  onPress={() => setType(t.id)}
                  style={{ flexBasis: '48%' }}
                  testID={`type-${t.id}`}
                >
                  <View
                    style={[
                      styles.typeCard,
                      type === t.id && {
                        borderColor: t.color,
                        shadowColor: t.color,
                        shadowOpacity: 0.55,
                        shadowRadius: 18,
                      },
                    ]}
                  >
                    <View style={[styles.typeIcon, { backgroundColor: t.color + '20' }]}>
                      <t.Icon size={20} color={t.color} />
                    </View>
                    <Text style={styles.typeLabel}>{t.label}</Text>
                    <Text style={styles.typeSub}>{t.sub}</Text>
                  </View>
                </PressableScale>
              ))}
            </View>

            <Text style={styles.section}>Describe it</Text>
            <View style={styles.promptBox}>
              <TextInput
                testID="prompt-input"
                value={prompt}
                onChangeText={setPrompt}
                placeholder={`Eg. ${PROMPT_IDEAS[type][0]}`}
                placeholderTextColor={colors.textMuted}
                style={styles.promptInput}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.ideas}>
              {PROMPT_IDEAS[type].map((p) => (
                <PressableScale
                  key={p}
                  onPress={() => setPrompt(p)}
                  style={styles.ideaChip}
                  testID={`idea-${p.slice(0, 12)}`}
                >
                  <Text style={styles.ideaText} numberOfLines={1}>
                    ✦ {p}
                  </Text>
                </PressableScale>
              ))}
            </View>

            {type === 'video' ? (
              <>
                <Text style={styles.section}>Duration</Text>
                <View style={styles.durRow}>
                  {DURATIONS.map((d) => (
                    <PressableScale
                      key={d}
                      onPress={() => setDuration(d)}
                      style={{ flex: 1 }}
                      testID={`dur-${d}`}
                    >
                      <View
                        style={[
                          styles.durChip,
                          duration === d && { borderColor: colors.cyan, backgroundColor: colors.cyan + '20' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.durText,
                            duration === d && { color: colors.cyan, fontWeight: '900' },
                          ]}
                        >
                          {d}s
                        </Text>
                      </View>
                    </PressableScale>
                  ))}
                </View>
                <Text style={styles.helper}>
                  Sora 2 supports 4 / 8 / 12 seconds. Use the in-library editor to trim & loop up to 1 minute.
                </Text>
              </>
            ) : null}

            <GradientButton
              title={loading ? 'Forging…' : 'Forge It'}
              onPress={onGenerate}
              loading={loading}
              icon={<Sparkles size={16} color="#000" />}
              testID="generate-btn"
              style={{ marginTop: 18 }}
            />

            {type === 'chat' && chatReply ? (
              <View style={styles.chatCard}>
                <LinearGradient
                  colors={[colors.yellow + '22', 'transparent']}
                  style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
                />
                <View style={styles.chatHeader}>
                  <Sparkles size={14} color={colors.yellow} />
                  <Text style={styles.chatHeaderText}>AiForge Assistant</Text>
                </View>
                <Text style={styles.chatBody}>{chatReply}</Text>
              </View>
            ) : null}

            <View style={{ height: 120 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 18, paddingBottom: 40, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  creditChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  creditText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  section: { color: colors.textMuted, fontSize: 11, letterSpacing: 1.5, fontWeight: '800', textTransform: 'uppercase', marginTop: 12 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { color: colors.text, fontSize: 15, fontWeight: '800' },
  typeSub: { color: colors.textDim, fontSize: 11 },
  promptBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    minHeight: 120,
  },
  promptInput: { color: colors.text, fontSize: 14, minHeight: 100 },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ideaChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    maxWidth: '100%',
  },
  ideaText: { color: colors.textDim, fontSize: 11 },
  durRow: { flexDirection: 'row', gap: 10 },
  durChip: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElev,
  },
  durText: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  helper: { color: colors.textMuted, fontSize: 11, marginTop: -4 },
  chatCard: {
    marginTop: 18,
    padding: 16,
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.yellow + '44',
    overflow: 'hidden',
  },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  chatHeaderText: { color: colors.yellow, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  chatBody: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
