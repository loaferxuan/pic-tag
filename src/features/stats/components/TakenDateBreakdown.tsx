import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '@/shared/ui/Button';
import type { TimeStatsBucket, TimeStatsGranularity } from '@/shared/types/domain';

interface TakenDateBreakdownProps {
  granularity: TimeStatsGranularity;
  buckets: TimeStatsBucket[];
  datedPhotoCount: number;
  undatedPhotoCount: number;
  totalBuckets: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onGranularityChange: (granularity: TimeStatsGranularity) => void;
  onLoadMore: () => void;
}

const GRANULARITY_OPTIONS: Array<{ value: TimeStatsGranularity; label: string }> = [
  { value: 'year', label: '按年' },
  { value: 'month', label: '按月' },
  { value: 'day', label: '按天' },
];

export function TakenDateBreakdown({
  granularity,
  buckets,
  datedPhotoCount,
  undatedPhotoCount,
  totalBuckets,
  loading,
  loadingMore,
  hasMore,
  onGranularityChange,
  onLoadMore,
}: TakenDateBreakdownProps) {
  const [collapsed, setCollapsed] = useState(false);
  const maxCount = useMemo(
    () => Math.max(1, ...buckets.map((bucket) => bucket.photoCount)),
    [buckets]
  );
  const summary = `${datedPhotoCount} 已标注 / ${undatedPhotoCount} 未设置`;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.header}
        activeOpacity={0.75}
        onPress={() => setCollapsed((prev) => !prev)}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
      >
        <Text style={styles.title}>拍摄日期统计</Text>
        <View style={styles.headerMeta}>
          <Text style={styles.headerSummary} numberOfLines={1}>
            {summary}
          </Text>
          <Text style={styles.toggleText}>{collapsed ? '展开' : '收起'}</Text>
        </View>
      </TouchableOpacity>

      {!collapsed ? (
        <>
          <View style={styles.summaryRow}>
            <View style={styles.summaryChip}>
              <Text style={styles.summaryValue}>{datedPhotoCount}</Text>
              <Text style={styles.summaryLabel}>有拍摄日期</Text>
            </View>
            <View style={styles.summaryChip}>
              <Text style={styles.summaryValue}>{undatedPhotoCount}</Text>
              <Text style={styles.summaryLabel}>未设置拍摄日期</Text>
            </View>
          </View>

          <View style={styles.modeRow}>
            {GRANULARITY_OPTIONS.map((option) => {
              const active = option.value === granularity;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.modeButton, active && styles.modeButtonActive]}
                  activeOpacity={0.75}
                  onPress={() => onGranularityChange(option.value)}
                >
                  <Text style={[styles.modeText, active && styles.modeTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading && buckets.length === 0 ? (
            <Text style={styles.hint}>加载中...</Text>
          ) : null}

          {!loading && buckets.length === 0 ? (
            <Text style={styles.hint}>暂无可统计的拍摄日期数据</Text>
          ) : null}

          {buckets.map((bucket) => (
            <View key={bucket.key} style={styles.bucketRow}>
              <View style={styles.bucketHeader}>
                <Text style={styles.bucketLabel}>{bucket.label}</Text>
                <Text style={styles.bucketCount}>{bucket.photoCount}</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.max(2, (bucket.photoCount / maxCount) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          ))}

          {buckets.length > 0 ? (
            <Text style={styles.meta}>
              已加载 {buckets.length} / {totalBuckets} 个时间桶
            </Text>
          ) : null}

          {hasMore ? (
            <Button
              title="加载更多"
              variant="outline"
              loading={loadingMore}
              onPress={onLoadMore}
              style={styles.moreButton}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    paddingRight: 12,
    flexShrink: 1,
  },
  headerMeta: {
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: '60%',
  },
  headerSummary: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  toggleText: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  summaryChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    alignItems: 'center',
  },
  summaryValue: {
    color: '#111827',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  summaryLabel: {
    marginTop: 2,
    color: '#6b7280',
    fontSize: 11,
    lineHeight: 13,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  modeButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  modeText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#1d4ed8',
  },
  hint: {
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 12,
    fontSize: 13,
  },
  bucketRow: {
    marginBottom: 10,
  },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  bucketLabel: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
  },
  bucketCount: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  barTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  meta: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  moreButton: {
    marginTop: 4,
  },
});

