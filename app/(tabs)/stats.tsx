import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { getStatsSummary, getTakenDateStatsPage } from '@/features/stats/services/stats.service';
import type { StatsSummary, TakenDateStatsPage, TimeStatsBucket, TimeStatsGranularity } from '@/shared/types/domain';
import { CategoryOverview } from '@/features/stats/components/CategoryOverview';
import { TakenDateBreakdown } from '@/features/stats/components/TakenDateBreakdown';
import { useColorScheme } from '@/shared/hooks/useColorScheme';
import Colors from '@/shared/theme/Colors';

const TIME_STATS_PAGE_SIZE = 100;

function toCategoryKey(categoryId: number | null): string {
  return categoryId == null ? 'uncategorized' : String(categoryId);
}

export default function StatsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [granularity, setGranularity] = useState<TimeStatsGranularity>('month');
  const granularityRef = useRef<TimeStatsGranularity>('month');
  const [timeBuckets, setTimeBuckets] = useState<TimeStatsBucket[]>([]);
  const [timeOffset, setTimeOffset] = useState(0);
  const [timeTotalBuckets, setTimeTotalBuckets] = useState(0);
  const [timeLoading, setTimeLoading] = useState(true);
  const [timeLoadingMore, setTimeLoadingMore] = useState(false);
  const [timeHasMore, setTimeHasMore] = useState(false);
  const [undatedPhotoCount, setUndatedPhotoCount] = useState(0);
  const [datedPhotoCount, setDatedPhotoCount] = useState(0);
  const [timeError, setTimeError] = useState<string | null>(null);

  const applyTimeStatsPage = useCallback((page: TakenDateStatsPage, append: boolean) => {
    setTimeBuckets((prev) => (append ? [...prev, ...page.buckets] : page.buckets));
    setTimeOffset(page.loadedBuckets);
    setTimeTotalBuckets(page.totalBuckets);
    setTimeHasMore(page.hasMore);
    setUndatedPhotoCount(page.undatedPhotoCount);
    setDatedPhotoCount(page.datedPhotoCount);
  }, []);

  const loadDashboard = useCallback(
    async (mode: 'focus' | 'refresh', targetGranularity: TimeStatsGranularity) => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setTimeLoading(true);
      setTimeLoadingMore(false);

      try {
        const [nextSummary, timePage] = await Promise.all([
          getStatsSummary(),
          getTakenDateStatsPage({
            granularity: targetGranularity,
            limit: TIME_STATS_PAGE_SIZE,
            offset: 0,
          }),
        ]);

        setSummary(nextSummary);
        applyTimeStatsPage(timePage, false);
        setError(null);
        setTimeError(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : '加载统计失败';
        setError(message);
        setTimeError(message);
      } finally {
        if (mode === 'refresh') {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
        setTimeLoading(false);
      }
    },
    [applyTimeStatsPage]
  );

  const loadMoreTimeBuckets = useCallback(async () => {
    if (timeLoading || timeLoadingMore || !timeHasMore) return;

    setTimeLoadingMore(true);
    try {
      const timePage = await getTakenDateStatsPage({
        granularity,
        limit: TIME_STATS_PAGE_SIZE,
        offset: timeOffset,
      });
      applyTimeStatsPage(timePage, true);
      setTimeError(null);
    } catch (e) {
      setTimeError(e instanceof Error ? e.message : '加载时间统计失败');
    } finally {
      setTimeLoadingMore(false);
    }
  }, [applyTimeStatsPage, granularity, timeHasMore, timeLoading, timeLoadingMore, timeOffset]);

  const handleGranularityChange = useCallback(
    async (nextGranularity: TimeStatsGranularity) => {
      if (nextGranularity === granularity) return;

      setGranularity(nextGranularity);
      granularityRef.current = nextGranularity;
      setTimeLoading(true);
      setTimeLoadingMore(false);
      try {
        const timePage = await getTakenDateStatsPage({
          granularity: nextGranularity,
          limit: TIME_STATS_PAGE_SIZE,
          offset: 0,
        });
        applyTimeStatsPage(timePage, false);
        setTimeError(null);
      } catch (e) {
        setTimeError(e instanceof Error ? e.message : '加载时间统计失败');
      } finally {
        setTimeLoading(false);
      }
    },
    [applyTimeStatsPage, granularity]
  );

  useFocusEffect(
    useCallback(() => {
      void loadDashboard('focus', granularityRef.current);
    }, [loadDashboard])
  );

  if (loading && !summary) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.muted, { color: colors.textSecondary }]}>加载中...</Text>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.muted, { color: colors.textSecondary }]}>{error ?? '暂无数据'}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void loadDashboard('refresh', granularityRef.current);
          }}
          tintColor={colors.tint}
        />
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {timeError ? <Text style={styles.error}>{timeError}</Text> : null}

      <View style={styles.cards}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardValue, { color: colors.text }]}>{summary.totalPhotos}</Text>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>总照片数</Text>
        </View>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
          onPress={() => {
            router.push('/search?preset=untagged' as Href);
          }}
        >
          <Text style={[styles.cardValue, { color: colors.text }]}>{summary.untaggedCount}</Text>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>未打标签</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>点按查看对应结果</Text>
        </TouchableOpacity>
      </View>

      {summary.unresolvedAssociationCount > 0 ? (
        <TouchableOpacity
          style={[styles.unresolvedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
          onPress={() => {
            router.push('/search?preset=unresolved_not_found' as Href);
          }}
        >
          <Text style={[styles.cardValue, { color: colors.text }]}>{summary.unresolvedAssociationCount}</Text>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>未完成关联</Text>
          <Text style={[styles.cardHint, { color: colors.textSecondary }]}>点按查看待处理照片</Text>
        </TouchableOpacity>
      ) : null}

      <TakenDateBreakdown
        granularity={granularity}
        buckets={timeBuckets}
        datedPhotoCount={datedPhotoCount}
        undatedPhotoCount={undatedPhotoCount}
        totalBuckets={timeTotalBuckets}
        loading={timeLoading}
        loadingMore={timeLoadingMore}
        hasMore={timeHasMore}
        onGranularityChange={(next) => {
          void handleGranularityChange(next);
        }}
        onLoadMore={() => {
          void loadMoreTimeBuckets();
        }}
      />

      <CategoryOverview
        categories={summary.categoryStats}
        onSelectCategory={(categoryId) => {
          router.push(`/stats/${toCategoryKey(categoryId)}` as Href);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
  },
  muted: {
    fontSize: 14,
  },
  cards: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  card: {
    flex: 1,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  unresolvedCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  cardLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '500',
  },
  cardHint: {
    marginTop: 8,
    fontSize: 12,
  },
});
