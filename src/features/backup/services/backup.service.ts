import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { getDb } from '@/infra/db/client';
import { getRepositories } from '@/infra/db';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  KV_DEFAULT_TAG_IDS,
  KV_SCHEMA_VERSION,
  MEDIA_BACKFILL_DEFAULT_MAX_SCAN_ASSETS,
} from '@/shared/constants';
import {
  runPostImportAutoBackfill,
} from './media-backfill.service';
import type {
  BackfillSummary,
  BackupEnvelope,
  BackupPayload,
  ExportSummary,
  ImportProgressSnapshot,
  ImportProgressStage,
  ImportSummary,
} from '@/shared/types/backup';
import type { ImportPendingReason, TagCategoryRow, TagRow } from '@/shared/types/database';
import {
  encodePendingNotesToken,
  normalizeEditableNotes,
  validateNotesLength,
} from '@/shared/utils/photo-notes';
import { readCapturedAtUnixSecFromUri } from '@/features/photo/services/photo-exif-reader.service';
import { getFileNameFromUri } from '@/shared/utils/image';
import { ensureAllPhotosPermissionOrThrow, isMediaPermissionError } from '@/features/photo/services/media-permission.service';
import { buildPhotoFingerprintV2Md5, PHOTO_FINGERPRINT_VERSION } from '@/features/photo/services/photo-fingerprint-v2.service';

interface ParseErrorOptions {
  details?: string;
}

class BackupValidationError extends Error {
  constructor(message: string, options?: ParseErrorOptions) {
    super(options?.details ? `${message}: ${options.details}` : message);
  }
}

const EXPORT_SOURCE_ID_SCAN_LIMIT = MEDIA_BACKFILL_DEFAULT_MAX_SCAN_ASSETS;
const ASSET_PAGE_SIZE = 100;
const IMPORT_DEBUG_PREFIX = '[backup.import]';
const IMPORT_PROGRESS_THROTTLE_ITEMS = 25;
const IMPORT_PROGRESS_THROTTLE_MS = 200;
const IMPORT_PROGRESS_ETA_MIN_SAMPLE = 20;
const IMPORT_PROGRESS_ETA_HYBRID_WINDOW_MS = 12_000;
const IMPORT_PROGRESS_ETA_HYBRID_MIN_DELTA_MS = 500;
const IMPORT_PROGRESS_ETA_HYBRID_SCAN_ALPHA = 0.25;
const IMPORT_PROGRESS_ETA_HYBRID_RESOLVE_ALPHA = 0.3;
const IMPORT_PROGRESS_ETA_MAX_JUMP_RATIO = 0.35;

type ExportPhotoJoinLike = {
  photo_id: number;
  fingerprint_md5: string | null;
  file_size: number;
  source_asset_id: string | null;
  taken_date: string | null;
};

type FileInfoLike = {
  exists: boolean;
  size?: number | null;
};

function isImportDebugEnabled(): boolean {
  return __DEV__;
}

function formatDebugPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable-payload]';
  }
}

function formatDebugError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const stackTop = typeof error.stack === 'string' ? error.stack.split('\n')[0] : null;
    return {
      name: error.name,
      message: error.message,
      stackTop,
    };
  }
  return {
    message: String(error),
  };
}

function logImportDebug(step: string, payload?: Record<string, unknown>): void {
  if (!isImportDebugEnabled()) return;
  if (payload) {
    console.info(`${IMPORT_DEBUG_PREFIX} ${step}`, formatDebugPayload(payload));
    return;
  }
  console.info(`${IMPORT_DEBUG_PREFIX} ${step}`);
}

type ImportProgressMeta = {
  matched?: number;
  remainingPending?: number | null;
  scanTotalAssets?: number | null;
  scanScannedAssets?: number | null;
  scanCapAssets?: number | null;
  scanStageMatched?: number;
  totalMatched?: number;
};

function createImportProgressEmitter(
  onProgress?: (progress: ImportProgressSnapshot) => void
): (
  stage: ImportProgressStage,
  completed: number,
  total: number | null,
  meta?: ImportProgressMeta,
  force?: boolean
) => void {
  let activeStage: ImportProgressStage | null = null;
  let stageStartedAt = 0;
  let lastEmitAt = 0;
  let lastCompleted = -1;
  let fingerprintPoints: Array<{ tMs: number; scanned: number; remainingPending: number }> = [];
  let fingerprintScanRateAssetsPerSec: number | null = null;
  let fingerprintResolveRatePerSec: number | null = null;
  let lastFingerprintEtaSeconds: number | null = null;
  let lastFingerprintEtaUpperBoundSeconds: number | null = null;

  const normalizeNonNegativeInt = (value: number | null | undefined): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    return Math.floor(value);
  };

  const blendEwma = (previous: number | null, sample: number, alpha: number): number => {
    if (previous == null || !Number.isFinite(previous) || previous <= 0) {
      return sample;
    }
    return alpha * sample + (1 - alpha) * previous;
  };

  const clampEtaJump = (nextSeconds: number | null, previousSeconds: number | null): number | null => {
    if (nextSeconds == null) return null;
    const normalized = Math.max(0, Math.ceil(nextSeconds));
    if (previousSeconds == null || previousSeconds <= 0 || normalized === 0) {
      return normalized;
    }
    const minAllowed = Math.max(0, Math.floor(previousSeconds * (1 - IMPORT_PROGRESS_ETA_MAX_JUMP_RATIO)));
    const maxAllowed = Math.ceil(previousSeconds * (1 + IMPORT_PROGRESS_ETA_MAX_JUMP_RATIO));
    return Math.min(maxAllowed, Math.max(minAllowed, normalized));
  };

  return (stage, completed, total, meta, force = false) => {
    if (typeof onProgress !== 'function') return;

    const now = Date.now();
    const safeCompleted = Number.isFinite(completed) ? Math.max(0, Math.floor(completed)) : 0;
    const safeTotal =
      typeof total === 'number' && Number.isFinite(total) && total >= 0 ? Math.floor(total) : null;

    if (activeStage !== stage) {
      activeStage = stage;
      stageStartedAt = now;
      lastEmitAt = 0;
      lastCompleted = -1;
      fingerprintPoints = [];
      fingerprintScanRateAssetsPerSec = null;
      fingerprintResolveRatePerSec = null;
      lastFingerprintEtaSeconds = null;
      lastFingerprintEtaUpperBoundSeconds = null;
      force = true;
    }

    const reachedEnd = safeTotal != null && safeCompleted >= safeTotal;
    if (!force) {
      const deltaCompleted = safeCompleted - lastCompleted;
      if (deltaCompleted <= 0 && now - lastEmitAt < IMPORT_PROGRESS_THROTTLE_MS && !reachedEnd) {
        return;
      }
      if (deltaCompleted < IMPORT_PROGRESS_THROTTLE_ITEMS && now - lastEmitAt < IMPORT_PROGRESS_THROTTLE_MS && !reachedEnd) {
        return;
      }
    }

    const percent =
      safeTotal != null && safeTotal > 0 ? Math.min(100, Math.max(0, (safeCompleted / safeTotal) * 100)) : null;
    const elapsedSeconds = stageStartedAt > 0 ? (now - stageStartedAt) / 1000 : 0;
    let etaSeconds: number | null = null;
    let etaUpperBoundSeconds: number | null = null;
    let etaModel: 'scan' | 'hybrid' = 'scan';
    if (safeTotal != null && safeTotal > safeCompleted && safeCompleted >= IMPORT_PROGRESS_ETA_MIN_SAMPLE && elapsedSeconds > 0) {
      etaSeconds = Math.ceil((elapsedSeconds / safeCompleted) * (safeTotal - safeCompleted));
    }

    if (stage === 'auto_backfill_fingerprint') {
      const scanned = normalizeNonNegativeInt(meta?.scanScannedAssets) ?? safeCompleted;
      const remainingPending = normalizeNonNegativeInt(meta?.remainingPending);
      const scanTotalAssets = normalizeNonNegativeInt(meta?.scanTotalAssets) ?? safeTotal;
      const scanCapAssets = normalizeNonNegativeInt(meta?.scanCapAssets);
      const effectiveTotalAssets =
        scanTotalAssets != null && scanCapAssets != null
          ? Math.min(scanTotalAssets, scanCapAssets)
          : (scanTotalAssets ?? scanCapAssets);

      if (remainingPending != null) {
        fingerprintPoints.push({ tMs: now, scanned, remainingPending });
        const minTs = now - IMPORT_PROGRESS_ETA_HYBRID_WINDOW_MS;
        fingerprintPoints = fingerprintPoints.filter((point) => point.tMs >= minTs);
      }

      if (fingerprintPoints.length >= 2) {
        const firstPoint = fingerprintPoints[0];
        const lastPoint = fingerprintPoints[fingerprintPoints.length - 1];
        const deltaMs = lastPoint.tMs - firstPoint.tMs;
        const deltaScanned = lastPoint.scanned - firstPoint.scanned;
        if (deltaMs >= IMPORT_PROGRESS_ETA_HYBRID_MIN_DELTA_MS && deltaScanned > 0) {
          const deltaSec = deltaMs / 1000;
          const scanRateSample = deltaScanned / deltaSec;
          fingerprintScanRateAssetsPerSec = blendEwma(
            fingerprintScanRateAssetsPerSec,
            scanRateSample,
            IMPORT_PROGRESS_ETA_HYBRID_SCAN_ALPHA
          );

          const resolvedPending = Math.max(0, firstPoint.remainingPending - lastPoint.remainingPending);
          if (resolvedPending > 0) {
            const resolveRateSample = resolvedPending / deltaSec;
            fingerprintResolveRatePerSec = blendEwma(
              fingerprintResolveRatePerSec,
              resolveRateSample,
              IMPORT_PROGRESS_ETA_HYBRID_RESOLVE_ALPHA
            );
          }
        }
      }

      let etaByScanSeconds: number | null = null;
      if (
        effectiveTotalAssets != null &&
        fingerprintScanRateAssetsPerSec != null &&
        Number.isFinite(fingerprintScanRateAssetsPerSec) &&
        fingerprintScanRateAssetsPerSec > 0
      ) {
        const remainingAssets = Math.max(0, effectiveTotalAssets - scanned);
        etaByScanSeconds = remainingAssets / fingerprintScanRateAssetsPerSec;
      }

      let etaByPendingSeconds: number | null = null;
      if (remainingPending != null) {
        if (remainingPending === 0) {
          etaByPendingSeconds = 0;
        } else if (
          fingerprintResolveRatePerSec != null &&
          Number.isFinite(fingerprintResolveRatePerSec) &&
          fingerprintResolveRatePerSec > 0
        ) {
          etaByPendingSeconds = remainingPending / fingerprintResolveRatePerSec;
        }
      }

      etaUpperBoundSeconds = clampEtaJump(etaByScanSeconds, lastFingerprintEtaUpperBoundSeconds);

      const hasHybridSample = scanned >= IMPORT_PROGRESS_ETA_MIN_SAMPLE;
      if (remainingPending === 0) {
        etaSeconds = 0;
        etaModel = 'hybrid';
      } else if (hasHybridSample) {
        let hybridCandidate: number | null = null;
        if (etaByPendingSeconds != null && etaByScanSeconds != null) {
          hybridCandidate = Math.min(etaByPendingSeconds, etaByScanSeconds);
        } else if (etaByPendingSeconds != null) {
          hybridCandidate = etaByPendingSeconds;
        } else if (etaByScanSeconds != null) {
          hybridCandidate = etaByScanSeconds;
        }
        if (hybridCandidate != null) {
          etaSeconds = clampEtaJump(hybridCandidate, lastFingerprintEtaSeconds);
          etaModel = 'hybrid';
        } else {
          etaSeconds = clampEtaJump(etaSeconds, lastFingerprintEtaSeconds);
        }
      } else {
        etaSeconds = clampEtaJump(etaSeconds, lastFingerprintEtaSeconds);
      }

      lastFingerprintEtaSeconds = etaSeconds;
      lastFingerprintEtaUpperBoundSeconds = etaUpperBoundSeconds;
    }

    onProgress({
      stage,
      completed: safeCompleted,
      total: safeTotal,
      percent,
      etaSeconds,
      etaUpperBoundSeconds,
      etaModel,
      matched: meta?.matched ?? 0,
      remainingPending: meta?.remainingPending ?? null,
      scanTotalAssets: meta?.scanTotalAssets ?? null,
      scanScannedAssets: meta?.scanScannedAssets ?? null,
      scanStageMatched: meta?.scanStageMatched ?? 0,
      totalMatched: meta?.totalMatched ?? meta?.matched ?? 0,
    });

    lastEmitAt = now;
    lastCompleted = safeCompleted;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BackupValidationError('备份数据无效', { details: `${field} 必须是对象` });
  }
  return value;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new BackupValidationError('备份数据无效', { details: `${field} 必须是字符串` });
  }
  return value;
}

function assertNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new BackupValidationError('备份数据无效', { details: `${field} 必须是字符串或 null` });
  }
  return value;
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new BackupValidationError('备份数据无效', { details: `${field} 必须是数字` });
  }
  return value;
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new BackupValidationError('备份数据无效', { details: `${field} 必须是字符串数组` });
  }
  return value;
}

function hasOwnField(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeStringArray(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

function normalizeExternalId(value: string): string {
  return value.trim();
}

function normalizeName(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortValue(item));
  }
  if (!isRecord(value)) {
    return value;
  }
  const result: Record<string, unknown> = {};
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    result[key] = stableSortValue(value[key]);
  }
  return result;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableSortValue(value));
}

async function sha256Hex(content: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, content, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

function toBackupTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function parseSchemaVersion(raw: string | null): number {
  const parsed = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function parseStoredDefaultTagIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const numbers = parsed
      .map((value) => (typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN))
      .filter((value) => Number.isInteger(value) && value > 0) as number[];
    return Array.from(new Set(numbers));
  } catch {
    return [];
  }
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMd5(value: string | null | undefined): string | null {
  const normalized = normalizeNonEmptyString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function buildFingerprintKey(md5: string, fileSize: number): string {
  return `${md5}|${fileSize}`;
}

function extractAssetUris(asset: unknown, assetInfo: unknown): string[] {
  const values: Array<string | null> = [];

  if (asset && typeof asset === 'object') {
    values.push(normalizeNonEmptyString((asset as { uri?: unknown }).uri as string | null));
  }

  if (assetInfo && typeof assetInfo === 'object') {
    values.push(normalizeNonEmptyString((assetInfo as { localUri?: unknown }).localUri as string | null));
    values.push(normalizeNonEmptyString((assetInfo as { uri?: unknown }).uri as string | null));
  }

  const unique = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || unique.has(value)) continue;
    unique.add(value);
    result.push(value);
  }
  return result;
}

async function getFileInfoFromUris(
  uriCandidates: string[]
): Promise<{ uri: string; info: FileInfoLike } | null> {
  for (const uri of uriCandidates) {
    try {
      const info = (await FileSystem.getInfoAsync(uri)) as FileInfoLike;
      if (info.exists) {
        return { uri, info };
      }
    } catch {
      // Ignore invalid URI candidates and continue.
    }
  }
  return null;
}

async function hydrateMissingSourceAssetIdsForExport(rows: ExportPhotoJoinLike[]): Promise<Map<number, string>> {
  const latestByPhotoId = new Map<number, ExportPhotoJoinLike>();
  for (const row of rows) {
    if (!latestByPhotoId.has(row.photo_id)) {
      latestByPhotoId.set(row.photo_id, row);
    }
  }

  const grouped = new Map<string, number[]>();
  for (const row of latestByPhotoId.values()) {
    if (normalizeNonEmptyString(row.source_asset_id)) continue;
    const md5 = normalizeMd5(row.fingerprint_md5);
    if (!md5 || row.file_size <= 0) continue;
    const key = buildFingerprintKey(md5, row.file_size);
    const ids = grouped.get(key) ?? [];
    ids.push(row.photo_id);
    grouped.set(key, ids);
  }

  const photoIdByKey = new Map<string, number>();
  const sizeRefCount = new Map<number, number>();
  for (const [key, photoIds] of grouped) {
    if (photoIds.length !== 1) continue;
    const photoId = photoIds[0];
    const row = latestByPhotoId.get(photoId);
    if (!row) continue;
    photoIdByKey.set(key, photoId);
    sizeRefCount.set(row.file_size, (sizeRefCount.get(row.file_size) ?? 0) + 1);
  }

  if (photoIdByKey.size === 0 || sizeRefCount.size === 0) {
    return new Map<number, string>();
  }

  try {
    await ensureAllPhotosPermissionOrThrow('backup_export_hydration');
  } catch (error) {
    if (isMediaPermissionError(error)) {
      return new Map<number, string>();
    }
    throw error;
  }

  const resolvedByPhotoId = new Map<number, string>();
  let scanned = 0;
  let hasNextPage = true;
  let after: string | undefined;

  while (hasNextPage && scanned < EXPORT_SOURCE_ID_SCAN_LIMIT && photoIdByKey.size > 0) {
    const remaining = EXPORT_SOURCE_ID_SCAN_LIMIT - scanned;
    const first = Math.min(ASSET_PAGE_SIZE, remaining);
    const page = await MediaLibrary.getAssetsAsync({
      first,
      after,
      mediaType: [MediaLibrary.MediaType.photo],
    });

    for (const asset of page.assets) {
      if (photoIdByKey.size === 0 || scanned >= EXPORT_SOURCE_ID_SCAN_LIMIT) break;
      scanned += 1;

      const assetId = normalizeNonEmptyString(asset.id);
      if (!assetId) continue;

      const uriCandidates = extractAssetUris(asset, null);
      if (uriCandidates.length === 0) continue;

      const basicInfo = await getFileInfoFromUris(uriCandidates);
      if (!basicInfo) continue;

      const fileSize = typeof basicInfo.info.size === 'number' ? basicInfo.info.size : 0;
      if (fileSize <= 0 || !sizeRefCount.has(fileSize)) continue;

      const width = asset.width;
      const height = asset.height;
      const filename =
        normalizeNonEmptyString(asset.filename) ??
        getFileNameFromUri(basicInfo.uri);
      const capturedAtUnixSec = await readCapturedAtUnixSecFromUri(basicInfo.uri);
      const md5 = await buildPhotoFingerprintV2Md5({
        capturedAtUnixSec,
        fileName: filename,
        fileSize,
        width,
        height,
      });

      const key = buildFingerprintKey(md5, fileSize);
      const photoId = photoIdByKey.get(key);
      if (!photoId) continue;

      resolvedByPhotoId.set(photoId, assetId);
      photoIdByKey.delete(key);

      const sizeCount = sizeRefCount.get(fileSize) ?? 0;
      if (sizeCount <= 1) {
        sizeRefCount.delete(fileSize);
      } else {
        sizeRefCount.set(fileSize, sizeCount - 1);
      }
    }

    hasNextPage = page.hasNextPage;
    after = page.endCursor ?? undefined;
  }

  if (resolvedByPhotoId.size > 0) {
    const db = await getDb();
    for (const [photoId, sourceAssetId] of resolvedByPhotoId) {
      await db.runAsync(
        `UPDATE photos
         SET source_asset_id = ?,
             source_provider = CASE WHEN source_provider = 'unknown' THEN 'media_library_backfill' ELSE source_provider END
         WHERE id = ?
           AND (source_asset_id IS NULL OR TRIM(source_asset_id) = '')`,
        [sourceAssetId, photoId]
      );
    }
  }

  return resolvedByPhotoId;
}

function parseBackupEnvelope(raw: unknown): BackupEnvelope {
  const envelope = assertRecord(raw, 'root');

  const format = assertString(envelope.format, 'format');
  if (format !== BACKUP_FORMAT) {
    throw new BackupValidationError('不支持的备份格式');
  }

  const formatVersion = assertString(envelope.formatVersion, 'formatVersion');
  if (!/^1\.\d+\.\d+$/.test(formatVersion)) {
    throw new BackupValidationError('不支持的备份格式版本');
  }

  const createdAt = assertString(envelope.createdAt, 'createdAt');
  const appSchemaVersion = assertNumber(envelope.appSchemaVersion, 'appSchemaVersion');
  const checksumAlgorithm = assertString(envelope.checksumAlgorithm, 'checksumAlgorithm');
  if (checksumAlgorithm !== 'sha256') {
    throw new BackupValidationError('不支持的校验算法');
  }

  const payloadSha256 = assertString(envelope.payloadSha256, 'payloadSha256').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(payloadSha256)) {
    throw new BackupValidationError('数据载荷哈希值无效');
  }

  const payloadRecord = assertRecord(envelope.payload, 'payload');

  const categoriesRaw = envelope.payload && (payloadRecord.categories as unknown);
  if (!Array.isArray(categoriesRaw)) {
    throw new BackupValidationError('备份数据无效', { details: 'payload.categories 必须是数组' });
  }

  const categories = categoriesRaw.map((item, index) => {
    const row = assertRecord(item, `payload.categories[${index}]`);
    return {
      externalId: normalizeExternalId(assertString(row.externalId, `payload.categories[${index}].externalId`)),
      name: assertString(row.name, `payload.categories[${index}].name`),
      color: assertString(row.color, `payload.categories[${index}].color`),
      sortOrder: assertNumber(row.sortOrder, `payload.categories[${index}].sortOrder`),
      createdAt: assertString(row.createdAt, `payload.categories[${index}].createdAt`),
    };
  });

  const tagsRaw = payloadRecord.tags;
  if (!Array.isArray(tagsRaw)) {
    throw new BackupValidationError('备份数据无效', { details: 'payload.tags 必须是数组' });
  }

  const tags = tagsRaw.map((item, index) => {
    const row = assertRecord(item, `payload.tags[${index}]`);
    return {
      externalId: normalizeExternalId(assertString(row.externalId, `payload.tags[${index}].externalId`)),
      name: assertString(row.name, `payload.tags[${index}].name`),
      color: assertString(row.color, `payload.tags[${index}].color`),
      icon: assertNullableString(row.icon, `payload.tags[${index}].icon`),
      categoryExternalId: assertNullableString(row.categoryExternalId, `payload.tags[${index}].categoryExternalId`),
      sortOrder: assertNumber(row.sortOrder, `payload.tags[${index}].sortOrder`),
      createdAt: assertString(row.createdAt, `payload.tags[${index}].createdAt`),
    };
  });

  const settingsRaw = assertRecord(payloadRecord.settings, 'payload.settings');
  const defaultTagExternalIds = normalizeStringArray(
    assertStringArray(settingsRaw.defaultTagExternalIds, 'payload.settings.defaultTagExternalIds')
  );

  const photoTagLinksRaw = payloadRecord.photoTagLinks;
  if (!Array.isArray(photoTagLinksRaw)) {
    throw new BackupValidationError('备份数据无效', { details: 'payload.photoTagLinks 必须是数组' });
  }

  const photoTagLinks = photoTagLinksRaw.map((item, index) => {
    const row = assertRecord(item, `payload.photoTagLinks[${index}]`);
    const hasNotesField = hasOwnField(row, 'notes');
    const normalizedNotes = hasNotesField
      ? normalizeEditableNotes(assertNullableString(row.notes, `payload.photoTagLinks[${index}].notes`))
      : undefined;
    if (hasNotesField) {
      const validation = validateNotesLength(normalizedNotes ?? null);
      if (!validation.valid) {
        throw new BackupValidationError('备份数据无效', {
          details: `payload.photoTagLinks[${index}].notes ${validation.message}`,
        });
      }
    }

    return {
      fingerprintMd5: assertNullableString(row.fingerprintMd5, `payload.photoTagLinks[${index}].fingerprintMd5`),
      fileSize: assertNumber(row.fileSize, `payload.photoTagLinks[${index}].fileSize`),
      sourceAssetId: assertNullableString(row.sourceAssetId, `payload.photoTagLinks[${index}].sourceAssetId`),
      takenDate: assertNullableString(row.takenDate, `payload.photoTagLinks[${index}].takenDate`),
      filename: assertString(row.filename, `payload.photoTagLinks[${index}].filename`),
      tagExternalIds: normalizeStringArray(
        assertStringArray(row.tagExternalIds, `payload.photoTagLinks[${index}].tagExternalIds`)
      ),
      ...(hasNotesField ? { notes: normalizedNotes ?? null } : {}),
    };
  });

  const statsRaw = assertRecord(payloadRecord.stats, 'payload.stats');
  const stats = {
    categoryCount: assertNumber(statsRaw.categoryCount, 'payload.stats.categoryCount'),
    tagCount: assertNumber(statsRaw.tagCount, 'payload.stats.tagCount'),
    linkCount: assertNumber(statsRaw.linkCount, 'payload.stats.linkCount'),
    generatedAt: assertString(statsRaw.generatedAt, 'payload.stats.generatedAt'),
  };

  return {
    format: BACKUP_FORMAT,
    formatVersion,
    createdAt,
    appSchemaVersion,
    checksumAlgorithm: 'sha256',
    payloadSha256,
    payload: {
      exportId: assertString(payloadRecord.exportId, 'payload.exportId'),
      categories,
      tags,
      settings: { defaultTagExternalIds },
      photoTagLinks,
      stats,
    },
  };
}

async function assertPayloadChecksum(payload: BackupPayload, expectedSha256: string): Promise<void> {
  const actual = (await sha256Hex(stableStringify(payload))).toLowerCase();
  if (actual !== expectedSha256.toLowerCase()) {
    throw new BackupValidationError('备份校验失败：数据载荷不匹配');
  }
}

async function resolveUniqueCategoryName(baseName: string): Promise<{ name: string; renamed: boolean }> {
  const repos = await getRepositories();
  const normalizedBase = normalizeName(baseName, '导入分类');
  let candidate = normalizedBase;
  let counter = 0;
  for (;;) {
    const existing = await repos.tagCategory.findByName(candidate);
    if (!existing) {
      return { name: candidate, renamed: counter > 0 };
    }
    counter += 1;
    candidate = counter === 1 ? `${normalizedBase}(导入)` : `${normalizedBase}(导入-${counter})`;
  }
}

export function __parseBackupEnvelopeForTest(raw: unknown): BackupEnvelope {
  return parseBackupEnvelope(raw);
}

async function resolveUniqueTagName(baseName: string): Promise<{ name: string; renamed: boolean }> {
  const repos = await getRepositories();
  const normalizedBase = normalizeName(baseName, '导入标签');
  let candidate = normalizedBase;
  let counter = 0;
  for (;;) {
    const existing = await repos.tag.findByName(candidate);
    if (!existing) {
      return { name: candidate, renamed: counter > 0 };
    }
    counter += 1;
    candidate = counter === 1 ? `${normalizedBase}(导入)` : `${normalizedBase}(导入-${counter})`;
  }
}

function createEmptyImportSummary(): ImportSummary {
  return {
    addedCategories: 0,
    mergedCategories: 0,
    mergedCategoriesByExternalId: 0,
    mergedCategoriesByName: 0,
    ambiguousCategoryNameCount: 0,
    renamedCategories: 0,
    addedTags: 0,
    mergedTags: 0,
    mergedTagsByExternalId: 0,
    mergedTagsByName: 0,
    ambiguousTagNameCount: 0,
    renamedTags: 0,
    overriddenDefaultTags: 0,
    processedPhotoLinks: 0,
    matchedPhotoLinks: 0,
    placeholderPhotos: 0,
    pendingPhotoLinks: 0,
    autoBackfillAttempted: false,
    autoBackfillBySourceMatched: 0,
    autoBackfillByFingerprintMatched: 0,
    autoBackfillCreatedPhotos: 0,
    autoBackfillSkippedNoPermission: 0,
    pendingReasons: {
      NOT_FOUND: 0,
      AMBIGUOUS: 0,
      MISSING_TAGS: 0,
    },
    renamedCategorySamples: [],
    renamedTagSamples: [],
    pendingSamples: [],
  };
}

function applyBackfillSummary(summary: ImportSummary, backfillSummary: BackfillSummary): void {
  summary.autoBackfillAttempted = summary.autoBackfillAttempted || backfillSummary.attempted;
  summary.autoBackfillBySourceMatched += backfillSummary.bySourceMatched;
  summary.autoBackfillByFingerprintMatched += backfillSummary.byFingerprintMatched;
  summary.autoBackfillCreatedPhotos += backfillSummary.createdPhotos;
  summary.autoBackfillSkippedNoPermission += backfillSummary.skippedNoPermission;
}

function estimateRemainingPending(summary: ImportSummary): number {
  return Math.max(
    0,
    summary.pendingPhotoLinks - summary.autoBackfillBySourceMatched - summary.autoBackfillByFingerprintMatched
  );
}

export interface ImportBackupOptions {
  autoBackfill?: boolean;
  maxScanAssets?: number;
  onProgress?: (progress: ImportProgressSnapshot) => void;
}

async function addPendingLink(
  reason: ImportPendingReason,
  row: {
    photoId?: number | null;
    fingerprintMd5: string | null;
    fileSize: number;
    sourceAssetId: string | null;
    takenDate: string | null;
    tagExternalIds: string[];
    notes?: string | null;
  },
  summary: ImportSummary
): Promise<void> {
  const repos = await getRepositories();
  const hasNotesField = hasOwnField(row as Record<string, unknown>, 'notes');
  const normalizedNotes = hasNotesField ? normalizeEditableNotes(row.notes ?? null) : null;
  const notesToken = encodePendingNotesToken(hasNotesField, normalizedNotes);
  const normalizedFingerprintMd5 = normalizeMd5(row.fingerprintMd5);
  const normalizedSourceAssetId = normalizeNonEmptyString(row.sourceAssetId);
  const normalizedTakenDate = normalizeNonEmptyString(row.takenDate);
  const normalizedTagExternalIds = normalizeStringArray(row.tagExternalIds).sort((a, b) => a.localeCompare(b));
  const safeFileSize = Number.isFinite(row.fileSize) ? Math.max(0, Math.floor(row.fileSize)) : 0;

  await repos.photo.createImportPendingPhotoTagLink({
    photo_id: row.photoId ?? null,
    fingerprint_md5: normalizedFingerprintMd5,
    file_size: safeFileSize,
    source_asset_id: normalizedSourceAssetId,
    taken_date: normalizedTakenDate,
    tag_external_ids_json: JSON.stringify(normalizedTagExternalIds),
    notes: notesToken,
    reason,
  });
  summary.pendingPhotoLinks += 1;
  summary.pendingReasons[reason] += 1;
  logImportDebug('pending_link_upserted', {
    reason,
    photoId: Number.isInteger(row.photoId) ? Math.floor(row.photoId as number) : null,
    fingerprintMd5: normalizedFingerprintMd5,
    fileSize: safeFileSize,
    sourceAssetId: normalizedSourceAssetId,
    takenDate: normalizedTakenDate,
    tagExternalIdCount: normalizedTagExternalIds.length,
    hasNotesField,
    pendingTotal: summary.pendingPhotoLinks,
    pendingNotFound: summary.pendingReasons.NOT_FOUND,
    pendingAmbiguous: summary.pendingReasons.AMBIGUOUS,
    pendingMissingTags: summary.pendingReasons.MISSING_TAGS,
  });
  if (summary.pendingSamples.length < 5) {
    summary.pendingSamples.push({
      reason,
      photoId: Number.isInteger(row.photoId) ? Math.floor(row.photoId as number) : null,
      fingerprintMd5: normalizedFingerprintMd5,
      sourceAssetId: normalizedSourceAssetId,
    });
  }
}

async function clearLocalDataForOverwriteImport(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  await db.execAsync(`
    DELETE FROM photo_tags;
    DELETE FROM photo_default_tag_pending;
    DELETE FROM import_pending_photo_tag_links;
    DELETE FROM photos;
    DELETE FROM tags;
    DELETE FROM tag_categories;
  `);
}

function buildCategoryPayload(categories: TagCategoryRow[]): BackupPayload['categories'] {
  return categories
    .filter((row) => typeof row.external_id === 'string' && row.external_id.length > 0)
    .map((row) => ({
      externalId: row.external_id as string,
      name: row.name,
      color: row.color,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    }));
}

function buildTagPayload(tags: TagRow[]): BackupPayload['tags'] {
  return tags
    .filter((row) => typeof row.external_id === 'string' && row.external_id.length > 0)
    .map((row) => ({
      externalId: row.external_id as string,
      name: row.name,
      color: row.color,
      icon: row.icon,
      categoryExternalId: null,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    }));
}

export async function exportBackupJson(): Promise<{ uri: string; filename: string; summary: ExportSummary }> {
  const repos = await getRepositories();

  const [categories, tags, rawDefaultTagIds, joinedRows, rawSchemaVersion] = await Promise.all([
    repos.tagCategory.findAll({ limit: 10000 }),
    repos.tag.findAll({ limit: 10000 }),
    repos.settings.get(KV_DEFAULT_TAG_IDS),
    repos.photo.getTaggedPhotoLinksForBackup(),
    repos.settings.get(KV_SCHEMA_VERSION),
  ]);

  const categoryPayload = buildCategoryPayload(categories);
  const tagPayload = buildTagPayload(tags);
  const categoryExternalIdById = new Map(
    categories
      .filter((row) => typeof row.external_id === 'string' && row.external_id.length > 0)
      .map((row) => [row.id, row.external_id as string])
  );
  for (const tag of tagPayload) {
    const rawTag = tags.find((row) => row.external_id === tag.externalId);
    tag.categoryExternalId = rawTag?.category_id != null ? categoryExternalIdById.get(rawTag.category_id) ?? null : null;
  }

  const tagExternalIdById = new Map(
    tags
      .filter((row) => typeof row.external_id === 'string' && row.external_id.length > 0)
      .map((row) => [row.id, row.external_id as string])
  );

  const defaultTagIds = parseStoredDefaultTagIds(rawDefaultTagIds);
  const defaultTagExternalIds = normalizeStringArray(
    defaultTagIds
      .map((tagId) => tagExternalIdById.get(tagId) ?? null)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  );

  const linksByPhotoId = new Map<
    number,
    {
      fingerprintMd5: string | null;
      fileSize: number;
      sourceAssetId: string | null;
      takenDate: string | null;
      filename: string;
      notes: string | null;
      tagExternalIds: Set<string>;
    }
  >();

  const hydratedSourceAssetIdByPhotoId = await hydrateMissingSourceAssetIdsForExport(joinedRows);

  for (const row of joinedRows) {
    const tagExternalId = typeof row.tag_id === 'number' ? tagExternalIdById.get(row.tag_id) : null;
    const sourceAssetId =
      normalizeNonEmptyString(row.source_asset_id) ?? hydratedSourceAssetIdByPhotoId.get(row.photo_id) ?? null;
    const notes = normalizeEditableNotes(row.notes);
    let target = linksByPhotoId.get(row.photo_id);
    if (!target) {
      target = {
        fingerprintMd5: row.fingerprint_md5,
        fileSize: row.file_size,
        sourceAssetId,
        takenDate: row.taken_date,
        filename: row.filename,
        notes,
        tagExternalIds: new Set<string>(),
      };
      linksByPhotoId.set(row.photo_id, target);
    }
    if (target.notes == null && notes != null) {
      target.notes = notes;
    }
    if (tagExternalId) {
      target.tagExternalIds.add(tagExternalId);
    }
  }

  const photoTagLinks = Array.from(linksByPhotoId.values()).map((row) => ({
    fingerprintMd5: row.fingerprintMd5,
    fileSize: row.fileSize,
    sourceAssetId: row.sourceAssetId,
    takenDate: row.takenDate,
    filename: row.filename,
    notes: row.notes,
    tagExternalIds: Array.from(row.tagExternalIds).sort((a, b) => a.localeCompare(b)),
  }));

  const now = new Date();
  const payload: BackupPayload = {
    exportId: `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`,
    categories: categoryPayload,
    tags: tagPayload,
    settings: {
      defaultTagExternalIds,
    },
    photoTagLinks,
    stats: {
      categoryCount: categoryPayload.length,
      tagCount: tagPayload.length,
      linkCount: photoTagLinks.length,
      generatedAt: now.toISOString(),
    },
  };

  const payloadSha256 = (await sha256Hex(stableStringify(payload))).toLowerCase();
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: now.toISOString(),
    appSchemaVersion: parseSchemaVersion(rawSchemaVersion),
    checksumAlgorithm: 'sha256',
    payloadSha256,
    payload,
  };

  const serialized = JSON.stringify(envelope, null, 2);
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDir) {
    throw new Error('没有可写的缓存或文档目录');
  }
  const filename = `pictag-data-${toBackupTimestamp(now)}.json`;
  const uri = `${baseDir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, serialized, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const summary: ExportSummary = {
    categoryCount: categoryPayload.length,
    tagCount: tagPayload.length,
    defaultTagCount: defaultTagExternalIds.length,
    photoLinkCount: photoTagLinks.length,
    payloadSha256,
  };

  return { uri, filename, summary };
}

export async function importBackupJsonFromUri(uri: string, options?: ImportBackupOptions): Promise<ImportSummary> {
  const normalizedUri = uri.trim();
  console.info(
    `${IMPORT_DEBUG_PREFIX} entry`,
    JSON.stringify({
      dev: __DEV__,
      uri: normalizedUri,
      autoBackfill: options?.autoBackfill === true,
      maxScanAssets: options?.maxScanAssets ?? null,
      progressCallback: typeof options?.onProgress === 'function',
    })
  );
  logImportDebug('start', {
    uri: normalizedUri,
    autoBackfill: options?.autoBackfill === true,
    maxScanAssets: options?.maxScanAssets ?? null,
    progressCallback: typeof options?.onProgress === 'function',
  });
  if (!normalizedUri) {
    logImportDebug('invalid_uri', { uri });
    throw new BackupValidationError('导入地址为空');
  }

  const latestProgressSnapshotRef: { current: ImportProgressSnapshot | null } = { current: null };
  const emitProgress = createImportProgressEmitter((progress) => {
    latestProgressSnapshotRef.current = progress;
    options?.onProgress?.(progress);
  });
  emitProgress('reading_backup', 0, 1, undefined, true);

  const rawText = await FileSystem.readAsStringAsync(normalizedUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  emitProgress('reading_backup', 1, 1, undefined, true);
  emitProgress('validating_backup', 0, 1, undefined, true);
  logImportDebug('file_read', {
    uri: normalizedUri,
    sizeChars: rawText.length,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (error) {
    logImportDebug('json_parse_failed', {
      uri: normalizedUri,
      error: formatDebugError(error),
    });
    throw new BackupValidationError('备份文件不是有效的备份数据格式');
  }

  logImportDebug('json_parse_succeeded');

  let envelope: BackupEnvelope;
  try {
    envelope = parseBackupEnvelope(parsed);
  } catch (error) {
    logImportDebug('envelope_validate_failed', {
      uri: normalizedUri,
      error: formatDebugError(error),
    });
    throw error;
  }
  logImportDebug('envelope_validated', {
    formatVersion: envelope.formatVersion,
    createdAt: envelope.createdAt,
    appSchemaVersion: envelope.appSchemaVersion,
    categoryCount: envelope.payload.categories.length,
    tagCount: envelope.payload.tags.length,
    photoLinkCount: envelope.payload.photoTagLinks.length,
    defaultTagExternalIdCount: envelope.payload.settings.defaultTagExternalIds.length,
  });

  try {
    await assertPayloadChecksum(envelope.payload, envelope.payloadSha256);
  } catch (error) {
    logImportDebug('checksum_failed', {
      payloadSha256: envelope.payloadSha256,
      error: formatDebugError(error),
    });
    throw error;
  }
  emitProgress('validating_backup', 1, 1, undefined, true);
  logImportDebug('checksum_verified', { payloadSha256: envelope.payloadSha256 });

  const summary = createEmptyImportSummary();
  const db = await getDb();
  const totalPhotoLinks = envelope.payload.photoTagLinks.length;
  emitProgress(
    'rebuilding_placeholders',
    0,
    totalPhotoLinks,
    {
      matched: summary.matchedPhotoLinks,
      remainingPending: summary.pendingPhotoLinks,
    },
    true
  );

  logImportDebug('transaction_begin');
  await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
    const repos = await getRepositories();
    logImportDebug('transaction_opened');
    await clearLocalDataForOverwriteImport(db);
    logImportDebug('overwrite_local_data_cleared');

    const categoryLocalIdByExternalId = new Map<string, number>();
    for (const [categoryIndex, incoming] of envelope.payload.categories.entries()) {
      if (!incoming.externalId) {
        throw new BackupValidationError('分类外部编号不能为空');
      }

      const existing = await repos.tagCategory.findByExternalId(incoming.externalId);
      if (existing) {
        await repos.tagCategory.update(existing.id, {
          name: normalizeName(incoming.name, existing.name),
          color: incoming.color,
          sort_order: Math.floor(incoming.sortOrder),
          external_id: incoming.externalId,
        });
        categoryLocalIdByExternalId.set(incoming.externalId, existing.id);
        summary.mergedCategories += 1;
        summary.mergedCategoriesByExternalId += 1;
        logImportDebug('category_merged_by_external_id', {
          index: categoryIndex,
          externalId: incoming.externalId,
          targetId: existing.id,
          name: incoming.name,
        });
        continue;
      }

      const sameNameCategories = await repos.tagCategory.findCategoriesByName(incoming.name);
      if (sameNameCategories.length === 1) {
        const reused = sameNameCategories[0];
        await repos.tagCategory.update(reused.id, {
          name: normalizeName(incoming.name, reused.name),
          color: incoming.color,
          sort_order: Math.floor(incoming.sortOrder),
          external_id: incoming.externalId,
        });
        categoryLocalIdByExternalId.set(incoming.externalId, reused.id);
        summary.mergedCategories += 1;
        summary.mergedCategoriesByName += 1;
        logImportDebug('category_merged_by_name', {
          index: categoryIndex,
          externalId: incoming.externalId,
          targetId: reused.id,
          name: incoming.name,
        });
        continue;
      }
      if (sameNameCategories.length > 1) {
        summary.ambiguousCategoryNameCount += 1;
        logImportDebug('category_name_ambiguous', {
          index: categoryIndex,
          externalId: incoming.externalId,
          name: incoming.name,
          candidateCount: sameNameCategories.length,
        });
      }

      const uniqueName = await resolveUniqueCategoryName(incoming.name);
      const created = await repos.tagCategory.create({
        name: uniqueName.name,
        color: incoming.color,
        sort_order: Math.floor(incoming.sortOrder),
        external_id: incoming.externalId,
      });
      categoryLocalIdByExternalId.set(incoming.externalId, created.id);
      summary.addedCategories += 1;
      if (uniqueName.renamed) {
        summary.renamedCategories += 1;
        if (summary.renamedCategorySamples.length < 5) {
          summary.renamedCategorySamples.push({ from: incoming.name, to: uniqueName.name });
        }
      }
      logImportDebug('category_created', {
        index: categoryIndex,
        externalId: incoming.externalId,
        targetId: created.id,
        originalName: incoming.name,
        finalName: uniqueName.name,
        renamed: uniqueName.renamed,
      });
    }
    logImportDebug('categories_stage_done', {
      added: summary.addedCategories,
      merged: summary.mergedCategories,
      mergedByExternalId: summary.mergedCategoriesByExternalId,
      mergedByName: summary.mergedCategoriesByName,
      ambiguousNameCount: summary.ambiguousCategoryNameCount,
      renamed: summary.renamedCategories,
    });

    const tagLocalIdByExternalId = new Map<string, number>();
    for (const [tagIndex, incoming] of envelope.payload.tags.entries()) {
      if (!incoming.externalId) {
        throw new BackupValidationError('标签外部编号不能为空');
      }

      const resolvedCategoryId = incoming.categoryExternalId
        ? (categoryLocalIdByExternalId.get(incoming.categoryExternalId) ?? null)
        : null;

      const existing = await repos.tag.findByExternalId(incoming.externalId);
      if (existing) {
        await repos.tag.update(existing.id, {
          name: normalizeName(incoming.name, existing.name),
          color: incoming.color,
          icon: incoming.icon,
          category_id: resolvedCategoryId,
          sort_order: Math.floor(incoming.sortOrder),
          external_id: incoming.externalId,
        });
        tagLocalIdByExternalId.set(incoming.externalId, existing.id);
        summary.mergedTags += 1;
        summary.mergedTagsByExternalId += 1;
        logImportDebug('tag_merged_by_external_id', {
          index: tagIndex,
          externalId: incoming.externalId,
          targetId: existing.id,
          name: incoming.name,
          resolvedCategoryId,
        });
        continue;
      }

      const sameNameTags = await repos.tag.findTagsByName(incoming.name, resolvedCategoryId);
      if (sameNameTags.length === 1) {
        const reused = sameNameTags[0];
        await repos.tag.update(reused.id, {
          name: normalizeName(incoming.name, reused.name),
          color: incoming.color,
          icon: incoming.icon,
          category_id: resolvedCategoryId,
          sort_order: Math.floor(incoming.sortOrder),
          external_id: incoming.externalId,
        });
        tagLocalIdByExternalId.set(incoming.externalId, reused.id);
        summary.mergedTags += 1;
        summary.mergedTagsByName += 1;
        logImportDebug('tag_merged_by_name', {
          index: tagIndex,
          externalId: incoming.externalId,
          targetId: reused.id,
          name: incoming.name,
          resolvedCategoryId,
        });
        continue;
      }
      if (sameNameTags.length > 1) {
        summary.ambiguousTagNameCount += 1;
        logImportDebug('tag_name_ambiguous', {
          index: tagIndex,
          externalId: incoming.externalId,
          name: incoming.name,
          resolvedCategoryId,
          candidateCount: sameNameTags.length,
        });
      }

      const uniqueName = await resolveUniqueTagName(incoming.name);
      const created = await repos.tag.create({
        name: uniqueName.name,
        color: incoming.color,
        icon: incoming.icon,
        category_id: resolvedCategoryId,
        sort_order: Math.floor(incoming.sortOrder),
        external_id: incoming.externalId,
      });
      tagLocalIdByExternalId.set(incoming.externalId, created.id);
      summary.addedTags += 1;
      if (uniqueName.renamed) {
        summary.renamedTags += 1;
        if (summary.renamedTagSamples.length < 5) {
          summary.renamedTagSamples.push({ from: incoming.name, to: uniqueName.name });
        }
      }
      logImportDebug('tag_created', {
        index: tagIndex,
        externalId: incoming.externalId,
        targetId: created.id,
        originalName: incoming.name,
        finalName: uniqueName.name,
        resolvedCategoryId,
        renamed: uniqueName.renamed,
      });
    }
    logImportDebug('tags_stage_done', {
      added: summary.addedTags,
      merged: summary.mergedTags,
      mergedByExternalId: summary.mergedTagsByExternalId,
      mergedByName: summary.mergedTagsByName,
      ambiguousNameCount: summary.ambiguousTagNameCount,
      renamed: summary.renamedTags,
    });

    const importedDefaultTagIds = envelope.payload.settings.defaultTagExternalIds
      .map((externalId) => tagLocalIdByExternalId.get(externalId) ?? null)
      .filter((tagId): tagId is number => typeof tagId === 'number' && tagId > 0);
    const overwrittenDefaults = Array.from(new Set(importedDefaultTagIds)).sort((a, b) => a - b);
    await repos.settings.set(KV_DEFAULT_TAG_IDS, JSON.stringify(overwrittenDefaults));
    summary.overriddenDefaultTags = overwrittenDefaults.length;
    logImportDebug('default_tags_overwritten', {
      importedExternalIdCount: envelope.payload.settings.defaultTagExternalIds.length,
      overwrittenCount: overwrittenDefaults.length,
      overwrittenSamples: overwrittenDefaults.slice(0, 10),
    });

    for (const [linkIndex, link] of envelope.payload.photoTagLinks.entries()) {
      summary.processedPhotoLinks += 1;

      const normalizedTagExternalIds = normalizeStringArray(link.tagExternalIds);
      const hasNotesField = hasOwnField(link as unknown as Record<string, unknown>, 'notes');
      const normalizedLinkNotes = hasNotesField ? normalizeEditableNotes(link.notes ?? null) : null;
      const normalizedSourceAssetId = normalizeNonEmptyString(link.sourceAssetId);
      const normalizedTakenDate = normalizeNonEmptyString(link.takenDate);
      const normalizedFingerprintMd5 = normalizeMd5(link.fingerprintMd5);
      const safeFileSize = Number.isFinite(link.fileSize) ? Math.max(0, Math.floor(link.fileSize)) : 0;
      const normalizedFilename = normalizeName(link.filename, 'imported-placeholder.jpg');
      logImportDebug('photo_link_start', {
        index: linkIndex,
        sourceAssetId: normalizedSourceAssetId,
        fingerprintMd5: normalizedFingerprintMd5,
        fileSize: safeFileSize,
        tagExternalIdCount: normalizedTagExternalIds.length,
        hasNotesField,
      });

      const createdPhoto = await repos.photo.create({
        uri: '',
        filename: normalizedFilename,
        width: 0,
        height: 0,
        file_size: safeFileSize,
        taken_date: normalizedTakenDate,
        notes: hasNotesField ? normalizedLinkNotes : null,
        source_asset_id: normalizedSourceAssetId,
        source_provider: 'unknown',
        fingerprint_status: normalizedFingerprintMd5 ? 'ready' : 'not_requested',
      });
      summary.placeholderPhotos += 1;
      if (normalizedFingerprintMd5) {
        await repos.photo.updateFingerprintState(createdPhoto.id, {
          fingerprint_status: 'ready',
          fingerprint_md5: normalizedFingerprintMd5,
          fingerprint_algo: 'md5',
          fingerprint_version: PHOTO_FINGERPRINT_VERSION,
          fingerprint_updated_at: new Date().toISOString(),
          fingerprint_error: null,
        });
      }

      const localTagIds =
        normalizedTagExternalIds.length === 0
          ? []
          : normalizedTagExternalIds
              .map((externalId) => tagLocalIdByExternalId.get(externalId) ?? null)
              .filter((tagId): tagId is number => typeof tagId === 'number' && tagId > 0);
      const missingTagExternalIds = normalizedTagExternalIds.filter(
        (externalId) => !tagLocalIdByExternalId.has(externalId)
      );
      if (normalizedTagExternalIds.length > 0 && localTagIds.length !== normalizedTagExternalIds.length) {
        logImportDebug('photo_link_missing_tags', {
          index: linkIndex,
          photoId: createdPhoto.id,
          missingTagExternalIds,
          expectedTagExternalIdCount: normalizedTagExternalIds.length,
          resolvedTagIdCount: localTagIds.length,
        });
        await addPendingLink(
          'MISSING_TAGS',
          {
            ...link,
            photoId: createdPhoto.id,
            fingerprintMd5: normalizedFingerprintMd5,
            fileSize: safeFileSize,
            sourceAssetId: normalizedSourceAssetId,
            takenDate: normalizedTakenDate,
          },
          summary
        );
      }

      const existingTagIds = new Set(await repos.photo.getTagIds(createdPhoto.id));
      for (const tagId of localTagIds) {
        if (existingTagIds.has(tagId)) continue;
        await repos.photo.addTag(createdPhoto.id, tagId);
      }

      await addPendingLink(
        'NOT_FOUND',
        {
          ...link,
          photoId: createdPhoto.id,
          fingerprintMd5: normalizedFingerprintMd5,
          fileSize: safeFileSize,
          sourceAssetId: normalizedSourceAssetId,
          takenDate: normalizedTakenDate,
        },
        summary
      );

      emitProgress('rebuilding_placeholders', summary.processedPhotoLinks, totalPhotoLinks, {
        matched: summary.matchedPhotoLinks,
        remainingPending: summary.pendingPhotoLinks,
      });
    }
    emitProgress(
      'rebuilding_placeholders',
      totalPhotoLinks,
      totalPhotoLinks,
      {
        matched: summary.matchedPhotoLinks,
        remainingPending: summary.pendingPhotoLinks,
      },
      true
    );
    logImportDebug('photo_links_stage_done', {
      processed: summary.processedPhotoLinks,
      matched: summary.matchedPhotoLinks,
      placeholders: summary.placeholderPhotos,
      pending: summary.pendingPhotoLinks,
      pendingNotFound: summary.pendingReasons.NOT_FOUND,
      pendingAmbiguous: summary.pendingReasons.AMBIGUOUS,
      pendingMissingTags: summary.pendingReasons.MISSING_TAGS,
    });

    await db.execAsync('COMMIT');
    logImportDebug('transaction_commit', {
      processedPhotoLinks: summary.processedPhotoLinks,
      matchedPhotoLinks: summary.matchedPhotoLinks,
      placeholderPhotos: summary.placeholderPhotos,
      pendingPhotoLinks: summary.pendingPhotoLinks,
    });
  } catch (error) {
    await db.execAsync('ROLLBACK');
    logImportDebug('transaction_rollback', {
      error: formatDebugError(error),
    });
    throw error;
  }

  if (options?.autoBackfill && summary.pendingReasons.NOT_FOUND > 0) {
    const pendingNotFound = summary.pendingReasons.NOT_FOUND;
    logImportDebug('auto_backfill_start', {
      pendingNotFound,
      maxScanAssets: options.maxScanAssets ?? null,
    });
    try {
      emitProgress(
        'auto_backfill_fingerprint',
        0,
        null,
        {
          matched: summary.autoBackfillBySourceMatched + summary.autoBackfillByFingerprintMatched,
          totalMatched: summary.autoBackfillBySourceMatched + summary.autoBackfillByFingerprintMatched,
          scanTotalAssets: null,
          scanScannedAssets: 0,
          scanCapAssets: options.maxScanAssets ?? null,
          scanStageMatched: summary.autoBackfillByFingerprintMatched,
          remainingPending: estimateRemainingPending(summary),
        },
        true
      );

      const backfillSummary = await runPostImportAutoBackfill({
        maxScanAssets: options.maxScanAssets,
        onProgress: (progress) => {
          latestProgressSnapshotRef.current = progress as unknown as ImportProgressSnapshot;
          emitProgress('auto_backfill_fingerprint', progress.totalScannedAssets, progress.totalAssets, {
            matched: progress.totalMatched,
            totalMatched: progress.totalMatched,
            scanTotalAssets: progress.totalAssets,
            scanScannedAssets: progress.totalScannedAssets,
            scanCapAssets: options.maxScanAssets ?? null,
            scanStageMatched: progress.totalFingerprintMatched,
            remainingPending: progress.remainingPending,
          });
        },
      });
      applyBackfillSummary(summary, backfillSummary);
      emitProgress(
        'auto_backfill_fingerprint',
        backfillSummary.scannedAssets,
        null,
        {
          matched: summary.autoBackfillBySourceMatched + summary.autoBackfillByFingerprintMatched,
          totalMatched: summary.autoBackfillBySourceMatched + summary.autoBackfillByFingerprintMatched,
          scanTotalAssets: null,
          scanScannedAssets: backfillSummary.scannedAssets,
          scanCapAssets: options.maxScanAssets ?? null,
          scanStageMatched: summary.autoBackfillByFingerprintMatched,
          remainingPending: estimateRemainingPending(summary),
        },
        true
      );
      logImportDebug('auto_backfill_done', {
        bySourceMatched: backfillSummary.bySourceMatched,
        byFingerprintMatched: backfillSummary.byFingerprintMatched,
        createdPhotos: backfillSummary.createdPhotos,
        skippedNoPermission: backfillSummary.skippedNoPermission,
        remainingPending: backfillSummary.remainingPending,
        scannedAssets: backfillSummary.scannedAssets,
      });
    } catch (error) {
      summary.autoBackfillAttempted = true;
      logImportDebug('auto_backfill_failed', {
        error: formatDebugError(error),
      });
    }
  } else {
    logImportDebug('auto_backfill_skipped', {
      enabled: options?.autoBackfill === true,
      pendingNotFound: summary.pendingReasons.NOT_FOUND,
    });
  }
  emitProgress(
    'finalizing',
    0,
    1,
    {
      matched: summary.autoBackfillBySourceMatched + summary.autoBackfillByFingerprintMatched,
      remainingPending: estimateRemainingPending(summary),
    },
    true
  );
  emitProgress(
    'finalizing',
    1,
    1,
    {
      matched: summary.autoBackfillBySourceMatched + summary.autoBackfillByFingerprintMatched,
      remainingPending: estimateRemainingPending(summary),
    },
    true
  );

  logImportDebug('finish', {
    addedCategories: summary.addedCategories,
    mergedCategories: summary.mergedCategories,
    addedTags: summary.addedTags,
    mergedTags: summary.mergedTags,
    processedPhotoLinks: summary.processedPhotoLinks,
    matchedPhotoLinks: summary.matchedPhotoLinks,
    placeholderPhotos: summary.placeholderPhotos,
    pendingPhotoLinks: summary.pendingPhotoLinks,
    pendingReasons: summary.pendingReasons,
    autoBackfillAttempted: summary.autoBackfillAttempted,
    autoBackfillBySourceMatched: summary.autoBackfillBySourceMatched,
    autoBackfillByFingerprintMatched: summary.autoBackfillByFingerprintMatched,
    autoBackfillCreatedPhotos: summary.autoBackfillCreatedPhotos,
    autoBackfillSkippedNoPermission: summary.autoBackfillSkippedNoPermission,
  });
  return summary;
}
