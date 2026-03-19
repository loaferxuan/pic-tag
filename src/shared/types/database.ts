/**
 * SQLite row models that map to database columns.
 */

export type PhotoFingerprintStatus = 'not_requested' | 'pending' | 'ready' | 'failed';
export type PhotoFingerprintAlgorithm = 'md5' | 'sha256';
export type PhotoSourceProvider = 'image_picker' | 'camera' | 'media_library' | 'media_library_backfill' | 'unknown';

export interface PhotoRow {
  id: number;
  uri: string;
  filename: string;
  width: number;
  height: number;
  file_size: number;
  captured_at_unix_sec: number | null;
  taken_date: string | null;
  imported_at: string;
  metadata_json: string | null;
  notes: string | null;
  source_asset_id: string | null;
  source_provider: PhotoSourceProvider;
  mime_type: string | null;
  fingerprint_status: PhotoFingerprintStatus;
  fingerprint_md5: string | null;
  fingerprint_sha256: string | null;
  fingerprint_algo: PhotoFingerprintAlgorithm | null;
  fingerprint_version: number;
  fingerprint_updated_at: string | null;
  fingerprint_error: string | null;
}

export interface TagCategoryRow {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  external_id: string | null;
}

export interface TagRow {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  category_id: number | null;
  sort_order: number;
  created_at: string;
  external_id: string | null;
}

export interface PhotoTagRow {
  photo_id: number;
  tag_id: number;
  tagged_at: string;
}

export interface PhotoDefaultTagPendingRow {
  photo_id: number;
  snapshot_tag_ids_json: string;
  created_at: string;
}

export type ImportPendingReason = 'NOT_FOUND' | 'AMBIGUOUS' | 'MISSING_TAGS';

export interface ImportPendingPhotoTagLinkRow {
  id: number;
  photo_id: number | null;
  fingerprint_md5: string | null;
  file_size: number;
  source_asset_id: string | null;
  taken_date: string | null;
  tag_external_ids_json: string;
  notes: string | null;
  reason: ImportPendingReason;
  created_at: string;
  last_attempt_at: string | null;
  resolved_at: string | null;
}

export interface KvStoreRow {
  key: string;
  value: string;
  updated_at: string;
}
