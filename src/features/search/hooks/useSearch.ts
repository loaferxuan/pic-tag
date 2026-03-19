import { useCallback, useEffect, useState } from 'react';
import { countSearchPhotos, searchPhotos } from '@/features/search/services/search.service';
import { SEARCH_PHOTO_PAGE_SIZE } from '@/shared/constants';
import { toStoredDate } from '@/shared/utils/format';
import type { Photo, SearchFilters } from '@/shared/types/domain';

function normalizeTagIds(tagIds: number[]): number[] {
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const tagId of tagIds) {
    if (!Number.isInteger(tagId) || tagId <= 0 || seen.has(tagId)) continue;
    seen.add(tagId);
    normalized.push(tagId);
  }
  return normalized;
}

function dedupePhotosById(photos: Photo[]): Photo[] {
  const deduped = new Map<number, Photo>();
  for (const photo of photos) {
    deduped.set(photo.id, photo);
  }
  return Array.from(deduped.values());
}

export function buildSearchFilters(params: {
  selectedTagIds: number[];
  tagMatchMode: 'AND' | 'OR';
  onlyUntagged: boolean;
  missingCategoryId: number | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  onlyUnresolvedAssociation: boolean;
}): SearchFilters {
  const normalizedTagIds = normalizeTagIds(params.selectedTagIds);
  const filters: SearchFilters = {};

  if (params.onlyUntagged) {
    filters.onlyUntagged = true;
  } else if (normalizedTagIds.length > 0) {
    filters.tagIds = normalizedTagIds;
    filters.tagMatchMode = params.tagMatchMode;
  }
  if (params.missingCategoryId != null && Number.isInteger(params.missingCategoryId) && params.missingCategoryId > 0) {
    filters.missingCategoryId = params.missingCategoryId;
  }
  if (params.dateFrom) {
    filters.dateFrom = toStoredDate(params.dateFrom);
  }
  if (params.dateTo) {
    filters.dateTo = toStoredDate(params.dateTo);
  }
  if (params.onlyUnresolvedAssociation) {
    filters.onlyUnresolvedAssociation = true;
  }
  return filters;
}

export function useSearch() {
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagMatchMode, setTagMatchMode] = useState<'AND' | 'OR'>('AND');
  const [onlyUntagged, setOnlyUntagged] = useState(false);
  const [missingCategoryId, setMissingCategoryId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [onlyUnresolvedAssociation, setOnlyUnresolvedAssociation] = useState(false);
  const [results, setResults] = useState<Photo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>({});

  const executeSearch = useCallback(async (filters: SearchFilters) => {
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    try {
      const [photos, count] = await Promise.all([
        searchPhotos(filters, {
          orderBy: 'taken_date',
          orderDir: 'DESC',
          limit: SEARCH_PHOTO_PAGE_SIZE,
          offset: 0,
        }),
        countSearchPhotos(filters),
      ]);
      setResults(photos);
      setTotalCount(count);
      setHasMore(photos.length < count);
      setAppliedFilters(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : '搜索失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  const runSearch = useCallback(async () => {
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      setError('开始日期不能晚于结束日期。');
      return;
    }

    const filters = buildSearchFilters({
      selectedTagIds,
      tagMatchMode,
      onlyUntagged,
      missingCategoryId,
      dateFrom,
      dateTo,
      onlyUnresolvedAssociation,
    });

    await executeSearch(filters);
  }, [
    dateFrom,
    dateTo,
    executeSearch,
    missingCategoryId,
    onlyUntagged,
    onlyUnresolvedAssociation,
    selectedTagIds,
    tagMatchMode,
  ]);

  const resetSearch = useCallback(async () => {
    setSelectedTagIds([]);
    setTagMatchMode('AND');
    setOnlyUntagged(false);
    setMissingCategoryId(null);
    setDateFrom(null);
    setDateTo(null);
    setOnlyUnresolvedAssociation(false);
    await executeSearch({});
  }, [executeSearch]);

  const applyUnresolvedAssociationPreset = useCallback(async () => {
    setSelectedTagIds([]);
    setTagMatchMode('AND');
    setOnlyUntagged(false);
    setMissingCategoryId(null);
    setDateFrom(null);
    setDateTo(null);
    setOnlyUnresolvedAssociation(true);
    await executeSearch({ onlyUnresolvedAssociation: true });
  }, [executeSearch]);

  const applyUntaggedPreset = useCallback(async () => {
    setSelectedTagIds([]);
    setTagMatchMode('AND');
    setOnlyUntagged(true);
    setMissingCategoryId(null);
    setDateFrom(null);
    setDateTo(null);
    setOnlyUnresolvedAssociation(false);
    await executeSearch({ onlyUntagged: true });
  }, [executeSearch]);

  const clearUnresolvedAssociationFilter = useCallback(async () => {
    setOnlyUnresolvedAssociation(false);
    const filters = buildSearchFilters({
      selectedTagIds,
      tagMatchMode,
      onlyUntagged,
      missingCategoryId,
      dateFrom,
      dateTo,
      onlyUnresolvedAssociation: false,
    });
    await executeSearch(filters);
  }, [dateFrom, dateTo, executeSearch, missingCategoryId, onlyUntagged, selectedTagIds, tagMatchMode]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;

    setLoadingMore(true);
    setError(null);
    try {
      const incoming = await searchPhotos(appliedFilters, {
        orderBy: 'taken_date',
        orderDir: 'DESC',
        limit: SEARCH_PHOTO_PAGE_SIZE,
        offset: results.length,
      });
      const merged = dedupePhotosById([...results, ...incoming]);
      setResults(merged);
      setHasMore(merged.length < totalCount && incoming.length > 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '搜索失败，请重试。');
    } finally {
      setLoadingMore(false);
    }
  }, [appliedFilters, hasMore, loading, loadingMore, results, totalCount]);

  const toggleTag = useCallback((tagId: number) => {
    if (onlyUntagged) return;
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }
      return [...prev, tagId];
    });
  }, [onlyUntagged]);

  const removeTag = useCallback((tagId: number) => {
    if (onlyUntagged) return;
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
  }, [onlyUntagged]);

  const handleOnlyUntaggedChange = useCallback((value: boolean) => {
    setOnlyUntagged(value);
    if (value) {
      setSelectedTagIds([]);
    }
  }, []);

  useEffect(() => {
    void executeSearch({});
  }, [executeSearch]);

  return {
    selectedTagIds,
    tagMatchMode,
    setTagMatchMode,
    onlyUntagged,
    setOnlyUntagged: handleOnlyUntaggedChange,
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
  };
}
