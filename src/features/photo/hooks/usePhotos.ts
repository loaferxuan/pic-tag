import { useCallback, useEffect, useMemo, useState } from 'react';
import { HOME_PHOTO_PAGE_SIZE } from '@/shared/constants';
import { usePhotoStore } from '@/features/photo/store/photo.store';
import { usePhotoDetailStore } from '@/features/photo/store/photo-detail.store';
import { useUIStore } from '@/features/search/store/ui.store';
import type { PhotoQueryOptions } from '@/shared/types/domain';

export function usePhotos(options?: PhotoQueryOptions) {
  const {
    photos,
    loading,
    error,
    loadPhotos,
    loadMorePhotos,
    setQueryOptions,
    queryOptions,
  } = usePhotoStore();
  const { searchFilters, sortField, sortDir } = useUIStore();
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageSize = options?.limit ?? HOME_PHOTO_PAGE_SIZE;

  const baseOptions = useMemo<PhotoQueryOptions>(
    () => ({
      filters: options?.filters ?? (Object.keys(searchFilters).length ? searchFilters : undefined),
      orderBy: options?.orderBy ?? sortField,
      orderDir: options?.orderDir ?? sortDir,
    }),
    [options?.filters, options?.orderBy, options?.orderDir, searchFilters, sortField, sortDir]
  );

  const refresh = useCallback(async () => {
    const nextOptions: PhotoQueryOptions = {
      ...baseOptions,
      limit: pageSize,
      offset: 0,
    };
    setLoadingMore(false);
    setQueryOptions(nextOptions);
    const nextPhotos = await loadPhotos(nextOptions);
    setHasMore(nextPhotos.length === pageSize);
  }, [baseOptions, loadPhotos, pageSize, setQueryOptions]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const nextOptions: PhotoQueryOptions = {
        ...baseOptions,
        limit: pageSize,
        offset: photos.length,
      };
      const incoming = await loadMorePhotos(nextOptions);
      setHasMore(incoming.length === pageSize);
    } finally {
      setLoadingMore(false);
    }
  }, [
    baseOptions,
    hasMore,
    loadMorePhotos,
    loading,
    loadingMore,
    pageSize,
    photos.length,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    photos,
    loading,
    loadingMore,
    hasMore,
    error,
    loadPhotos,
    loadMore,
    refresh,
    queryOptions: queryOptions ?? { orderBy: sortField, orderDir: sortDir },
  };
}

export function usePhoto(id: number | null) {
  const currentPhoto = usePhotoDetailStore((s) => s.currentPhoto);
  const loading = usePhotoDetailStore((s) => s.loading);
  const error = usePhotoDetailStore((s) => s.error);
  const loadPhoto = usePhotoDetailStore((s) => s.loadPhoto);
  const clearCurrent = usePhotoDetailStore((s) => s.clearCurrent);

  useEffect(() => {
    if (id != null) loadPhoto(id);
    else clearCurrent();
  }, [clearCurrent, id, loadPhoto]);

  return { photo: currentPhoto, loading, error, reload: () => id != null && loadPhoto(id) };
}
