import { getInfoAsync } from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { getRepositories } from '@/infra/db';
import { readCapturedAtUnixSecFromUri } from '@/features/photo/services/photo-exif-reader.service';
import type { BackfillSummary } from '@/shared/types/backup';
import type { ImportPendingPhotoTagLinkRow } from '@/shared/types/database';
import { getFileNameFromUri } from '@/shared/utils/image';
import { ensureAllPhotosPermissionOrThrow, isMediaPermissionError } from '@/features/photo/services/media-permission.service';
import { resolvePendingForPhoto } from '@/features/photo/services/import-pending-resolver.service';
import { buildPhotoFingerprintV2Md5 } from '@/features/photo/services/photo-fingerprint-v2.service';
import { createPhotoRecordForBackfill } from '@/features/photo/services/photo.service';

const DEFAULT_SOURCE_LIMIT = 500;
const DEFAULT_FINGERPRINT_PENDING_PAGE_SIZE = 500;
const ASSET_PAGE_SIZE = 100;
const AUTO_FINGERPRINT_BACKFILL_BATCH_SIZE = 1000;
const SCAN_PROGRESS_THROTTLE_ITEMS = 20;
const SCAN_PROGRESS_THROTTLE_MS = 200;

type FileInfoLike = {
  exists: boolean;
  size?: number | null;
};

type PostImportPermissionOptions = {
  skipPermissionCheck?: boolean;
};

interface FingerprintBackfillBatchOptions extends PostImportPermissionOptions {
  limitAssets?: number;
  afterCursor?: string;
  initialFingerprintMatched?: number;
  onScanProgress?: (progress: FingerprintScanProgress) => void;
}

interface FingerprintBackfillBatchResult {
  summary: BackfillSummary;
  endCursor?: string;
  hasNextPage: boolean;
  remainingResolvablePending: number;
  totalAssets: number | null;
}

interface FingerprintScanProgress {
  totalAssets: number | null;
  scannedInBatch: number;
  matchedInBatch: number;
  matchedTotalFingerprintStage: number;
  remainingResolvablePending: number;
}

interface PostImportAutoBackfillProgress {
  stage: 'fingerprint';
  batchIndex: number;
  batchScannedAssets: number;
  totalScannedAssets: number;
  totalAssets: number | null;
  batchMatched: number;
  totalMatched: number;
  totalFingerprintMatched: number;
  remainingResolvablePending: number;
  remainingPending: number;
  hasNextPage: boolean;
}

export interface PostImportAutoBackfillOptions {
  maxScanAssets?: number;
  onProgress?: (progress: PostImportAutoBackfillProgress) => void;
}

function createSummary(): BackfillSummary {
  return {
    attempted: false,
    bySourceMatched: 0,
    byFingerprintMatched: 0,
    createdPhotos: 0,
    skippedNoPermission: 0,
    remainingPending: 0,
    scannedAssets: 0,
  };
}

function mergeSummary(base: BackfillSummary, next: BackfillSummary): BackfillSummary {
  return {
    attempted: base.attempted || next.attempted,
    bySourceMatched: base.bySourceMatched + next.bySourceMatched,
    byFingerprintMatched: base.byFingerprintMatched + next.byFingerprintMatched,
    createdPhotos: base.createdPhotos + next.createdPhotos,
    skippedNoPermission: base.skippedNoPermission + next.skippedNoPermission,
    remainingPending: next.remainingPending,
    scannedAssets: base.scannedAssets + next.scannedAssets,
  };
}

async function createNoPermissionSummary(): Promise<BackfillSummary> {
  const summary = createSummary();
  summary.attempted = true;
  summary.skippedNoPermission = 1;
  summary.remainingPending = await countRemainingPending();
  return summary;
}

function readStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[key];
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function readNumberField(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function normalizeMd5(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function normalizePendingNotesToken(value: string | null | undefined): string {
  if (value == null) return '__NULL__';
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : '';
}

function normalizeTagExternalIdsJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return raw.trim();
    const normalized = Array.from(
      new Set(
        parsed
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
    return JSON.stringify(normalized);
  } catch {
    return raw.trim();
  }
}

function toStoredDate(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function keyFromMd5AndSize(md5: string, size: number): string {
  return `${md5}|${size}`;
}

function dedupeKeyForPendingRow(row: ImportPendingPhotoTagLinkRow): string {
  return [
    String(normalizePositiveInteger(row.photo_id) ?? 0),
    normalizeMd5(row.fingerprint_md5) ?? '',
    String(row.file_size),
    normalizeNonEmptyString(row.source_asset_id) ?? '',
    normalizeNonEmptyString(row.taken_date) ?? '',
    normalizeTagExternalIdsJson(row.tag_external_ids_json),
    normalizePendingNotesToken(row.notes),
  ].join('|');
}

function dedupeEquivalentPendingRows(rows: ImportPendingPhotoTagLinkRow[]): ImportPendingPhotoTagLinkRow[] {
  const byKey = new Map<string, ImportPendingPhotoTagLinkRow>();
  for (const row of rows) {
    const key = dedupeKeyForPendingRow(row);
    const existing = byKey.get(key);
    if (!existing || row.id < existing.id) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

export function __dedupeEquivalentPendingRowsForTest(
  rows: ImportPendingPhotoTagLinkRow[]
): ImportPendingPhotoTagLinkRow[] {
  return dedupeEquivalentPendingRows(rows);
}

function buildAssetUriCandidates(asset: unknown, assetInfo: unknown): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  const candidates = [
    readStringField(assetInfo, 'localUri'),
    readStringField(assetInfo, 'uri'),
    readStringField(asset, 'uri'),
  ];
  for (const uri of candidates) {
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    results.push(uri);
  }
  return results;
}

async function countRemainingPending(): Promise<number> {
  const repos = await getRepositories();
  return repos.photo.countUnresolvedImportPendingPhotoTagLinks();
}

async function getAssetInfoSafe(assetId: string): Promise<unknown | null> {
  try {
    return await MediaLibrary.getAssetInfoAsync(assetId);
  } catch {
    return null;
  }
}

async function getFileInfoFromCandidates(
  uriCandidates: string[]
): Promise<{ uri: string; info: FileInfoLike } | null> {
  for (const uri of uriCandidates) {
    try {
      const info = (await getInfoAsync(uri)) as FileInfoLike;
      if (info.exists) {
        return { uri, info };
      }
    } catch {
      // Ignore invalid candidate URI and continue trying.
    }
  }
  return null;
}

async function backfillBySourceAssetIdInternal(limit: number): Promise<BackfillSummary> {
  const summary = createSummary();
  summary.attempted = true;

  const repos = await getRepositories();
  const pendingRows = dedupeEquivalentPendingRows(await repos.photo.findUnresolvedPendingBySourceAsset(limit));

  for (const row of pendingRows) {
    const sourceAssetId = row.source_asset_id?.trim();
    if (!sourceAssetId) continue;

    const expectedFileSize = row.file_size > 0 ? row.file_size : undefined;
    const pendingPhotoId = normalizePositiveInteger(row.photo_id);
    const pendingPhoto = pendingPhotoId ? await repos.photo.findById(pendingPhotoId) : null;
    if (pendingPhotoId && !pendingPhoto) {
      continue;
    }

    const localCandidates = await repos.photo.findBySourceAssetId(sourceAssetId, expectedFileSize);
    if (pendingPhotoId) {
      if (localCandidates.some((candidate) => candidate.id === pendingPhotoId)) {
        const resolved = await resolvePendingForPhoto(pendingPhotoId);
        summary.bySourceMatched += resolved.resolved;
        continue;
      }
      if (localCandidates.length > 0) {
        continue;
      }
    } else {
      if (localCandidates.length === 1) {
        const resolved = await resolvePendingForPhoto(localCandidates[0].id);
        summary.bySourceMatched += resolved.resolved;
        continue;
      }
      if (localCandidates.length > 1) {
        continue;
      }
    }

    const assetInfo = await getAssetInfoSafe(sourceAssetId);
    const uriCandidates = buildAssetUriCandidates(null, assetInfo);
    if (uriCandidates.length === 0) continue;

    const fileInfo = await getFileInfoFromCandidates(uriCandidates);
    if (!fileInfo) continue;

    const effectiveFileSize = expectedFileSize ?? (typeof fileInfo.info.size === 'number' ? fileInfo.info.size : 0);
    const takenDate = toStoredDate(readNumberField(assetInfo, 'creationTime'));
    const capturedAtUnixSec = await readCapturedAtUnixSecFromUri(fileInfo.uri);
    const filename = readStringField(assetInfo, 'filename') ?? getFileNameFromUri(fileInfo.uri);
    const width = readNumberField(assetInfo, 'width') ?? 0;
    const height = readNumberField(assetInfo, 'height') ?? 0;
    const mimeType = readStringField(assetInfo, 'mimeType');

    if (pendingPhotoId && pendingPhoto) {
      await repos.photo.updateMediaReference(pendingPhotoId, {
        uri: fileInfo.uri,
        filename,
        width,
        height,
        file_size: effectiveFileSize,
        captured_at_unix_sec: capturedAtUnixSec,
        source_asset_id: sourceAssetId,
        source_provider: 'media_library_backfill',
        mime_type: mimeType ?? pendingPhoto.mime_type ?? null,
      });
      if (takenDate && takenDate !== pendingPhoto.taken_date) {
        await repos.photo.update(pendingPhotoId, { taken_date: takenDate });
      }
      const resolved = await resolvePendingForPhoto(pendingPhotoId);
      summary.bySourceMatched += resolved.resolved;
      continue;
    }

    const created = await createPhotoRecordForBackfill({
      uri: fileInfo.uri,
      fileName: filename,
      width,
      height,
      fileSize: effectiveFileSize,
      capturedAtUnixSec,
      takenDate,
      sourceAssetId,
      sourceProvider: 'media_library_backfill',
    });
    summary.createdPhotos += 1;

    const resolved = await resolvePendingForPhoto(created.id);
    summary.bySourceMatched += resolved.resolved;
  }

  summary.remainingPending = await countRemainingPending();
  return summary;
}

function buildUniqueFingerprintMap(rows: ImportPendingPhotoTagLinkRow[]): {
  pendingByKey: Map<string, ImportPendingPhotoTagLinkRow>;
  sizeRefCount: Map<number, number>;
} {
  const grouped = new Map<string, ImportPendingPhotoTagLinkRow[]>();

  for (const row of rows) {
    const md5 = normalizeMd5(row.fingerprint_md5);
    if (!md5 || row.file_size <= 0) continue;
    const key = keyFromMd5AndSize(md5, row.file_size);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  const pendingByKey = new Map<string, ImportPendingPhotoTagLinkRow>();
  const sizeRefCount = new Map<number, number>();

  for (const [key, groupedRows] of grouped) {
    if (groupedRows.length !== 1) continue;
    const row = groupedRows[0];
    pendingByKey.set(key, row);
    sizeRefCount.set(row.file_size, (sizeRefCount.get(row.file_size) ?? 0) + 1);
  }

  return { pendingByKey, sizeRefCount };
}

function removeFingerprintKey(
  key: string,
  pendingByKey: Map<string, ImportPendingPhotoTagLinkRow>,
  sizeRefCount: Map<number, number>
): void {
  const row = pendingByKey.get(key);
  if (!row) return;
  pendingByKey.delete(key);

  const current = sizeRefCount.get(row.file_size) ?? 0;
  if (current <= 1) {
    sizeRefCount.delete(row.file_size);
  } else {
    sizeRefCount.set(row.file_size, current - 1);
  }
}

async function loadAllUnresolvedPendingForFingerprint(
  pageSize = DEFAULT_FINGERPRINT_PENDING_PAGE_SIZE
): Promise<ImportPendingPhotoTagLinkRow[]> {
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : DEFAULT_FINGERPRINT_PENDING_PAGE_SIZE;
  const repos = await getRepositories();
  const rows: ImportPendingPhotoTagLinkRow[] = [];
  let offset = 0;

  for (;;) {
    const page = await repos.photo.findUnresolvedPendingForFingerprintPage(safePageSize, offset);
    if (page.length === 0) {
      break;
    }
    rows.push(...page);
    if (page.length < safePageSize) {
      break;
    }
    offset += page.length;
  }

  return rows;
}

async function buildResolvableFingerprintState(): Promise<{
  pendingByKey: Map<string, ImportPendingPhotoTagLinkRow>;
  sizeRefCount: Map<number, number>;
}> {
  const unresolvedRows = dedupeEquivalentPendingRows(await loadAllUnresolvedPendingForFingerprint());
  return buildUniqueFingerprintMap(unresolvedRows);
}

async function backfillByFingerprintScanBatchInternal(
  options: Pick<
    FingerprintBackfillBatchOptions,
    'limitAssets' | 'afterCursor' | 'initialFingerprintMatched' | 'onScanProgress'
  >
): Promise<FingerprintBackfillBatchResult> {
  const summary = createSummary();
  summary.attempted = true;

  const safeAssetLimit =
    typeof options.limitAssets === 'number' && Number.isFinite(options.limitAssets) && options.limitAssets > 0
      ? Math.floor(options.limitAssets)
      : Number.POSITIVE_INFINITY;

  const repos = await getRepositories();
  const { pendingByKey, sizeRefCount } = await buildResolvableFingerprintState();

  if (pendingByKey.size === 0 || sizeRefCount.size === 0) {
    summary.remainingPending = await countRemainingPending();
    return {
      summary,
      endCursor: options.afterCursor,
      hasNextPage: false,
      remainingResolvablePending: pendingByKey.size,
      totalAssets: null,
    };
  }

  let scanned = 0;
  let after = options.afterCursor;
  let hasNextPage = true;
  let totalAssets: number | null = null;
  const onScanProgress = options.onScanProgress;
  const initialFingerprintMatched =
    typeof options.initialFingerprintMatched === 'number' && Number.isFinite(options.initialFingerprintMatched)
      ? Math.max(0, Math.floor(options.initialFingerprintMatched))
      : 0;
  let lastProgressEmitAt = 0;
  let lastProgressScanned = -1;
  let lastProgressMatched = -1;

  const emitScanProgress = (force = false) => {
    if (typeof onScanProgress !== 'function') return;

    const now = Date.now();
    const scannedInBatch = summary.scannedAssets;
    const matchedInBatch = summary.byFingerprintMatched;
    if (!force) {
      const scannedDelta = scannedInBatch - lastProgressScanned;
      const matchedChanged = matchedInBatch !== lastProgressMatched;
      const shouldEmitByItem = scannedDelta >= SCAN_PROGRESS_THROTTLE_ITEMS;
      const shouldEmitByTime = now - lastProgressEmitAt >= SCAN_PROGRESS_THROTTLE_MS;
      if (!matchedChanged && !shouldEmitByItem && !shouldEmitByTime) {
        return;
      }
    }

    onScanProgress({
      totalAssets,
      scannedInBatch,
      matchedInBatch,
      matchedTotalFingerprintStage: initialFingerprintMatched + matchedInBatch,
      remainingResolvablePending: pendingByKey.size,
    });
    lastProgressEmitAt = now;
    lastProgressScanned = scannedInBatch;
    lastProgressMatched = matchedInBatch;
  };

  while (hasNextPage && scanned < safeAssetLimit && pendingByKey.size > 0) {
    const remainingBudget = safeAssetLimit - scanned;
    const first = Math.min(ASSET_PAGE_SIZE, remainingBudget);
    const page = await MediaLibrary.getAssetsAsync({
      first,
      after,
      mediaType: [MediaLibrary.MediaType.photo],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    if (typeof page.totalCount === 'number' && Number.isFinite(page.totalCount) && page.totalCount >= 0) {
      totalAssets = Math.floor(page.totalCount);
    }
    emitScanProgress(true);

    for (const asset of page.assets) {
      if (scanned >= safeAssetLimit || pendingByKey.size === 0 || sizeRefCount.size === 0) break;

      scanned += 1;
      summary.scannedAssets += 1;
      emitScanProgress(false);

      const uriCandidates = buildAssetUriCandidates(asset, null);
      if (uriCandidates.length === 0) continue;

      const basicInfo = await getFileInfoFromCandidates(uriCandidates);
      if (!basicInfo) continue;

      const fileSize = typeof basicInfo.info.size === 'number' ? basicInfo.info.size : 0;
      if (fileSize <= 0 || !sizeRefCount.has(fileSize)) continue;

      const width = readNumberField(asset, 'width') ?? 0;
      const height = readNumberField(asset, 'height') ?? 0;
      const takenDate = toStoredDate(readNumberField(asset, 'creationTime'));
      const capturedAtUnixSec = await readCapturedAtUnixSecFromUri(basicInfo.uri);
      const sourceAssetId = readStringField(asset, 'id');
      const filename =
        readStringField(asset, 'filename') ??
        getFileNameFromUri(basicInfo.uri);
      const md5 = await buildPhotoFingerprintV2Md5({
        capturedAtUnixSec,
        fileName: filename,
        fileSize,
        width,
        height,
      });

      const key = keyFromMd5AndSize(md5, fileSize);
      const pendingRow = pendingByKey.get(key);
      if (!pendingRow) continue;
      const pendingPhotoId = normalizePositiveInteger(pendingRow.photo_id);

      if (pendingPhotoId) {
        const pendingPhoto = await repos.photo.findById(pendingPhotoId);
        if (!pendingPhoto) continue;

        if (sourceAssetId) {
          const bySourceAsset = await repos.photo.findBySourceAssetId(sourceAssetId, fileSize);
          if (bySourceAsset.some((candidate) => candidate.id !== pendingPhotoId)) {
            continue;
          }
        }

        await repos.photo.updateMediaReference(pendingPhotoId, {
          uri: basicInfo.uri,
          filename,
          width,
          height,
          file_size: fileSize,
          captured_at_unix_sec: capturedAtUnixSec,
          source_asset_id: sourceAssetId ?? pendingPhoto.source_asset_id,
          source_provider: sourceAssetId ? 'media_library_backfill' : pendingPhoto.source_provider,
          mime_type: pendingPhoto.mime_type,
        });
        if (takenDate && takenDate !== pendingPhoto.taken_date) {
          await repos.photo.update(pendingPhotoId, { taken_date: takenDate });
        }

        const resolved = await resolvePendingForPhoto(pendingPhotoId);
        if (resolved.resolved > 0) {
          summary.byFingerprintMatched += resolved.resolved;
          removeFingerprintKey(key, pendingByKey, sizeRefCount);
          emitScanProgress(false);
        }
        continue;
      }

      const localCandidates = await repos.photo.findByFingerprint({ md5, fileSize });
      let targetPhotoId: number | null = null;
      if (localCandidates.length === 1) {
        targetPhotoId = localCandidates[0].id;
      } else if (localCandidates.length === 0) {
        const created = await createPhotoRecordForBackfill({
          uri: basicInfo.uri,
          fileName: filename,
          width,
          height,
          fileSize,
          capturedAtUnixSec,
          takenDate,
          sourceAssetId,
          sourceProvider: 'media_library_backfill',
          fingerprintMd5: md5,
        });
        summary.createdPhotos += 1;
        targetPhotoId = created.id;
      }

      if (targetPhotoId == null) continue;
      const resolved = await resolvePendingForPhoto(targetPhotoId);
      if (resolved.resolved > 0) {
        summary.byFingerprintMatched += resolved.resolved;
        removeFingerprintKey(key, pendingByKey, sizeRefCount);
        emitScanProgress(false);
      }
    }

    hasNextPage = page.hasNextPage;
    after = page.endCursor ?? undefined;
    emitScanProgress(true);
  }

  emitScanProgress(true);

  summary.remainingPending = await countRemainingPending();
  return {
    summary,
    endCursor: after,
    hasNextPage,
    remainingResolvablePending: pendingByKey.size,
    totalAssets,
  };
}

async function ensurePostImportPermission(
  options?: PostImportPermissionOptions
): Promise<BackfillSummary | null> {
  if (options?.skipPermissionCheck) {
    return null;
  }
  try {
    await ensureAllPhotosPermissionOrThrow('backup_import_auto_backfill');
    return null;
  } catch (error) {
    if (!isMediaPermissionError(error)) {
      throw error;
    }
    return createNoPermissionSummary();
  }
}

function normalizePositiveLimit(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

export async function runPostImportAutoBackfill(options?: PostImportAutoBackfillOptions): Promise<BackfillSummary> {
  const summary = createSummary();
  summary.attempted = true;

  const permissionSummary = await ensurePostImportPermission();
  if (permissionSummary) {
    return permissionSummary;
  }
  const emitProgress = (progress: PostImportAutoBackfillProgress) => {
    if (typeof options?.onProgress === 'function') {
      options.onProgress(progress);
    }
  };
  const maxScanAssets = normalizePositiveLimit(options?.maxScanAssets);
  const initialRemainingPending = await countRemainingPending();
  const sourceSummary = await backfillBySourceAssetIdInternal(DEFAULT_SOURCE_LIMIT);
  let merged = mergeSummary(summary, sourceSummary);
  let batchIndex = 0;
  let nextCursor: string | undefined;
  let totalFingerprintScanned = 0;
  let totalAssets: number | null = null;

  emitProgress({
    stage: 'fingerprint',
    batchIndex: 0,
    batchScannedAssets: 0,
    totalScannedAssets: 0,
    totalAssets: null,
    batchMatched: 0,
    totalMatched: 0,
    totalFingerprintMatched: 0,
    remainingResolvablePending: initialRemainingPending,
    remainingPending: initialRemainingPending,
    hasNextPage: initialRemainingPending > 0,
  });

  for (;;) {
    if (maxScanAssets != null && totalFingerprintScanned >= maxScanAssets) {
      break;
    }
    const remainingBudget = maxScanAssets == null ? null : maxScanAssets - totalFingerprintScanned;
    if (remainingBudget != null && remainingBudget <= 0) {
      break;
    }

    batchIndex += 1;
    const batchLimit =
      remainingBudget == null
        ? AUTO_FINGERPRINT_BACKFILL_BATCH_SIZE
        : Math.min(AUTO_FINGERPRINT_BACKFILL_BATCH_SIZE, remainingBudget);
    const scannedBeforeBatch = totalFingerprintScanned;
    const matchedBeforeBatch = merged.byFingerprintMatched;
    const batchResult = await backfillByFingerprintScanBatchInternal({
      limitAssets: batchLimit,
      afterCursor: nextCursor,
      initialFingerprintMatched: matchedBeforeBatch,
      onScanProgress: (scanProgress) => {
        emitProgress({
          stage: 'fingerprint',
          batchIndex,
          batchScannedAssets: scanProgress.scannedInBatch,
          totalScannedAssets: scannedBeforeBatch + scanProgress.scannedInBatch,
          totalAssets: scanProgress.totalAssets,
          batchMatched: scanProgress.matchedInBatch,
          totalMatched: scanProgress.matchedTotalFingerprintStage,
          totalFingerprintMatched: scanProgress.matchedTotalFingerprintStage,
          remainingResolvablePending: scanProgress.remainingResolvablePending,
          remainingPending: scanProgress.remainingResolvablePending,
          hasNextPage: true,
        });
      },
    });
    const batchSummary = batchResult.summary;
    merged = mergeSummary(merged, batchSummary);
    totalFingerprintScanned += batchSummary.scannedAssets;
    if (batchResult.totalAssets != null) {
      totalAssets = batchResult.totalAssets;
    }

    emitProgress({
      stage: 'fingerprint',
      batchIndex,
      batchScannedAssets: batchSummary.scannedAssets,
      totalScannedAssets: totalFingerprintScanned,
      totalAssets,
      batchMatched: batchSummary.byFingerprintMatched,
      totalMatched: merged.byFingerprintMatched,
      totalFingerprintMatched: merged.byFingerprintMatched,
      remainingResolvablePending: batchResult.remainingResolvablePending,
      remainingPending: batchSummary.remainingPending,
      hasNextPage: batchResult.hasNextPage,
    });

    if (batchSummary.skippedNoPermission > 0) {
      break;
    }
    if (batchResult.remainingResolvablePending <= 0) {
      break;
    }
    if (!batchResult.hasNextPage || !batchResult.endCursor) {
      break;
    }
    nextCursor = batchResult.endCursor;
  }

  merged.remainingPending = await countRemainingPending();
  return merged;
}
