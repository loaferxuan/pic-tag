import { getPhotoCount, getPhotos } from '@/features/photo/services/photo.service';
import type { SearchFilters } from '@/shared/types/domain';
import type { PhotoQueryOptions } from '@/shared/types/domain';
import type { Photo } from '@/shared/types/domain';

function normalizeFilters(filters: SearchFilters): SearchFilters {
  return {
    ...filters,
    tagMatchMode: filters.tagMatchMode ?? 'AND',
  };
}

export function searchPhotos(
  filters: SearchFilters,
  options?: Omit<PhotoQueryOptions, 'filters'>
): Promise<Photo[]> {
  return getPhotos({
    ...options,
    filters: normalizeFilters(filters),
  });
}

export function countSearchPhotos(filters: SearchFilters): Promise<number> {
  return getPhotoCount({
    filters: normalizeFilters(filters),
  });
}
