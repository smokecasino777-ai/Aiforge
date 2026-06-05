import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageIcon, Video, Box, MessageSquare, ArrowRight, Sparkles, Zap } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import PulsingLogo from '@/src/components/Logo';
import GradientButton from '@/src/components/GradientButton';
import PressableScale from '@/src/components/PressableScale';
import CreationCard from '@/src/components/CreationCard';
import { colors, radius } from '@/src/theme/colors';
import { useAuth } from '@/src/context/AuthContext';
import { api, Creation } from '@/src/api/client';

type Stats = { image: number; video: number; model3d: number; chat: number };

export default function Home() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [stats, setStats] = useState<Stats>({ image: 0, video: 0, model3d: 0, chat: 0 });
  const [recent, setRecent] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api.creationStats(), api.listCreations()]);
      setStats(s);
      setRecent(list.slice(0, 8));
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      refresh();
    }, [load, refresh]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}
        >
          <View style={styles.topBar}>
            <PulsingLogo size={36} textSize={18} />
            <PressableScale
              onPress={() => router.push('/(tabs)/plans')}
              style={styles.planChip}
              testID="plan-chip"
            >
              <Sparkles size={12} color={colors.cyan} />
              <Text style={styles.planChipText}>
                {(user?.plan || 'free').toUpperCase()}
              </Text>
            </PressableScale>
          </View>

          <View style={styles.welcomeCard}>
            <Text style={styles.eyebrow}>AI-Powered Creation</Text>
            <Text style={styles.welcome}>
              Welcome to <Text style={{ color: colors.cyan }}>Ai</Text>
              <Text style={{ color: colors.green }}>Forge</Text>
            </Text>
            <Text style={styles.welcomeSub}>
              Generate stunning images, videos and 3D models with the power of AI.
            </Text>

            <View style={styles.usageRow}>
              <Text style={styles.usageLabel}>Today&apos;s usage</Text>
              <Text style={styles.usageValue}>
                {user?.daily_used ?? 0} / {user?.daily_limit ?? 5}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <LinearGradient
                colors={[colors.cyan, colors.green]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(100, ((user?.daily_used ?? 0) / Math.max(1, user?.daily_limit ?? 5)) * 100)}%`,
                  },
                ]}
              />
            </View>

            <GradientButton
              title="Start Creating"
              onPress={() => router.push('/(tabs)/create')}
              icon={<Sparkles size={16} color="#000" />}
              testID="start-creating-btn"
              style={{ marginTop: 20 }}
            />
          </View>

          <View style={styles.categoryRow}>
            <CategoryCard
              icon={<ImageIcon size={22} color={colors.green} />}
              label="Images"
              count={stats.image}
              color={colors.green}
              onPress={() => router.push({ pathname: '/(tabs)/library', params: { type: 'image' } } as any)}
              testID="cat-image"
            />
            <CategoryCard
              icon={<Video size={22} color={colors.cyan} />}
              label="Videos"
              count={stats.video}
              color={colors.cyan}
              onPress={() => router.push({ pathname: '/(tabs)/library', params: { type: 'video' } } as any)}
              testID="cat-video"
            />
            <CategoryCard
              icon={<Box size={22} color={colors.purple} />}
              label="3D Models"
              count={stats.model3d}
              color={colors.purple}
              onPress={() => router.push({ pathname: '/(tabs)/library', params: { type: 'model3d' } } as any)}
              testID="cat-3d"
            />
          </View>

          {/* Editor entry tile */}
          <PressableScale onPress={() => router.push('/editor' as any)} testID="home-editor-tile">
            <LinearGradient
              colors={[colors.green + '22', colors.cyan + '14', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editorTile}
            >
              <View style={styles.editorTileLeft}>
                <View style={styles.editorTileBadge}>
                  <Zap size={18} color={colors.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editorTileTitle}>OPEN THE EDITOR</Text>
                  <Text style={styles.editorTileSub}>
                    Crop · trim · style transfer · BG remove · AI captions
                  </Text>
                </View>
              </View>
              <ArrowRight size={18} color={colors.green} />
            </LinearGradient>
          </PressableScale>

          {/* CAD generator tile */}
          <PressableScale onPress={() => router.push('/cad' as any)} testID="home-cad-tile">
            <LinearGradient
              colors={[colors.cyan + '22', colors.purple + '14', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.editorTile, { borderColor: colors.cyan + '55' }]}
            >
              <View style={styles.editorTileLeft}>
                <View style={[styles.editorTileBadge, { backgroundColor: colors.cyan + '22', borderColor: colors.cyan + '88' }]}>
                  <Box size={18} color={colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editorTileTitle}>3D / CAD GENERATOR</Text>
                  <Text style={styles.editorTileSub}>
                    Forge 3D meshes · rotate · zoom · export STL
                  </Text>
                </View>
              </View>
              <ArrowRight size={18} color={colors.cyan} />
            </LinearGradient>
          </PressableScale>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Creations</Text>
            <PressableScale onPress={() => router.push('/(tabs)/library')} style={styles.viewAll}>
              <Text style={styles.viewAllText}>View all</Text>
              <ArrowRight size={14} color={colors.green} />
            </PressableScale>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.cyan} style={{ marginTop: 24 }} />
          ) : recent.length === 0 ? (
            <View style={styles.empty}>
              <MessageSquare size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>No creations yet — tap Create to forge your first piece.</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 14, paddingRight: 24 }}
            >
              {recent.map((c) => (
                <CreationCard key={c.id} creation={c} size="md" />
              ))}
            </ScrollView>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function CategoryCard({
  icon,
  label,
  count,
  color,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <PressableScale onPress={onPress} style={{ flex: 1 }} testID={testID}>
      <View style={[styles.catCard, { borderColor: color + '44' }]}>
        <View style={[styles.catGlow, { backgroundColor: color + '22' }]} />
        <View style={styles.catIconWrap}>{icon}</View>
        <Text style={styles.catCount}>{count}</Text>
        <Text style={styles.catLabel}>{label}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 18, paddingBottom: 40, gap: 22 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cyan + '55',
    backgroundColor: colors.cyan + '15',
  },
  planChipText: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  welcomeCard: {
    backgroundColor: 'rgba(10,10,20,0.7)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 22,
    gap: 8,
    overflow: 'hidden',
  },
  eyebrow: {
    color: colors.cyan,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  welcome: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.7, marginTop: 2 },
  welcomeSub: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 4 },
  usageRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  usageLabel: { color: colors.textMuted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' },
  usageValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginTop: 8,
  },
  barFill: { height: 6, borderRadius: 3 },
  categoryRow: { flexDirection: 'row', gap: 10 },
  editorTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.green + '55',
    overflow: 'hidden',
  },
  editorTileLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  editorTileBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.green + '22',
    borderColor: colors.green + '88',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorTileTitle: { color: colors.text, fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  editorTileSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  catCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  catGlow: { position: 'absolute', width: 80, height: 80, borderRadius: 40, right: -20, top: -20 },
  catIconWrap: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' },
  catCount: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 8 },
  catLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllText: { color: colors.green, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyText: { color: colors.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: 22 },
});
