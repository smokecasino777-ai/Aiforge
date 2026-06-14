import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { colors } from '@/src/theme/colors';
import { storage } from '@/src/utils/storage';
import AnimatedSplash from '@/src/components/AnimatedSplash';

export default function Index() {
  const { user, loading } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [splashSeen, setSplashSeen] = useState(false);

  useEffect(() => {
    (async () => {
      const v = await storage.getItem<string>('aiforge_onboarded', '');
      setOnboarded(!!v);
    })();
  }, []);

  if (loading || onboarded === null) {
    return (
      <View style={styles.center} testID="splash-loader">
        <ActivityIndicator color={colors.cyan} size="large" />
      </View>
    );
  }
  // Play the animated splash once per cold-start before routing further.
  if (!splashSeen) {
    return <AnimatedSplash onDone={() => setSplashSeen(true)} />;
  }
  if (!onboarded && !user) return <Redirect href="/onboarding" />;
  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
