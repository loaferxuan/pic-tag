import type { ImportPendingReason } from './database';

export interface BackupCategory {
  externalId: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface BackupTag {
  externalId: string;
  name: string;
  color: string;
  icon: string | null;
  categoryExternalId: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface BackupPhotoTagLink {
  fingerprintMd5: string | null;
  fileSize: number;
  sourceAssetId: string | null;
  takenDate: string | null;
  filename: string;
  tagExternalIds: string[];
  notes?: string | null;
}

export interface BackupPayload {
  exportId: string;
  categories: BackupCategory[];
  tags: BackupTag[];
  settings: {
    defaultTagExternalIds: string[];
  };
  photoTagLinks: BackupPhotoTagLink[];
  stats: {
    categoryCount: number;
    tagCount: number;
    linkCount: number;
    generatedAt: string;
  };
}

export interface BackupEnvelope {
  format: 'pictag-data';
  formatVersion: string;
  createdAt: string;
  appSchemaVersion: number;
  checksumAlgorithm: 'sha256';
  payloadSha256: string;
  payload: BackupPayload;
}

export interface ExportSummary {
  categoryCount: number;
  tagCount: number;
  defaultTagCount: number;
  photoLinkCount: number;
  payloadSha256: string;
}

export interface BackfillSummary {
  attempted: boolean;
  bySourceMatched: number;
  byFingerprintMatched: number;
  createdPhotos: number;
  skippedNoPermission: number;
  remainingPending: number;
  scannedAssets: number;
}

export type ImportProgressStage =
  | 'reading_backup'
  | 'validating_backup'
  | 'rebuilding_placeholders'
  | 'auto_backfill_fingerprint'
  | 'finalizing';

export interface ImportProgressSnapshot {
  stage: ImportProgressStage;
  completed: number;
  total: number | null;
  percent: number | null;
  etaSeconds: number | null;
  etaUpperBoundSeconds: number | null;
  etaModel: 'scan' | 'hybrid';
  matched: number;
  remainingPending: number | null;
  scanTotalAssets: number | null;
  scanScannedAssets: number | null;
  scanStageMatched: number;
  totalMatched: number;
}

export interface ImportSummary {
  addedCategories: number;
  mergedCategories: number;
  mergedCategoriesByExternalId: number;
  mergedCategoriesByName: number;
  ambiguousCategoryNameCount: number;
  renamedCategories: number;
  addedTags: number;
  mergedTags: number;
  mergedTagsByExternalId: number;
  mergedTagsByName: number;
  ambiguousTagNameCount: number;
  renamedTags: number;
  overriddenDefaultTags: number;
  processedPhotoLinks: number;
  matchedPhotoLinks: number;
  placeholderPhotos: number;
  pendingPhotoLinks: number;
  autoBackfillAttempted: boolean;
  autoBackfillBySourceMatched: number;
  autoBackfillByFingerprintMatched: number;
  autoBackfillCreatedPhotos: number;
  autoBackfillSkippedNoPermission: number;
  pendingReasons: Record<ImportPendingReason, number>;
  renamedCategorySamples: Array<{ from: string; to: string }>;
  renamedTagSamples: Array<{ from: string; to: string }>;
  pendingSamples: Array<{
    reason: ImportPendingReason;
    photoId: number | null;
    fingerprintMd5: string | null;
    sourceAssetId: string | null;
  }>;
}
