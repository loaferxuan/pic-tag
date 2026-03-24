import { getRepositories } from '@/infra/db';
import { getInfoAsync } from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import type { PhotoRow } from '@/shared/types/database';
import type { Photo, PhotoQueryOptions, SourceProvider } from '@/shared/types/domain';
import { readCapturedAtUnixSecFromUri } from '@/features/photo/services/photo-exif-reader.service';
import { getFileNameFromUri } from '@/shared/utils/image';
import { normalizeEditableNotes, validateNotesLength } from '@/shared/utils/photo-notes';
import { getSanitizedDefaultTagIds } from '@/features/tag/services/default-tag.service';
import { buildPhotoFingerprintV2Md5, PHOTO_FINGERPRINT_VERSION } from '@/features/photo/services/photo-fingerprint-v2.service';
import { enqueueFingerprint } from './photo-fingerprint.service';
import { resolvePendingForPhoto } from '@/features/photo/services/import-pending-resolver.service';

export interface PhotoImportOptions {
  width?: number;
  height?: number;
  fileSize?: number;
  capturedAtUnixSec?: number | null;
  takenDate?: string;
  fileName?: string;
  mimeType?: string;
  assetId?: string | null;
  sourceProvider?: SourceProvider;
}

export type PhotoImportItem = PhotoImportOptions & {
  uri: string;
};

export interface BackfillPhotoCreateOptions {
  uri: string;
  width?: number;
  height?: number;
  fileSize?: number;
  capturedAtUnixSec?: number | null;
  takenDate?: string | null;
  fileName?: string;
  mimeType?: string | null;
  sourceAssetId?: string | null;
  sourceProvider?: SourceProvider;
  fingerprintMd5?: string | null;
}

type FileInfoLike = {
  exists: boolean;
  size?: number | null;
};

type ResolvedMediaReference = {
  uri: string;
  width?: number;
  height?: number;
  fileSize?: number;
  capturedAtUnixSec?: number | null;
};

type DuplicateMatchReason = 'source_asset_id' | 'md5' | 'uri';

type DuplicateMatch = {
  photo: PhotoRow;
  reason: DuplicateMatchReason;
  incomingMd5: string | null;
  lookupFileSize: number | undefined;
};

type DuplicateFingerprintLookup = {
  capturedAtUnixSec: number | null;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
};

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[key];
  return normalizeNonEmptyString(typeof raw === 'string' ? raw : null);
}

function readNumberField(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function buildUriCandidates(baseUri: string, assetInfo: unknown): string[] {
  const seen = new Set<string>();
  const candidates = [
    readStringField(assetInfo, 'localUri'),
    readStringField(assetInfo, 'uri'),
    normalizeNonEmptyString(baseUri),
  ];
  const result: string[] = [];
  for (const uri of candidates) {
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    result.push(uri);
  }
  return result;
}

async function getExistingUriInfo(
  uriCandidates: string[]
): Promise<{ uri: string; info: FileInfoLike } | null> {
  for (const uri of uriCandidates) {
    try {
      const info = (await getInfoAsync(uri)) as FileInfoLike;
      if (info.exists) {
        return { uri, info };
      }
    } catch {
      // Try next URI candidate.
    }
  }
  return null;
}

function resolveDimension(preferred: number | undefined, fallback: number | undefined): number {
  if (typeof preferred === 'number' && Number.isFinite(preferred) && preferred > 0) return preferred;
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) return fallback;
  return 0;
}

function resolveFileSize(preferred: number | undefined, fallback: number | undefined): number {
  if (typeof preferred === 'number' && Number.isFinite(preferred) && preferred > 0) {
    return Math.floor(preferred);
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) {
    return Math.floor(fallback);
  }
  return 0;
}

function normalizeCapturedAtUnixSec(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function resolveCapturedAtUnixSec(
  preferred: number | null | undefined,
  fallback: number | null | undefined
): number | null {
  return normalizeCapturedAtUnixSec(preferred) ?? normalizeCapturedAtUnixSec(fallback);
}

function resolveLookupFileSize(fileSize: number): number | undefined {
  return Number.isFinite(fileSize) && fileSize > 0 ? Math.floor(fileSize) : undefined;
}

async function findDuplicateForImport(
  repos: Awaited<ReturnType<typeof getRepositories>>,
  persistedUri: string,
  sourceAssetId: string | null,
  fingerprintLookup: DuplicateFingerprintLookup
): Promise<DuplicateMatch | null> {
  const lookupFileSize = resolveLookupFileSize(fingerprintLookup.fileSize);
  let incomingMd5: string | null = null;

  if (sourceAssetId) {
    const bySourceAsset = await repos.photo.findBySourceAssetId(sourceAssetId, lookupFileSize);
    if (bySourceAsset.length > 0) {
      return {
        photo: bySourceAsset[0],
        reason: 'source_asset_id',
        incomingMd5,
        lookupFileSize,
      };
    }
  }

  incomingMd5 = await buildPhotoFingerprintV2Md5({
    capturedAtUnixSec: fingerprintLookup.capturedAtUnixSec,
    fileName: fingerprintLookup.fileName,
    fileSize: fingerprintLookup.fileSize,
    width: fingerprintLookup.width,
    height: fingerprintLookup.height,
  });
  const byFingerprint = await repos.photo.findByFingerprint({
    md5: incomingMd5,
    fileSize: lookupFileSize,
  });
  if (byFingerprint.length > 0) {
    return {
      photo: byFingerprint[0],
      reason: 'md5',
      incomingMd5,
      lookupFileSize,
    };
  }

  const byUri = await repos.photo.findByUri(persistedUri, lookupFileSize);
  if (byUri.length > 0) {
    return {
      photo: byUri[0],
      reason: 'uri',
      incomingMd5,
      lookupFileSize,
    };
  }

  return null;
}

function logDuplicateImportDebug(
  match: DuplicateMatch,
  params: {
    sourceAssetId: string | null;
    uri: string;
  }
): void {
  if (!__DEV__) return;

  const payload = {
    reason: match.reason,
    incoming: {
      sourceAssetId: params.sourceAssetId,
      md5: match.incomingMd5,
      uri: params.uri,
      fileSize: match.lookupFileSize ?? null,
    },
    existing: {
      id: match.photo.id,
      sourceAssetId: match.photo.source_asset_id,
      md5: match.photo.fingerprint_md5,
      uri: match.photo.uri,
      fileSize: match.photo.file_size,
    },
  };

  console.info('[photo.import] duplicate skipped', JSON.stringify(payload));
}

async function resolveMediaReferenceFromAssetId(
  baseUri: string,
  assetId: string | null | undefined
): Promise<ResolvedMediaReference> {
  const normalizedAssetId = normalizeNonEmptyString(assetId);
  if (!normalizedAssetId) {
    return {
      uri: baseUri,
      capturedAtUnixSec: await readCapturedAtUnixSecFromUri(baseUri),
    };
  }

  let assetInfo: unknown = null;
  try {
    assetInfo = await MediaLibrary.getAssetInfoAsync(normalizedAssetId);
  } catch {
    return {
      uri: baseUri,
      capturedAtUnixSec: await readCapturedAtUnixSecFromUri(baseUri),
    };
  }

  const uriCandidates = buildUriCandidates(baseUri, assetInfo);
  const fileInfo = await getExistingUriInfo(uriCandidates);
  const resolvedUri = fileInfo?.uri ?? uriCandidates[0] ?? baseUri;
  const capturedAtUnixSec = await readCapturedAtUnixSecFromUri(resolvedUri);
  return {
    uri: resolvedUri,
    width: readNumberField(assetInfo, 'width'),
    height: readNumberField(assetInfo, 'height'),
    fileSize: typeof fileInfo?.info.size === 'number' ? fileInfo.info.size : undefined,
    capturedAtUnixSec,
  };
}

function rowToPhoto(r: PhotoRow, tagIds?: number[]): Photo {
  return {
    id: r.id,
    uri: r.uri,
    filename: r.filename,
    width: r.width,
    height: r.height,
    fileSize: r.file_size,
    takenDate: r.taken_date,
    importedAt: r.imported_at,
    metadata: r.metadata_json ? (JSON.parse(r.metadata_json) as Record<string, unknown>) : null,
    notes: r.notes,
    sourceAssetId: r.source_asset_id,
    sourceProvider: r.source_provider,
    mimeType: r.mime_type,
    fingerprintStatus: r.fingerprint_status,
    fingerprintMd5: r.fingerprint_md5,
    fingerprintSha256: r.fingerprint_sha256,
    fingerprintAlgo: r.fingerprint_algo,
    fingerprintVersion: r.fingerprint_version,
    fingerprintUpdatedAt: r.fingerprint_updated_at,
    fingerprintError: r.fingerprint_error,
    tagIds,
  };
}

export async function importPhoto(uri: string, options?: PhotoImportOptions): Promise<Photo | null> {
  const repos = await getRepositories();
  const normalizedAssetId = normalizeNonEmptyString(options?.assetId);
  const resolvedMedia = await resolveMediaReferenceFromAssetId(uri, normalizedAssetId);
  const persistedUri = resolvedMedia.uri;
  const resolvedWidth = resolveDimension(options?.width, resolvedMedia.width);
  const resolvedHeight = resolveDimension(options?.height, resolvedMedia.height);
  const resolvedFileSize = resolveFileSize(options?.fileSize, resolvedMedia.fileSize);
  const resolvedCapturedAtUnixSec = resolveCapturedAtUnixSec(
    options?.capturedAtUnixSec,
    resolvedMedia.capturedAtUnixSec
  );
  const filename = options?.fileName?.trim()
    ? options.fileName.trim()
    : getFileNameFromUri(persistedUri);
  const duplicateMatch = await findDuplicateForImport(
    repos,
    persistedUri,
    normalizedAssetId,
    {
      capturedAtUnixSec: resolvedCapturedAtUnixSec,
      fileName: filename,
      fileSize: resolvedFileSize,
      width: resolvedWidth,
      height: resolvedHeight,
    }
  );
  if (duplicateMatch) {
    logDuplicateImportDebug(duplicateMatch, {
      sourceAssetId: normalizedAssetId,
      uri: persistedUri,
    });
    return null;
  }
  const row = await repos.photo.create({
    uri: persistedUri,
    filename,
    width: resolvedWidth,
    height: resolvedHeight,
    file_size: resolvedFileSize,
    captured_at_unix_sec: resolvedCapturedAtUnixSec,
    taken_date: options?.takenDate ?? null,
    source_asset_id: normalizedAssetId,
    source_provider: options?.sourceProvider ?? 'unknown',
    mime_type: options?.mimeType ?? null,
    fingerprint_status: 'pending',
  });

  const defaultTagIds = await getSanitizedDefaultTagIds();
  await repos.photo.setPendingDefaultTags(row.id, defaultTagIds);

  enqueueFingerprint(row.id);
  void resolvePendingForPhoto(row.id);
  return rowToPhoto(row);
}

export async function createPhotoRecordForBackfill(options: BackfillPhotoCreateOptions): Promise<Photo> {
  const repos = await getRepositories();
  const filename = options.fileName?.trim() ? options.fileName.trim() : getFileNameFromUri(options.uri);
  const normalizedMd5 = options.fingerprintMd5?.trim().toLowerCase() ?? null;

  const row = await repos.photo.create({
    uri: options.uri,
    filename,
    width: options.width ?? 0,
    height: options.height ?? 0,
    file_size: options.fileSize ?? 0,
    captured_at_unix_sec: normalizeCapturedAtUnixSec(options.capturedAtUnixSec),
    taken_date: options.takenDate ?? null,
    source_asset_id: options.sourceAssetId ?? null,
    source_provider: options.sourceProvider ?? 'media_library_backfill',
    mime_type: options.mimeType ?? null,
    fingerprint_status: normalizedMd5 ? 'ready' : 'pending',
  });

  if (normalizedMd5) {
    await repos.photo.updateFingerprintState(row.id, {
      fingerprint_status: 'ready',
      fingerprint_md5: normalizedMd5,
      fingerprint_algo: 'md5',
      fingerprint_version: PHOTO_FINGERPRINT_VERSION,
      fingerprint_updated_at: new Date().toISOString(),
      fingerprint_error: null,
    });
  } else {
    enqueueFingerprint(row.id);
  }

  const fresh = await repos.photo.findById(row.id);
  return rowToPhoto(fresh ?? row);
}

export async function repairPhotoUriFromSourceAsset(photoId: number): Promise<Photo | null> {
  if (!Number.isInteger(photoId) || photoId <= 0) return null;

  const repos = await getRepositories();
  const row = await repos.photo.findById(photoId);
  if (!row) return null;

  const sourceAssetId = normalizeNonEmptyString(row.source_asset_id);
  if (!sourceAssetId) return null;

  const resolvedMedia = await resolveMediaReferenceFromAssetId(row.uri, sourceAssetId);
  const nextUri = normalizeNonEmptyString(resolvedMedia.uri);
  if (!nextUri) return null;

  const nextWidth = resolveDimension(resolvedMedia.width, row.width);
  const nextHeight = resolveDimension(resolvedMedia.height, row.height);
  const nextFileSize = resolveFileSize(resolvedMedia.fileSize, row.file_size);
  const nextCapturedAtUnixSec = resolveCapturedAtUnixSec(
    resolvedMedia.capturedAtUnixSec,
    row.captured_at_unix_sec
  );
  const nextFilename = row.filename.trim().length > 0 ? row.filename : getFileNameFromUri(nextUri);

  const unchanged =
    nextUri === row.uri &&
    nextWidth === row.width &&
    nextHeight === row.height &&
    nextFileSize === row.file_size &&
    nextCapturedAtUnixSec === row.captured_at_unix_sec &&
    nextFilename === row.filename;
  if (unchanged) return null;

  const updatedRow = await repos.photo.updateMediaReference(row.id, {
    uri: nextUri,
    filename: nextFilename,
    width: nextWidth,
    height: nextHeight,
    file_size: nextFileSize,
    captured_at_unix_sec: nextCapturedAtUnixSec,
  });

  const fingerprintRelevantChanged =
    nextWidth !== row.width ||
    nextHeight !== row.height ||
    nextFileSize !== row.file_size ||
    nextCapturedAtUnixSec !== row.captured_at_unix_sec ||
    nextFilename !== row.filename;
  if (fingerprintRelevantChanged) {
    await repos.photo.updateFingerprintState(row.id, {
      fingerprint_status: 'pending',
      fingerprint_md5: null,
      fingerprint_sha256: null,
      fingerprint_algo: null,
      fingerprint_version: PHOTO_FINGERPRINT_VERSION,
      fingerprint_updated_at: null,
      fingerprint_error: null,
    });
    enqueueFingerprint(row.id);
  } else if (row.fingerprint_status === 'failed' && row.fingerprint_error === 'URI_NOT_FOUND') {
    enqueueFingerprint(row.id);
  }

  const tagIds = await repos.photo.getTagIds(row.id);
  return rowToPhoto(updatedRow, tagIds);
}

export async function linkPhotoToResolvedItem(photoId: number, item: PhotoImportItem): Promise<Photo | null> {
  if (!Number.isInteger(photoId) || photoId <= 0) return null;

  const repos = await getRepositories();
  const target = await repos.photo.findById(photoId);
  if (!target) return null;

  const normalizedAssetId = normalizeNonEmptyString(item.assetId);
  if (!normalizedAssetId) {
    throw new Error('所选照片缺少资源标识，无法建立关联');
  }

  const bySourceAsset = await repos.photo.findBySourceAssetId(normalizedAssetId);
  const conflict = bySourceAsset.find((candidate) => candidate.id !== photoId);
  if (conflict) {
    throw new Error('该设备照片已关联到其他记录，当前记录不能重复绑定');
  }

  const normalizedUri = normalizeNonEmptyString(item.uri);
  if (!normalizedUri) {
    throw new Error('所选照片资源无效，无法建立关联');
  }

  const nextWidth = resolveDimension(item.width, target.width);
  const nextHeight = resolveDimension(item.height, target.height);
  const nextFileSize = resolveFileSize(item.fileSize, target.file_size);
  const nextCapturedAtUnixSec = resolveCapturedAtUnixSec(item.capturedAtUnixSec, target.captured_at_unix_sec);
  const nextFilename = item.fileName?.trim()
    ? item.fileName.trim()
    : target.filename.trim().length > 0
      ? target.filename
      : getFileNameFromUri(normalizedUri);
  const nextMimeType = normalizeNonEmptyString(item.mimeType) ?? target.mime_type;

  await repos.photo.updateMediaReference(photoId, {
    uri: normalizedUri,
    filename: nextFilename,
    width: nextWidth,
    height: nextHeight,
    file_size: nextFileSize,
    captured_at_unix_sec: nextCapturedAtUnixSec,
    source_asset_id: normalizedAssetId,
    source_provider: item.sourceProvider ?? 'media_library',
    mime_type: nextMimeType,
  });

  if (item.takenDate !== undefined && item.takenDate !== target.taken_date) {
    await repos.photo.update(photoId, { taken_date: item.takenDate ?? null });
  }

  await repos.photo.updateFingerprintState(photoId, {
    fingerprint_status: 'pending',
    fingerprint_md5: null,
    fingerprint_sha256: null,
    fingerprint_algo: null,
    fingerprint_version: PHOTO_FINGERPRINT_VERSION,
    fingerprint_updated_at: null,
    fingerprint_error: null,
  });
  enqueueFingerprint(photoId);

  await resolvePendingForPhoto(photoId);
  const tagIds = await repos.photo.getTagIds(photoId);
  const fresh = await repos.photo.findById(photoId);
  if (!fresh) return null;
  return rowToPhoto(fresh, tagIds);
}

export async function importPhotos(items: PhotoImportItem[]): Promise<Photo[]> {
  const results: Photo[] = [];
  for (const item of items) {
    const imported = await importPhoto(item.uri, item);
    if (!imported) continue;
    results.push(imported);
  }
  return results;
}

export async function getPhoto(id: number): Promise<Photo | null> {
  const repos = await getRepositories();
  const row = await repos.photo.findById(id);
  if (!row) return null;
  const tagIds = await repos.photo.getTagIds(id);
  return rowToPhoto(row, tagIds);
}

export async function getPhotos(options?: PhotoQueryOptions): Promise<Photo[]> {
  const repos = await getRepositories();
  const rows = await repos.photo.findAll(options);
  const photos: Photo[] = [];
  for (const row of rows) {
    const tagIds = await repos.photo.getTagIds(row.id);
    photos.push(rowToPhoto(row, tagIds));
  }
  return photos;
}

export async function getPhotoCount(options?: Pick<PhotoQueryOptions, 'filters'>): Promise<number> {
  const repos = await getRepositories();
  return repos.photo.countByFilters(options?.filters);
}

export async function updatePhoto(
  id: number,
  data: Partial<{
    notes: string | null;
    metadata: Record<string, unknown> | null;
    takenDate: string | null;
  }>
): Promise<Photo | null> {
  const repos = await getRepositories();
  let normalizedNotes: string | null | undefined;
  if (data.notes !== undefined) {
    normalizedNotes = normalizeEditableNotes(data.notes);
    const validation = validateNotesLength(normalizedNotes);
    if (!validation.valid) {
      throw new Error(validation.message);
    }
  }

  await repos.photo.update(id, {
    notes: normalizedNotes,
    metadata_json: data.metadata ? JSON.stringify(data.metadata) : undefined,
    taken_date: data.takenDate,
  });
  return getPhoto(id);
}

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

export async function deletePhoto(id: number): Promise<void> {
  const repos = await getRepositories();
  await repos.photo.delete(id);
}

export async function setPhotoTags(photoId: number, tagIds: number[]): Promise<void> {
  const repos = await getRepositories();
  await repos.photo.setTags(photoId, tagIds);
}

export async function addPhotoTag(photoId: number, tagId: number): Promise<void> {
  const repos = await getRepositories();
  await repos.photo.addTag(photoId, tagId);
}

export async function removePhotoTag(photoId: number, tagId: number): Promise<void> {
  const repos = await getRepositories();
  await repos.photo.removeTag(photoId, tagId);
}

export async function applyPendingDefaultTagsOnDetailOpen(photoId: number): Promise<boolean> {
  const repos = await getRepositories();
  const pendingMarker = await repos.photo.getPendingDefaultTags(photoId);
  if (!pendingMarker) {
    return false;
  }

  try {
    const existingTagIds = await repos.photo.getTagIds(photoId);
    if (existingTagIds.length > 0) {
      return false;
    }

    const currentDefaultTagIds = normalizeTagIds(await getSanitizedDefaultTagIds());
    if (currentDefaultTagIds.length === 0) {
      return false;
    }

    await repos.photo.setTags(photoId, currentDefaultTagIds);
    return true;
  } finally {
    await repos.photo.clearPendingDefaultTags(photoId);
  }
}
