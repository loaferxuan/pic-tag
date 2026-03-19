import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { getStatsSummary } from '@/features/stats/services/stats.service';
import type { StatsSummary } from '@/shared/types/domain';
import { CategoryTagDistribution } from '@/features/stats/components/CategoryTagDistribution';
import { normalizeHexColor } from '@/shared/utils/color';

function parseCategoryKey(categoryKey: string | null): number | null | undefined {
  if (!categoryKey) return undefined;
  if (categoryKey === 'uncategorized') return null;
  if (!/^\d+$/.test(categoryKey)) return undefined;
  return Number.parseInt(categoryKey, 10);
}

export default function CategoryStatsDetailScreen() {
  const params = useLocalSearchParams<{ categoryKey?: string | string[] }>();
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryKey = useMemo(() => {
    const raw = params.categoryKey;
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw ?? null;
  }, [params.categoryKey]);

  const targetCategoryId = useMemo(() => parseCategoryKey(categoryKey), [categoryKey]);

  const loadSummary = useCallback(async (mode: 'focus' | 'refresh') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const next = await getStatsSummary();
      setSummary(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '\u52a0\u8f7d\u7edf\u8ba1\u5931\u8d25');
    } finally {
      if (mode === 'refresh') {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSummary('focus');
    }, [loadSummary])
  );

  const category = useMemo(() => {
    if (!summary || targetCategoryId === undefined) return null;
    return summary.categoryStats.find((item) => item.categoryId === targetCategoryId) ?? null;
  }, [summary, targetCategoryId]);

  const categoryTags = useMemo(() => {
    if (!summary || targetCategoryId === undefined) return [];
    return summary.categoryTagStats.filter((item) => item.categoryId === targetCategoryId);
  }, [summary, targetCategoryId]);

  const relatedTagCount = useMemo(
    () => categoryTags.filter((item) => item.photoCount > 0).length,
    [categoryTags]
  );

  if (loading && !summary) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{'\u52a0\u8f7d\u4e2d...'}</Text>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{error ?? '\u6682\u65e0\u6570\u636e'}</Text>
      </View>
    );
  }

  if (targetCategoryId === undefined) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{'\u5206\u7c7b\u53c2\u6570\u65e0\u6548'}</Text>
      </View>
    );
  }

  if (!category) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{'\u5206\u7c7b\u4e0d\u5b58\u5728\u6216\u4e0d\u53ef\u7528'}</Text>
      </View>
    );
  }

  const categoryColor = normalizeHexColor(category.categoryColor, '#9CA3AF');

  const header = (
    <View style={styles.headerWrap}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.compactHeader}>
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: categoryColor }]} />
          <Text style={styles.title} numberOfLines={1}>
            {category.categoryName}
          </Text>
        </View>

        <View style={styles.chipsRow}>
          <View style={styles.chip}>
            <Text style={styles.chipValue}>{relatedTagCount}</Text>
            <Text style={styles.chipLabel}>{'\u5173\u8054\u6807\u7b7e(\u5927\u4e8e0)'}</Text>
          </View>

          <View style={styles.chip}>
            <Text style={styles.chipValue}>{category.assignmentCount}</Text>
            <Text style={styles.chipLabel}>{'\u547d\u4e2d\u603b\u6570'}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <CategoryTagDistribution
        category={category}
        data={categoryTags}
        header={header}
        refreshing={refreshing}
        onRefresh={() => {
          void loadSummary('refresh');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  muted: {
    color: '#9ca3af',
    fontSize: 14,
  },
  headerWrap: {
    marginBottom: 6,
  },
  error: {
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 6,
  },
  compactHeader: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.15)',
  },
  title: {
    flex: 1,
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    paddingVertical: 6,
    alignItems: 'center',
  },
  chipValue: {
    color: '#111827',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700',
  },
  chipLabel: {
    marginTop: 1,
    color: '#6b7280',
    fontSize: 11,
    lineHeight: 13,
  },
});
