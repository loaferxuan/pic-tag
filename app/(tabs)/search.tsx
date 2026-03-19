import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { countSearchPhotos } from '@/features/search/services/search.service';
import { useSearch } from '@/features/search/hooks/useSearch';
import { usePhotoDetailStore } from '@/features/photo/store/photo-detail.store';
import { useTagsWithCategories } from '@/features/tag/hooks/useTags';
import { PhotoGrid } from '@/features/photo/components/PhotoGrid';
import {
  SearchFilterHeader,
  type SearchFilterPanelKey,
} from '@/features/search/components/SearchFilterHeader';
import { formatDate } from '@/shared/utils/format';
import { UNCATEGORIZED_TAG_CATEGORY_ID } from '@/shared/constants';
import type { Photo, Tag } from '@/shared/types/domain';
import { useColorScheme } from '@/shared/hooks/useColorScheme';
import Colors from '@/shared/theme/Colors';
import {
  mergeTagCategoryCollapsedState,
  type TagCategoryCollapsedState,
  type TagCategoryVisibilitySnapshot,
} from '@/shared/utils/tag-category-collapse';

const createDefaultCollapsedFilterPanels = (): Record<SearchFilterPanelKey, boolean> => ({
  tagMatchMode: true,
  tagStatus: true,
  missingCategory: true,
});

export default function SearchScreen() {
  const router = useRouter();
  const primePhoto = usePhotoDetailStore((s) => s.primePhoto);
  const hasPrefetchedDetailRouteRef = useRef(false);
  const { preset } = useLocalSearchParams<{ preset?: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const {
    tags,
    categories,
    tagsByCategory,
    loading: tagsLoading,
    error: tagsError,
  } = useTagsWithCategories();
  const {
    selectedTagIds,
    tagMatchMode,
    setTagMatchMode,
    onlyUntagged,
    setOnlyUntagged,
    missingCategoryId,
    setMissingCategoryId,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    onlyUnresolvedAssociation,
    setOnlyUnresolvedAssociation,
    results,
    totalCount,
    loading,
    loadingMore,
    hasMore,
    error,
    toggleTag,
    removeTag,
    runSearch,
    resetSearch,
    loadMore,
    applyUnresolvedAssociationPreset,
    applyUntaggedPreset,
    clearUnresolvedAssociationFilter,
  } = useSearch();

  const [activeDateField, setActiveDateField] = useState<'from' | 'to' | null>(null);
  const [unresolvedAssociationCount, setUnresolvedAssociationCount] = useState<number | null>(null);
  const [collapsedFilterPanels, setCollapsedFilterPanels] = useState<Record<SearchFilterPanelKey, boolean>>(
    () => createDefaultCollapsedFilterPanels()
  );
  const [collapsedCategories, setCollapsedCategories] = useState<TagCategoryCollapsedState>({});
  const categorySnapshotsRef = useRef<TagCategoryVisibilitySnapshot[]>([]);
  const hasUnresolvedAssociation = (unresolvedAssociationCount ?? 0) > 0;

  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const selectedTags = useMemo(
    () => selectedTagIds.map((tagId) => tagMap.get(tagId)).filter(Boolean) as Tag[],
    [selectedTagIds, tagMap]
  );
  const categoryGroups = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        tags: (tagsByCategory.get(category.id) ?? []) as Tag[],
      }))
      .filter((group) => group.tags.length > 0);
  }, [categories, tagsByCategory]);
  const missingCategoryOptions = useMemo(
    () => categoryGroups.map(({ category }) => category),
    [categoryGroups]
  );
  const uncategorizedTags = useMemo(
    () => (tagsByCategory.get(UNCATEGORIZED_TAG_CATEGORY_ID) ?? []) as Tag[],
    [tagsByCategory]
  );
  const categorySnapshots = useMemo(
    () => [
      ...categoryGroups.map(({ category, tags: groupTags }) => ({
        categoryId: category.id,
        tagCount: groupTags.length,
      })),
      ...(uncategorizedTags.length > 0
        ? [{ categoryId: UNCATEGORIZED_TAG_CATEGORY_ID, tagCount: uncategorizedTags.length }]
        : []),
    ],
    [categoryGroups, uncategorizedTags]
  );

  useEffect(() => {
    categorySnapshotsRef.current = categorySnapshots;
  }, [categorySnapshots]);

  useEffect(() => {
    setCollapsedCategories((prev) => mergeTagCategoryCollapsedState(prev, categorySnapshots));
  }, [categorySnapshots]);

  useEffect(() => {
    if (missingCategoryId == null) return;
    if (missingCategoryOptions.some((category) => category.id === missingCategoryId)) return;
    setMissingCategoryId(null);
  }, [missingCategoryId, missingCategoryOptions, setMissingCategoryId]);

  const refreshUnresolvedAssociationCount = useCallback(async () => {
    try {
      const count = await countSearchPhotos({ onlyUnresolvedAssociation: true });
      setUnresolvedAssociationCount(count);
      if (count === 0 && onlyUnresolvedAssociation) {
        await clearUnresolvedAssociationFilter();
      }
    } catch {
      setUnresolvedAssociationCount(0);
      if (onlyUnresolvedAssociation) {
        await clearUnresolvedAssociationFilter();
      }
    }
  }, [clearUnresolvedAssociationFilter, onlyUnresolvedAssociation]);

  useFocusEffect(
    useCallback(() => {
      setCollapsedFilterPanels(createDefaultCollapsedFilterPanels());
      setCollapsedCategories(mergeTagCategoryCollapsedState({}, categorySnapshotsRef.current));
      void refreshUnresolvedAssociationCount();
    }, [refreshUnresolvedAssociationCount])
  );

  useEffect(() => {
    if (preset !== 'unresolved_not_found') return;
    if (unresolvedAssociationCount == null) return;
    void (async () => {
      if (unresolvedAssociationCount > 0) {
        await applyUnresolvedAssociationPreset();
      }
      router.replace('/search');
    })();
  }, [applyUnresolvedAssociationPreset, preset, router, unresolvedAssociationCount]);

  useEffect(() => {
    if (preset !== 'untagged') return;
    void (async () => {
      await applyUntaggedPreset();
      router.replace('/search');
    })();
  }, [applyUntaggedPreset, preset, router]);

  useEffect(() => {
    if (hasPrefetchedDetailRouteRef.current || results.length === 0) return;
    hasPrefetchedDetailRouteRef.current = true;
    router.prefetch(`/photo/${results[0].id}`);
  }, [results, router]);

  const fromLabel = dateFrom ? formatDate(dateFrom.toISOString(), 'yyyy-MM-dd') : '开始日期';
  const toLabel = dateTo ? formatDate(dateTo.toISOString(), 'yyyy-MM-dd') : '结束日期';

  const handleOpenDatePicker = useCallback((field: 'from' | 'to') => {
    setActiveDateField((prev) => (prev === field ? null : field));
  }, []);

  const handleDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (!activeDateField) return;
      if (Platform.OS === 'android') {
        setActiveDateField(null);
      }
      if (event.type === 'dismissed' || !selectedDate) return;

      const normalized = new Date(selectedDate);
      normalized.setHours(0, 0, 0, 0);
      if (activeDateField === 'from') {
        setDateFrom(normalized);
        if (!dateTo) {
          setDateTo(normalized);
        }
        return;
      }
      setDateTo(normalized);
      if (!dateFrom) {
        setDateFrom(normalized);
      }
    },
    [activeDateField, dateFrom, dateTo, setDateFrom, setDateTo]
  );

  const clearDateRange = useCallback(() => {
    setDateFrom(null);
    setDateTo(null);
    setActiveDateField(null);
  }, [setDateFrom, setDateTo]);

  const handleMissingCategoryPress = useCallback(
    (categoryId: number | null) => {
      if (categoryId == null) {
        setMissingCategoryId(null);
        return;
      }
      setMissingCategoryId((prev) => (prev === categoryId ? null : categoryId));
    },
    [setMissingCategoryId]
  );

  const handleOnlyUnresolvedAssociationChange = useCallback(
    (value: boolean) => {
      setOnlyUnresolvedAssociation(value);
    },
    [setOnlyUnresolvedAssociation]
  );

  const handleOnlyUntaggedChange = useCallback(
    (value: boolean) => {
      setOnlyUntagged(value);
    },
    [setOnlyUntagged]
  );

  const handleReset = useCallback(() => {
    void resetSearch();
  }, [resetSearch]);

  const handleRunSearch = useCallback(() => {
    void runSearch();
  }, [runSearch]);

  const handleToggleCategoryCollapsed = useCallback((categoryId: number) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryId]: !(prev[categoryId] ?? false),
    }));
  }, []);

  const handleToggleFilterPanelCollapsed = useCallback((panel: SearchFilterPanelKey) => {
    setCollapsedFilterPanels((prev) => ({
      ...prev,
      [panel]: !prev[panel],
    }));
  }, []);

  const handlePhotoPress = useCallback(
    (photo: Photo) => {
      primePhoto(photo);
      router.push(`/photo/${photo.id}`);
    },
    [primePhoto, router]
  );

  const handleEndReached = useCallback(() => {
    if (!hasMore) return;
    void loadMore();
  }, [hasMore, loadMore]);

  const header = useMemo(
    () => (
      <SearchFilterHeader
        colors={colors}
        tagMatchMode={tagMatchMode}
        onTagMatchModeChange={setTagMatchMode}
        onlyUntagged={onlyUntagged}
        onOnlyUntaggedChange={handleOnlyUntaggedChange}
        missingCategoryId={missingCategoryId}
        missingCategoryOptions={missingCategoryOptions}
        onMissingCategoryPress={handleMissingCategoryPress}
        hasUnresolvedAssociation={hasUnresolvedAssociation}
        onlyUnresolvedAssociation={onlyUnresolvedAssociation}
        onOnlyUnresolvedAssociationChange={handleOnlyUnresolvedAssociationChange}
        fromLabel={fromLabel}
        toLabel={toLabel}
        activeDateField={activeDateField}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onOpenDatePicker={handleOpenDatePicker}
        onDateChange={handleDateChange}
        onClearDateRange={clearDateRange}
        onReset={handleReset}
        onSearch={handleRunSearch}
        loading={loading}
        totalCount={totalCount}
        loadedCount={results.length}
        error={error}
        selectedTagIds={selectedTagIds}
        selectedTags={selectedTags}
        onRemoveTag={removeTag}
        tagsError={tagsError}
        tagsLoading={tagsLoading}
        tags={tags}
        categoryGroups={categoryGroups}
        uncategorizedTags={uncategorizedTags}
        onToggleTag={toggleTag}
        tagSelectionDisabled={onlyUntagged}
        tagSelectionDisabledHint={onlyUntagged ? '未打标签筛选开启时不能同时按标签筛选。' : null}
        collapsedFilterPanels={collapsedFilterPanels}
        onToggleFilterPanelCollapsed={handleToggleFilterPanelCollapsed}
        collapsedCategories={collapsedCategories}
        onToggleCategoryCollapsed={handleToggleCategoryCollapsed}
      />
    ),
    [
      activeDateField,
      categoryGroups,
      clearDateRange,
      colors,
      dateFrom,
      dateTo,
      error,
      fromLabel,
      handleDateChange,
      handleMissingCategoryPress,
      handleOnlyUntaggedChange,
      handleOnlyUnresolvedAssociationChange,
      handleOpenDatePicker,
      handleReset,
      handleRunSearch,
      hasUnresolvedAssociation,
      loading,
      missingCategoryId,
      missingCategoryOptions,
      onlyUntagged,
      onlyUnresolvedAssociation,
      collapsedFilterPanels,
      removeTag,
      results.length,
      collapsedCategories,
      selectedTagIds,
      selectedTags,
      setTagMatchMode,
      tagMatchMode,
      tags,
      handleToggleFilterPanelCollapsed,
      handleToggleCategoryCollapsed,
      tagsError,
      tagsLoading,
      toggleTag,
      toLabel,
      totalCount,
      uncategorizedTags,
    ]
  );

  const emptyComponent = useMemo(
    () =>
      !loading ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>没有匹配结果，请调整筛选条件后重试。</Text>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>搜索中...</Text>
        </View>
      ),
    [colors.textSecondary, loading]
  );

  const footerComponent = useMemo(
    () =>
      loadingMore ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>加载更多中...</Text>
        </View>
      ) : null,
    [colors.textSecondary, loadingMore]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PhotoGrid
        photos={results}
        onPhotoPress={handlePhotoPress}
        onEndReached={handleEndReached}
        ListHeaderComponent={header}
        ListEmptyComponent={emptyComponent}
        ListFooterComponent={footerComponent}
        showTags
        performancePreset="aggressive"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    paddingVertical: 64,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
});
