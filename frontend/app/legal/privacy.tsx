import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Shield } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import PressableScale from '@/src/components/PressableScale';
import { colors, radius } from '@/src/theme/colors';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Who we are',
    body:
      'AiForge ("we", "us") is a multi-AI creation app operated by the developer behind the Google Play listing for `com.aiforge.app`. Contact: support@aiforge.app.',
  },
  {
    title: '2. What we collect',
    body:
      '• Account: email address and a hashed password (we never see your raw password).\n• Content: text prompts you submit and the resulting media (images, video, 3D renders, OpenSCAD code, chat replies). These are stored under your account so you can retrieve them in your Library.\n• Usage: daily generation counts and plan/tier.\n• Payment: when you upgrade we send the request to Stripe; Stripe (not us) handles the card. We store only the Stripe session id, the amount, the plan, and your paid timestamp.\n• Device: standard server logs (IP, user-agent) for security and abuse prevention.\n• Referrals: your unique referral code and the user-id of whoever referred you, if applicable.',
  },
  {
    title: '3. How we use it',
    body:
      '• To run AiForge: authenticate you, generate AI content, save your creations, count your daily usage, and apply your plan limits.\n• To bill you: hand over payment data to Stripe and update your plan when payment succeeds.\n• To grow: when you redeem a referral code, we award the bonus to both accounts.\n• We do NOT sell your data. We do NOT show third-party ads.',
  },
  {
    title: '4. Third-party services we send data to',
    body:
      '• Stripe — to process payments. See https://stripe.com/privacy.\n• OpenAI (Sora 2) — your video-generation prompts.\n• Google Gemini (Nano Banana) — your image/3D prompts.\n• Anthropic (Claude) — your chat and SCAD-code prompts.\n\nThese providers process your prompts only to fulfill the request. We send only what is necessary (prompt + minimal metadata).',
  },
  {
    title: '5. Storage & security',
    body:
      'Data is stored in a managed MongoDB instance. Passwords are hashed with bcrypt. All traffic between the app and our backend is HTTPS. Stripe keys live only on the server (never in the app bundle).',
  },
  {
    title: '6. Your rights',
    body:
      'You can:\n• View your data — every creation is visible in the Library.\n• Delete a single creation — open it and tap Delete.\n• Delete your entire account — Profile → "Delete my account" (this is irreversible and erases creations, chats, usage history, and payment records).\n• Export your data — email support@aiforge.app and we will return a JSON archive within 14 days.\n• Withdraw consent — uninstall the app and trigger account deletion.',
  },
  {
    title: '7. Children',
    body:
      'AiForge is not directed to children under 13. If you believe a child has signed up, contact support@aiforge.app and we will remove the account.',
  },
  {
    title: '8. Changes',
    body:
      'We may update this policy. The "Last updated" date below tracks revisions. Material changes are announced in-app before they take effect.',
  },
  {
    title: '9. Contact',
    body: 'support@aiforge.app — we reply within 5 business days.',
  },
];

export default function Privacy() {
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
            <Shield size={20} color={colors.cyan} />
            <Text style={styles.title}>Privacy Policy</Text>
          </View>
          <Text style={styles.updated}>Last updated: June 2026</Text>
          <Text style={styles.intro}>
            This policy explains what data AiForge collects when you use the app, why we collect it, and what your rights are. We wrote it in plain English on purpose.
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
  sectionTitle: { color: colors.cyan, fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
  sectionBody: { color: colors.text, fontSize: 13, lineHeight: 20 },
});
