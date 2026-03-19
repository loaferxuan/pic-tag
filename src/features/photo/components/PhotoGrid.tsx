import React, { memo, useCallback } from 'react';
import { FlatList, StyleSheet, type ListRenderItem } from 'react-native';
import { PhotoCard, photoCardGap } from './PhotoCard';
import type { Photo } from '@/shared/types/domain';

const defaultPerformanceOptions = {
  initialNumToRender: 18,
  maxToRenderPerBatch: 12,
  windowSize: 5,
  updateCellsBatchingPeriod: 50,
} as const;

const aggressivePerformanceOptions = {
  initialNumToRender: 9,
  maxToRenderPerBatch: 6,
  windowSize: 3,
  updateCellsBatchingPeriod: 16,
} as const;

interface PhotoGridProps {
  photos: Photo[];
  onPhotoPress: (photo: Photo) => void;
  onEndReached?: () => void;
  ListHeaderComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  showTags?: boolean;
  performancePreset?: 'default' | 'aggressive';
}

export const PhotoGrid = memo(function PhotoGrid({
  photos,
  onPhotoPress,
  onEndReached,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  showTags = false,
  performancePreset = 'default',
}: PhotoGridProps) {
  const performanceOptions =
    performancePreset === 'aggressive' ? aggressivePerformanceOptions : defaultPerformanceOptions;
  const keyExtractor = useCallback((item: Photo) => String(item.id), []);
  const renderItem = useCallback<ListRenderItem<Photo>>(
    ({ item }) => <PhotoCard photo={item} onPhotoPress={onPhotoPress} showTags={showTags} />,
    [onPhotoPress, showTags]
  );

  return (
    <FlatList
      data={photos}
      keyExtractor={keyExtractor}
      numColumns={3}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      renderItem={renderItem}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.3}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      initialNumToRender={performanceOptions.initialNumToRender}
      maxToRenderPerBatch={performanceOptions.maxToRenderPerBatch}
      windowSize={performanceOptions.windowSize}
      updateCellsBatchingPeriod={performanceOptions.updateCellsBatchingPeriod}
      removeClippedSubviews
    />
  );
});

PhotoGrid.displayName = 'PhotoGrid';

const styles = StyleSheet.create({
  list: {
    padding: photoCardGap / 2,
    paddingBottom: 100,
  },
  row: {
    justifyContent: 'flex-start',
  },
});
