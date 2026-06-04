import React, { useRef, useState } from 'react';
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
  Send,
  Bot,
  User as UserIcon,
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
  { id: 'chat', label: 'AI Assist', sub: 'Multi-turn chat', color: colors.yellow, Icon: MessageSquare },
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
    'Help me design a 3D ring with cyberpunk details',
  ],
};

type ChatMsg = { role: 'user' | 'assistant'; text: string };

export default function CreateScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [type, setType] = useState<GenType>('image');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<number>(4);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatSession, setChatSession] = useState<string | undefined>();
  const chatScrollRef = useRef<ScrollView>(null);

  const remaining = Math.max(0, (user?.daily_limit ?? 0) - (user?.daily_used ?? 0));
  const overLimit = remaining === 0;

  const sendChat = async () => {
    const text = prompt.trim();
    if (!text) return;
    if (overLimit) {
      Alert.alert('Daily limit hit', 'Upgrade your plan for more.', [
        { text: 'Later', style: 'cancel' },
        { text: 'See plans', onPress: () => router.push('/(tabs)/plans') },
      ]);
      return;
    }
    setMessages((m) => [...m, { role: 'user', text }]);
    setPrompt('');
    setLoading(true);
    try {
      const r = await api.chat(text, chatSession);
      setChatSession(r.session_id);
      setMessages((m) => [...m, { role: 'assistant', text: r.reply }]);
      await refresh();
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      Alert.alert('Chat failed', e.message);
    } finally {
      setLoading(false);
    }
  };

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
    try {
      let creation;
      if (type === 'scad') {
        creation = await api.generateScad(prompt);
      } else {
        creation = await api.generate({
          type: type as 'image' | 'video' | 'model3d',
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
                  {
                    borderColor: overLimit ? colors.red + '88' : colors.green + '66',
                    backgroundColor: overLimit ? colors.red + '15' : colors.green + '15',
                  },
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

            {type === 'chat' ? (
              <ChatPanel
                messages={messages}
                prompt={prompt}
                setPrompt={setPrompt}
                onSend={sendChat}
                loading={loading}
                scrollRef={chatScrollRef}
                onPickIdea={(p) => setPrompt(p)}
                ideas={PROMPT_IDEAS.chat}
              />
            ) : (
              <>
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
                              style={[styles.durText, duration === d && { color: colors.cyan, fontWeight: '900' }]}
                            >
                              {d}s
                            </Text>
                          </View>
                        </PressableScale>
                      ))}
                    </View>
                    <Text style={styles.helper}>
                      Sora 2 supports 4 / 8 / 12s. Use the in-library editor to trim & loop up to 60s.
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
              </>
            )}

            <View style={{ height: 140 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function ChatPanel({
  messages,
  prompt,
  setPrompt,
  onSend,
  loading,
  scrollRef,
  onPickIdea,
  ideas,
}: {
  messages: ChatMsg[];
  prompt: string;
  setPrompt: (s: string) => void;
  onSend: () => void;
  loading: boolean;
  scrollRef: React.RefObject<ScrollView | null>;
  onPickIdea: (p: string) => void;
  ideas: string[];
}) {
  return (
    <View style={styles.chatWrap}>
      <View style={styles.chatHeader}>
        <LinearGradient
          colors={[colors.yellow, '#FFB700']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.chatAvatar}
        >
          <Bot size={16} color="#000" strokeWidth={2.5} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.chatTitle}>AiForge Assistant</Text>
          <Text style={styles.chatSub}>Ask me anything — I help craft prompts, ideas & code.</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chatList}
        contentContainerStyle={{ padding: 10, gap: 10 }}
        nestedScrollEnabled
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.chatEmpty}>
            <Text style={styles.chatEmptyTitle}>Hi, I&apos;m your creative co-pilot.</Text>
            <Text style={styles.chatEmptyText}>Try one of these to get started:</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              {ideas.map((i) => (
                <PressableScale
                  key={i}
                  onPress={() => onPickIdea(i)}
                  testID={`chat-idea-${i.slice(0, 10)}`}
                >
                  <View style={styles.chatIdea}>
                    <Sparkles size={12} color={colors.yellow} />
                    <Text style={styles.chatIdeaText}>{i}</Text>
                  </View>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}
        {messages.map((m, i) => (
          <View
            key={i}
            style={[styles.bubbleRow, m.role === 'user' && { justifyContent: 'flex-end' }]}
          >
            {m.role === 'assistant' ? (
              <View style={styles.bubbleAvatar}>
                <Bot size={12} color={colors.yellow} />
              </View>
            ) : null}
            <View
              style={[
                styles.bubble,
                m.role === 'user' ? styles.bubbleUser : styles.bubbleAi,
              ]}
            >
              <Text style={[styles.bubbleText, m.role === 'user' && { color: '#000' }]}>
                {m.text}
              </Text>
            </View>
            {m.role === 'user' ? (
              <View style={[styles.bubbleAvatar, { backgroundColor: colors.cyan + '22' }]}>
                <UserIcon size={12} color={colors.cyan} />
              </View>
            ) : null}
          </View>
        ))}
        {loading ? (
          <View style={styles.bubbleRow}>
            <View style={styles.bubbleAvatar}>
              <Bot size={12} color={colors.yellow} />
            </View>
            <View style={[styles.bubble, styles.bubbleAi]}>
              <Text style={styles.bubbleText}>Thinking…</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.chatInputRow}>
        <View style={styles.chatInputBox}>
          <TextInput
            testID="chat-input"
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Ask the Assistant…"
            placeholderTextColor={colors.textMuted}
            style={styles.chatInput}
            multiline
          />
        </View>
        <PressableScale
          onPress={onSend}
          haptic
          testID="chat-send"
        >
          <LinearGradient
            colors={[colors.yellow, '#FFB700']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sendBtn}
          >
            <Send size={18} color="#000" strokeWidth={2.5} />
          </LinearGradient>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 18, paddingBottom: 40, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  creditChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1,
  },
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
  // chat
  chatWrap: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.yellow + '44',
    overflow: 'hidden',
    marginTop: 12,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: 'rgba(255,214,10,0.06)',
  },
  chatAvatar: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  chatTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  chatSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  chatList: { maxHeight: 420, minHeight: 280 },
  chatEmpty: { padding: 16, gap: 6 },
  chatEmptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  chatEmptyText: { color: colors.textDim, fontSize: 12 },
  chatIdea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chatIdeaText: { color: colors.textDim, fontSize: 12, flex: 1 },
  bubbleRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  bubbleAvatar: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: colors.yellow + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
  },
  bubbleAi: {
    backgroundColor: 'rgba(255,214,10,0.08)',
    borderColor: colors.yellow + '33',
    borderWidth: 1,
  },
  bubbleUser: {
    backgroundColor: colors.cyan,
  },
  bubbleText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chatInputBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
  },
  chatInput: { color: colors.text, fontSize: 13, maxHeight: 100 },
  sendBtn: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.yellow, shadowOpacity: 0.7, shadowRadius: 10,
  },
});
