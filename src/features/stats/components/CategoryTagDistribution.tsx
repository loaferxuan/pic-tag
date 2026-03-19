import React, { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { CategoryStat, CategoryTagStat } from '@/shared/types/domain';
import { getContrastTextColor, normalizeHexColor } from '@/shared/utils/color';

interface CategoryTagDistributionProps {
  category: CategoryStat | null;
  data: CategoryTagStat[];
  header?: React.ReactElement | null;
  refreshing?: boolean;
  onRefresh?: () => void;
}

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function CategoryTagDistribution({
  category,
  data,
  header = null,
  refreshing = false,
  onRefresh,
}: CategoryTagDistributionProps) {
  const { width } = useWindowDimensions();
  const columns = width >= 430 ? 6 : 5;
  const itemWidth = `${100 / columns}%` as `${number}%`;

  const filtered = useMemo(() => data.filter((item) => item.photoCount > 0), [data]);

  const listData = category ? filtered : [];
  const emptyText = category
    ? '\u5f53\u524d\u5206\u7c7b\u6682\u65e0\u547d\u4e2d\u6807\u7b7e'
    : '\u6682\u65e0\u53ef\u67e5\u770b\u7684\u5206\u7c7b';

  return (
    <FlatList
      key={`stats-grid-${columns}`}
      data={listData}
      keyExtractor={(item) => String(item.tagId)}
      numColumns={columns}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        const stripColor = normalizeHexColor(item.tagColor, '#9CA3AF');
        const stripTextColor = getContrastTextColor(stripColor);

        return (
          <View style={[styles.gridItem, { width: itemWidth }]}>
            <View style={styles.tile}>
              <View style={styles.tileBody}>
                <Text style={styles.count}>{item.photoCount}</Text>
                <Text style={styles.percent}>{toPercent(item.categoryShare)}</Text>
              </View>
              <View style={[styles.tagStrip, { backgroundColor: stripColor }]}>
                <Text style={[styles.tagName, { color: stripTextColor }]} numberOfLines={1}>
                  {item.tagName}
                </Text>
              </View>
            </View>
          </View>
        );
      }}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>{emptyText}</Text>
        </View>
      }
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 24,
  },
  gridItem: {
    paddingHorizontal: 1.5,
    marginBottom: 6,
  },
  tile: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  tileBody: {
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  count: {
    textAlign: 'center',
    color: '#111827',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  percent: {
    marginTop: 1,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
  },
  tagStrip: {
    minHeight: 20,
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  tagName: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
  emptyWrap: {
    paddingVertical: 24,
  },
  empty: {
    color: '#9ca3af',
    textAlign: 'center',
    fontSize: 13,
  },
});
