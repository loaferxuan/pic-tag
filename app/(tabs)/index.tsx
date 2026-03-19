import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { usePhotos } from '@/features/photo/hooks/usePhotos';
import { PhotoGrid } from '@/features/photo/components/PhotoGrid';
import { PhotoImporter } from '@/features/photo/components/PhotoImporter';
import { usePhotoDetailStore } from '@/features/photo/store/photo-detail.store';
import { useColorScheme } from '@/shared/hooks/useColorScheme';
import type { Photo } from '@/shared/types/domain';
import Colors from '@/shared/theme/Colors';

export default function HomeScreen() {
  const router = useRouter();
  const { photos, loading, loadingMore, error, loadMore, refresh } = usePhotos();
  const primePhoto = usePhotoDetailStore((s) => s.primePhoto);
  const hasPrefetchedDetailRouteRef = useRef(false);
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  useEffect(() => {
    if (hasPrefetchedDetailRouteRef.current || photos.length === 0) return;
    hasPrefetchedDetailRouteRef.current = true;
    router.prefetch(`/photo/${photos[0].id}`);
  }, [photos, router]);

  const handlePhotoPress = useCallback(
    (photo: Photo) => {
      primePhoto(photo);
      router.push(`/photo/${photo.id}`);
    },
    [primePhoto, router]
  );

  const handleEndReached = useCallback(() => {
    void loadMore();
  }, [loadMore]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerArea}>
        <PhotoImporter onImported={() => void refresh()} />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          提示：点击任意照片，可进入单张照片标签管理。
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PhotoGrid
        photos={photos}
        onPhotoPress={handlePhotoPress}
        onEndReached={handleEndReached}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>暂无照片，可从系统相册导入。</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>加载更多中...</Text>
            </View>
          ) : null
        }
        showTags
      />

      {loading && photos.length === 0 ? (
        <View style={styles.loading}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>加载中...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerArea: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  error: {
    color: '#ef4444',
    paddingHorizontal: 16,
    paddingBottom: 12,
    fontSize: 14,
  },
  hint: {
    fontSize: 13,
    marginTop: 12,
    letterSpacing: 0.2,
  },
  empty: {
    paddingVertical: 64,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
  loading: {
    padding: 24,
    alignItems: 'center',
  },
  loadingMore: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
  },
});

