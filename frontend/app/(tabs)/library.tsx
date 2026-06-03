import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LayoutGrid, ImageIcon, Video, Box, MessageSquare } from 'lucide-react-native';
import StarryBackground from '@/src/components/StarryBackground';
import GhostLogoBackground from '@/src/components/GhostLogoBackground';
import CreationCard from '@/src/components/CreationCard';
import PressableScale from '@/src/components/PressableScale';
import GradientButton from '@/src/components/GradientButton';
import { colors, radius } from '@/src/theme/colors';
import { api, Creation } from '@/src/api/client';

type Filter = 'all' | 'image' | 'video' | 'model3d' | 'chat';

const FILTERS: { id: Filter; label: string; Icon: any; color: string }[] = [
  { id: 'all', label: 'All', Icon: LayoutGrid, color: colors.text },
  { id: 'image', label: 'Images', Icon: ImageIcon, color: colors.green },
  { id: 'video', label: 'Videos', Icon: Video, color: colors.cyan },
  { id: 'model3d', label: '3D', Icon: Box, color: colors.purple },
  { id: 'chat', label: 'Chats', Icon: MessageSquare, color: colors.yellow },
];

export default function Library() {
  const params = useLocalSearchParams<{ type?: string }>();
  const router = useRouter();
  const initialFilter = (params.type as Filter) || 'all';
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [items, setItems] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.listCreations(filter === 'all' ? undefined : filter);
      setItems(list);
    } catch {}
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <StarryBackground />
      <GhostLogoBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}
        >
          <Text style={styles.title}>Library</Text>
          <Text style={styles.sub}>Everything you&apos;ve forged.</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingVertical: 6 }}
          >
            {FILTERS.map((f) => (
              <PressableScale
                key={f.id}
                onPress={() => setFilter(f.id)}
                testID={`filter-${f.id}`}
              >
                <View
                  style={[
                    styles.filterChip,
                    filter === f.id && {
                      borderColor: f.color,
                      backgroundColor: f.color + '20',
                    },
                  ]}
                >
                  <f.Icon size={14} color={filter === f.id ? f.color : colors.textDim} />
                  <Text
                    style={[
                      styles.filterText,
                      filter === f.id && { color: f.color, fontWeight: '800' },
                    ]}
                  >
                    {f.label}
                  </Text>
                </View>
              </PressableScale>
            ))}
          </ScrollView>

          {loading ? (
            <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} />
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>
                Tap Create to forge your first AI masterpiece.
              </Text>
              <GradientButton
                title="Open Create"
                onPress={() => router.push('/(tabs)/create')}
                style={{ marginTop: 14 }}
                testID="lib-empty-create"
              />
            </View>
          ) : (
            <View style={styles.grid}>
              {items.map((c) => (
                <CreationCard key={c.id} creation={c} size="md" style={{ flexBasis: '48%' }} />
              ))}
            </View>
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 18, paddingBottom: 40, gap: 12 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginTop: 4 },
  sub: { color: colors.textDim, fontSize: 13, marginBottom: 6 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  filterText: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 6 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  emptyText: { color: colors.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
});
