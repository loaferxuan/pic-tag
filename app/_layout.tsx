import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { getDb } from '@/infra/db/client';
import { startFingerprintBootstrap } from '@/features/photo/services/photo-fingerprint.service';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    const init = async () => {
      try {
        await getDb();
        void startFingerprintBootstrap();
      } catch {
        // Keep splash flow alive even if DB init fails in development.
      }
      if (loaded) {
        await SplashScreen.hideAsync();
      }
    };
    init();
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ freezeOnBlur: true }} />
        <Stack.Screen name="tag/manage/[categoryKey]" options={{ headerShown: true, title: '标签管理' }} />
        <Stack.Screen name="photo/[id]" options={{ headerShown: true, title: '照片详情' }} />
        <Stack.Screen name="tag/manage" options={{ headerShown: true, title: '标签管理' }} />
        <Stack.Screen name="stats/[categoryKey]" options={{ headerShown: true, title: '分类详情' }} />
      </Stack>
    </ThemeProvider>
  );
}
