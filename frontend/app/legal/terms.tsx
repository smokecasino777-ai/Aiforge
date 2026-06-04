import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, FileText } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Acceptance',
    body:
      'By creating an account or using AiForge ("the App") you agree to these Terms. If you do not agree, do not use the App.',
  },
  {
    title: '2. The service',
    body:
      'AiForge is an AI-powered creation tool. You send text prompts; we route them through third-party AI models (OpenAI Sora 2 for video, Google Gemini Nano Banana for images and 3D, Anthropic Claude for chat and OpenSCAD code) and return the result. Generated content is saved to your private Library.',
  },
  {
    title: '3. Your account',
    body:
      'You must be at least 13 years old (or the age of majority in your country, whichever is higher). You are responsible for keeping your password safe. You may not share your account or sell access to it.',
  },
  {
    title: '4. Acceptable use',
    body:
      'You agree NOT to use AiForge to generate:\n• CSAM, deepfake non-consensual sexual content, or content that exploits minors;\n• harassment, doxxing, or material targeting a specific real person without consent;\n• content that infringes copyright or trademarks you do not own;\n• disinformation or impersonation of real public figures in misleading contexts;\n• malware, instructions for weapons, or content that violates applicable law.\n\nWe enforce the safety policies of our upstream model providers (OpenAI, Google, Anthropic). Repeated or severe violations result in account termination without refund.',
  },
  {
    title: '5. Your content',
    body:
      'You retain ownership of every prompt you write and every output you generate. By using the App you grant us a non-exclusive license to store the content on our servers so we can show it back to you. We do not use your content to train AI models. Paid-plan users receive a commercial-use license on outputs they generate while subscribed.',
  },
  {
    title: '6. Subscriptions & payments',
    body:
      'Plans (Free / Spark / Forge / Neon Pro / Quantum / Singularity) are billed monthly through Stripe. Plan upgrades take effect immediately on payment success. You may downgrade at any time from the Plans tab; downgrade takes effect at the end of the current period. We do not refund partial periods.',
  },
  {
    title: '7. Daily limits',
    body:
      'Each plan includes a daily generation quota. When you hit the cap, generation requests return HTTP 402 until the next UTC day or until you upgrade. We may adjust limits to keep the service available for everyone; we will not silently lower YOUR plan unless we publicly announce the change.',
  },
  {
    title: '8. Referral program',
    body:
      'Each user gets a unique referral code (e.g. AF-XXXXXX). When a friend signs up using your code, both accounts receive a +20 generations/day bonus for 7 days. Referral bonuses are non-transferable and have no cash value. We may modify or end the program at any time with reasonable notice.',
  },
  {
    title: '9. Termination',
    body:
      'You can delete your account at any time from Profile → "Delete my account". Deletion is irreversible. We can suspend or close accounts that violate Section 4 ("Acceptable use") or attempt fraud against the payment system.',
  },
  {
    title: '10. Disclaimers',
    body:
      'AiForge is provided "AS IS". AI outputs may be inaccurate, offensive, or unsuitable for a specific use case. You are responsible for reviewing outputs before publishing or distributing them. We do not guarantee uptime; downstream AI providers may have outages.',
  },
  {
    title: '11. Limitation of liability',
    body:
      'To the maximum extent permitted by law, AiForge\'s total liability for any claim related to the service is capped at the amount you paid us in the 12 months before the claim. We are not liable for indirect, incidental, or consequential damages.',
  },
  {
    title: '12. Changes',
    body:
      'We may update these Terms. We post the new version with a fresh "Last updated" date. Continuing to use the App after a change means you accept the new Terms.',
  },
  {
    title: '13. Contact',
    body: 'support@aiforge.app — we reply within 5 business days.',
  },
];

export default function Terms() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.topBar}>
          <PressableScale onPress={() => router.back()} testID="legal-back">
            <View style={styles.backBtn}>
              <ArrowLeft size={18} color={colors.text} />
              <Text style={styles.backText}>Back</Text>
            </View>
          </PressableScale>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <FileText size={20} color={colors.green} />
            <Text style={styles.title}>Terms of Service</Text>
          </View>
          <Text style={styles.updated}>Last updated: June 2026</Text>
          <Text style={styles.intro}>
            These are the rules of the road for using AiForge. Plain English, no surprises.
          </Text>
          {SECTIONS.map((s) => (
            <View key={s.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <Text style={styles.sectionBody}>{s.body}</Text>
            </View>
          ))}
          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: 18, paddingTop: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  scroll: { padding: 18, paddingBottom: 40, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  updated: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  intro: { color: colors.textDim, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  section: {
    backgroundColor: colors.bgElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  sectionTitle: { color: colors.green, fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
  sectionBody: { color: colors.text, fontSize: 13, lineHeight: 20 },
});
