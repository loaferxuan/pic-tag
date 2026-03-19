import { getRepositories } from '@/infra/db';
import { readCapturedAtUnixSecFromUri } from '@/features/photo/services/photo-exif-reader.service';
import { resolvePendingForPhoto } from '@/features/photo/services/import-pending-resolver.service';
import { buildPhotoFingerprintV2Md5, PHOTO_FINGERPRINT_VERSION } from './photo-fingerprint-v2.service';

const BOOTSTRAP_LIMIT = 200;
const AUTO_RUN_LIMIT = Number.MAX_SAFE_INTEGER;

const queue: number[] = [];
const queuedPhotoIds = new Set<number>();
let workerRunning = false;

class FingerprintComputationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function popNextPhotoId(): number | null {
  const next = queue.shift();
  if (next === undefined) return null;
  queuedPhotoIds.delete(next);
  return next;
}

function enqueueInternal(photoId: number): void {
  if (!Number.isInteger(photoId) || photoId <= 0) return;
  if (queuedPhotoIds.has(photoId)) return;
  queuedPhotoIds.add(photoId);
  queue.push(photoId);
}

function normalizeCapturedAtUnixSec(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

async function tryResolveCapturedAtUnixSecFromUri(uri: string): Promise<number | null> {
  const normalizedUri = uri.trim();
  if (!normalizedUri) return null;
  return readCapturedAtUnixSecFromUri(normalizedUri);
}

function resolveFailureCode(error: unknown): string {
  if (error instanceof FingerprintComputationError) {
    return error.code;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('permission')) return 'URI_PERMISSION_DENIED';
    if (message.includes('not found') || message.includes('does not exist')) return 'URI_NOT_FOUND';
    if (message.includes('unavailable')) return 'FS_UNAVAILABLE';
  }
  return 'FINGERPRINT_CALCULATION_FAILED';
}

async function processFingerprint(photoId: number): Promise<void> {
  const repos = await getRepositories();
  const photo = await repos.photo.findById(photoId);
  if (!photo) return;

  if (
    photo.fingerprint_md5 &&
    photo.fingerprint_status === 'ready' &&
    photo.fingerprint_version >= PHOTO_FINGERPRINT_VERSION
  ) {
    await resolvePendingForPhoto(photoId);
    return;
  }

  try {
    let capturedAtUnixSec = normalizeCapturedAtUnixSec(photo.captured_at_unix_sec);
    if (capturedAtUnixSec == null && typeof photo.uri === 'string' && photo.uri.trim().length > 0) {
      const resolved = await tryResolveCapturedAtUnixSecFromUri(photo.uri);
      if (resolved != null) {
        capturedAtUnixSec = resolved;
        await repos.photo.updateMediaReference(photoId, {
          captured_at_unix_sec: resolved,
        });
      }
    }

    const md5 = await buildPhotoFingerprintV2Md5({
      capturedAtUnixSec,
      fileName: photo.filename,
      fileSize: photo.file_size,
      width: photo.width,
      height: photo.height,
    });

    const now = new Date().toISOString();
    await repos.photo.updateFingerprintState(photoId, {
      fingerprint_status: 'ready',
      fingerprint_md5: md5,
      fingerprint_algo: 'md5',
      fingerprint_version: PHOTO_FINGERPRINT_VERSION,
      fingerprint_updated_at: now,
      fingerprint_error: null,
    });

    await resolvePendingForPhoto(photoId);
  } catch (error) {
    const code = resolveFailureCode(error);
    await repos.photo.updateFingerprintState(photoId, {
      fingerprint_status: 'failed',
      fingerprint_error: code,
      fingerprint_updated_at: new Date().toISOString(),
    });
  }
}

export function enqueueFingerprint(photoId: number): void {
  enqueueInternal(photoId);
  void runFingerprintWorker(AUTO_RUN_LIMIT);
}

export async function startFingerprintBootstrap(): Promise<void> {
  const repos = await getRepositories();
  const pendingRows = await repos.photo.findPendingFingerprintPhotos(BOOTSTRAP_LIMIT);
  for (const row of pendingRows) {
    enqueueInternal(row.id);
  }
  if (pendingRows.length > 0) {
    void runFingerprintWorker(AUTO_RUN_LIMIT);
  }
}

export async function runFingerprintWorker(maxItems = 1): Promise<number> {
  const safeLimit = Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : 1;
  if (workerRunning) return 0;

  workerRunning = true;
  let processed = 0;
  try {
    while (processed < safeLimit) {
      const photoId = popNextPhotoId();
      if (photoId == null) break;
      await processFingerprint(photoId);
      processed += 1;
    }
  } finally {
    workerRunning = false;
  }

  if (queue.length > 0) {
    void runFingerprintWorker(AUTO_RUN_LIMIT);
  }

  return processed;
}