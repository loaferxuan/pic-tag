import * as Crypto from 'expo-crypto';

export const PHOTO_FINGERPRINT_VERSION = 2;

const MISSING_FILENAME_TOKEN = '__missing_filename__';

export interface PhotoFingerprintV2Input {
  capturedAtUnixSec?: number | null;
  fileName?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
}

function normalizeInteger(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return Math.floor(value);
}

function normalizeCapturedAtUnixSec(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function normalizeFileNameToken(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function resolveTimeToken(input: PhotoFingerprintV2Input): string {
  const capturedAtUnixSec = normalizeCapturedAtUnixSec(input.capturedAtUnixSec);
  if (capturedAtUnixSec != null) {
    return String(capturedAtUnixSec);
  }

  return normalizeFileNameToken(input.fileName) ?? MISSING_FILENAME_TOKEN;
}

export function buildPhotoFingerprintV2Seed(input: PhotoFingerprintV2Input): string {
  const token = encodeURIComponent(resolveTimeToken(input));
  const fileSize = normalizeInteger(input.fileSize);
  const width = normalizeInteger(input.width);
  const height = normalizeInteger(input.height);
  return `v2|t=${token}|s=${fileSize}|w=${width}|h=${height}`;
}

export async function buildPhotoFingerprintV2Md5(input: PhotoFingerprintV2Input): Promise<string> {
  const seed = buildPhotoFingerprintV2Seed(input);
  const md5 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, seed, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  return md5.toLowerCase();
}
