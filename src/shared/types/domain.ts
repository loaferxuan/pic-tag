/**
 * Domain models used by services and UI.
 */

import type { QueryOptions } from './common';

export type FingerprintStatus = 'not_requested' | 'pending' | 'ready' | 'failed';
export type FingerprintAlgorithm = 'md5' | 'sha256';
export type SourceProvider = 'image_picker' | 'camera' | 'media_library' | 'media_library_backfill' | 'unknown';

export interface Photo {
  id: number;
  uri: string;
  filename: string;
  width: number;
  height: number;
  fileSize: number;
  takenDate: string | null;
  importedAt: string;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  sourceAssetId: string | null;
  sourceProvider: SourceProvider;
  mimeType: string | null;
  fingerprintStatus: FingerprintStatus;
  fingerprintMd5: string | null;
  fingerprintSha256: string | null;
  fingerprintAlgo: FingerprintAlgorithm | null;
  fingerprintVersion: number;
  fingerprintUpdatedAt: string | null;
  fingerprintError: string | null;
  tagIds?: number[];
}

export interface TagCategory {
  id: number;
  externalId: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  tags?: Tag[];
}

export interface Tag {
  id: number;
  externalId: string;
  name: string;
  color: string;
  icon: string | null;
  categoryId: number | null;
  sortOrder: number;
  createdAt: string;
  category?: TagCategory | null;
}

export interface SearchFilters {
  tagIds?: number[];
  tagMatchMode?: 'AND' | 'OR';
  onlyUntagged?: boolean;
  missingCategoryId?: number;
  dateFrom?: string;
  dateTo?: string;
  onlyUnresolvedAssociation?: boolean;
}

export interface PhotoQueryOptions extends QueryOptions {
  filters?: SearchFilters;
}

export interface TagUsageStat {
  tagId: number;
  tagName: string;
  count: number;
}

export interface CategoryStat {
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  tagCount: number;
  coveragePhotoCount: number;
  coverageRate: number;
  assignmentCount: number;
}

export interface CategoryTagStat {
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  tagId: number;
  tagName: string;
  tagColor: string;
  photoCount: number;
  categoryShare: number;
  globalShare: number;
}

export interface StatsSummary {
  totalPhotos: number;
  untaggedCount: number;
  unresolvedAssociationCount: number;
  categoryStats: CategoryStat[];
  categoryTagStats: CategoryTagStat[];
}

export type TimeStatsGranularity = 'year' | 'month' | 'day';

export interface TimeStatsBucket {
  key: string;
  label: string;
  photoCount: number;
}

export interface TakenDateStatsPage {
  granularity: TimeStatsGranularity;
  buckets: TimeStatsBucket[];
  totalBuckets: number;
  loadedBuckets: number;
  hasMore: boolean;
  undatedPhotoCount: number;
  datedPhotoCount: number;
}
