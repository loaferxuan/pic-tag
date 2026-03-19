import * as FileSystem from 'expo-file-system/legacy';
import { extractCapturedAtUnixSecFromExif } from '@/shared/utils/exif-capture-time';

const EXIF_CAPTURE_TIME_TAGS = [
  'DateTimeOriginal',
  'CreateDate',
  'ModifyDate',
  'DateTimeDigitized',
  'DateTime',
  'OffsetTimeOriginal',
  'OffsetTimeDigitized',
  'OffsetTime',
] as const;

type ExifObject = Record<string, unknown>;

type ExifrParser = {
  parse: (input: unknown, options?: Record<string, unknown>) => Promise<unknown>;
};

type ExifrModuleLike =
  | (Partial<ExifrParser> & { default?: Partial<ExifrParser> })
  | null
  | undefined;

let cachedExifrParser: ExifrParser | null | undefined;

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function ensureNavigatorUserAgent(): void {
  const navigatorLike = (globalThis as unknown as { navigator?: { userAgent?: unknown } }).navigator;
  if (!navigatorLike || typeof navigatorLike !== 'object') return;
  if (typeof navigatorLike.userAgent === 'string') return;

  try {
    Object.defineProperty(navigatorLike, 'userAgent', {
      value: 'ReactNative',
      configurable: true,
      writable: true,
    });
    return;
  } catch {
    // Fallback to direct assignment below.
  }

  try {
    (navigatorLike as { userAgent?: string }).userAgent = 'ReactNative';
  } catch {
    // Ignore when navigator is non-writable.
  }
}

async function getExifrParser(): Promise<ExifrParser | null> {
  if (cachedExifrParser !== undefined) {
    return cachedExifrParser;
  }

  try {
    ensureNavigatorUserAgent();
    // Avoid Expo async-require/importAll here. Metro may fail to resolve the
    // lazily imported `.cjs` chunk at runtime even though the module exists.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('exifr/dist/full.legacy.umd.js') as ExifrModuleLike;
    if (loaded && typeof loaded.parse === 'function') {
      cachedExifrParser = { parse: loaded.parse };
      return cachedExifrParser;
    }
    if (loaded?.default && typeof loaded.default.parse === 'function') {
      cachedExifrParser = { parse: loaded.default.parse };
      return cachedExifrParser;
    }
  } catch {
    // Fall through and cache the miss below.
  }

  cachedExifrParser = null;
  return cachedExifrParser;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const atobFn = (globalThis as { atob?: (input: string) => string }).atob;
  if (typeof atobFn !== 'function') {
    throw new Error('BASE64_DECODE_UNAVAILABLE');
  }

  const binary = atobFn(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 0xff;
  }
  return bytes;
}

async function parseExifFromUri(uri: string): Promise<ExifObject | null> {
  const normalizedUri = normalizeNonEmptyString(uri);
  if (!normalizedUri) return null;

  const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const normalizedBase64 = normalizeNonEmptyString(base64);
  if (!normalizedBase64) return null;

  const parser = await getExifrParser();
  if (!parser) return null;

  const bytes = decodeBase64ToBytes(normalizedBase64);
  const parsed = await parser.parse(bytes, {
    pick: EXIF_CAPTURE_TIME_TAGS,
    translateValues: false,
    reviveValues: false,
    mergeOutput: true,
    silentErrors: true,
  });

  if (!parsed || typeof parsed !== 'object') return null;
  return parsed as ExifObject;
}

export async function readCapturedAtUnixSecFromUri(uri: string): Promise<number | null> {
  try {
    const exif = await parseExifFromUri(uri);
    if (!exif) return null;
    return extractCapturedAtUnixSecFromExif(exif);
  } catch {
    return null;
  }
}
