const EXIF_CAPTURE_TIME_KEYS = [
  'DateTimeOriginal',
  'CreateDate',
  'ModifyDate',
  'DateTimeDigitized',
  'DateTime',
] as const;
const EXIF_CAPTURE_TIME_KEY_ALIASES = [
  'datetimeoriginal',
  'createdate',
  'modifydate',
  'datetimedigitized',
  'datetime',
] as const;
const EXIF_OFFSET_TIME_KEYS = ['OffsetTimeOriginal', 'OffsetTimeDigitized', 'OffsetTime'] as const;

const EXIF_OFFSET_TIME_KEY_BY_CAPTURE_KEY: Record<(typeof EXIF_CAPTURE_TIME_KEYS)[number], (typeof EXIF_OFFSET_TIME_KEYS)[number]> = {
  DateTimeOriginal: 'OffsetTimeOriginal',
  CreateDate: 'OffsetTimeDigitized',
  ModifyDate: 'OffsetTime',
  DateTimeDigitized: 'OffsetTimeDigitized',
  DateTime: 'OffsetTime',
};

const FLEXIBLE_TIME_RE =
  /^(\d{4})[-:/](\d{1,2})[-:/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,9}))?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/;

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeExifKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeToUnixSeconds(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalized = Math.floor(value);
  if (normalized >= 1_000_000_000_000) {
    return Math.floor(normalized / 1000);
  }
  return normalized;
}

function parseNumericLikeToUnixSeconds(raw: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  return normalizeToUnixSeconds(parsed);
}

function resolveCaptureKeyAlias(rawKey: string): (typeof EXIF_CAPTURE_TIME_KEYS)[number] | null {
  if (rawKey.includes('datetimeoriginal')) return 'DateTimeOriginal';
  if (rawKey.includes('createdate')) return 'CreateDate';
  if (rawKey.includes('modifydate')) return 'ModifyDate';
  if (rawKey.includes('datetimedigitized')) return 'DateTimeDigitized';
  if (rawKey.includes('datetime')) return 'DateTime';
  return null;
}

type CaptureTimeRawCandidate = {
  key: (typeof EXIF_CAPTURE_TIME_KEYS)[number];
  value: unknown;
  record: Record<string, unknown>;
};

function readCaptureTimeRawCandidate(exif: unknown): CaptureTimeRawCandidate | null {
  if (!exif || typeof exif !== 'object') return null;
  const record = exif as Record<string, unknown>;

  for (const key of EXIF_CAPTURE_TIME_KEYS) {
    const value = record[key];
    if (value != null) return { key, value, record };
  }

  const fallbackLookup = new Map<string, { key: string; value: unknown }>();
  for (const [key, value] of Object.entries(record)) {
    fallbackLookup.set(normalizeExifKey(key), { key, value });
  }
  for (const key of EXIF_CAPTURE_TIME_KEYS) {
    const fallback = fallbackLookup.get(normalizeExifKey(key));
    if (fallback && fallback.value != null) {
      return { key, value: fallback.value, record };
    }
  }

  for (const [key, fallback] of fallbackLookup.entries()) {
    if (!fallback || fallback.value == null) continue;
    const hit = EXIF_CAPTURE_TIME_KEY_ALIASES.some((alias) => key.includes(alias));
    if (!hit) continue;
    const resolvedKey = resolveCaptureKeyAlias(key);
    if (!resolvedKey) continue;
    return {
      key: resolvedKey,
      value: fallback.value,
      record,
    };
  }

  return null;
}

function readOffsetTimeText(
  record: Record<string, unknown>,
  captureKey: (typeof EXIF_CAPTURE_TIME_KEYS)[number]
): string | null {
  const fallbackLookup = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    fallbackLookup.set(normalizeExifKey(key), value);
  }

  const preferred: string[] = [
    EXIF_OFFSET_TIME_KEY_BY_CAPTURE_KEY[captureKey],
    ...EXIF_OFFSET_TIME_KEYS,
  ];

  for (const key of preferred) {
    const direct = record[key];
    if (typeof direct === 'string') {
      const normalized = normalizeNonEmptyString(direct);
      if (normalized) return normalized;
    }

    const fallback = fallbackLookup.get(normalizeExifKey(key));
    if (typeof fallback === 'string') {
      const normalized = normalizeNonEmptyString(fallback);
      if (normalized) return normalized;
    }
  }

  for (const [normalizedKey, value] of fallbackLookup.entries()) {
    if (typeof value !== 'string') continue;
    if (!normalizedKey.includes('offsettime')) continue;
    const normalized = normalizeNonEmptyString(value);
    if (normalized) return normalized;
  }

  return null;
}

function hasExplicitTimezoneSuffix(value: string): boolean {
  return /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim());
}

function readCaptureTimeText(exif: unknown): string | null {
  const candidate = readCaptureTimeRawCandidate(exif);
  if (!candidate || candidate.value == null) return null;

  const raw = candidate.value;
  let captureTimeText: string | null = null;

  if (typeof raw === 'number') {
    const normalized = normalizeToUnixSeconds(raw);
    return normalized == null ? null : String(normalized);
  }

  if (raw instanceof Date) {
    const normalized = normalizeToUnixSeconds(raw.getTime());
    return normalized == null ? null : String(normalized);
  }

  if (typeof raw === 'string') {
    const value = normalizeNonEmptyString(raw);
    if (value) captureTimeText = value;
  }
  if (!captureTimeText) return null;

  if (hasExplicitTimezoneSuffix(captureTimeText)) {
    return captureTimeText;
  }

  const offsetTimeText = readOffsetTimeText(candidate.record, candidate.key);
  if (offsetTimeText && !hasExplicitTimezoneSuffix(captureTimeText)) {
    captureTimeText = `${captureTimeText} ${offsetTimeText}`;
  }

  return captureTimeText;
}

function toMilliseconds(fractionalSeconds: string | undefined): number {
  if (!fractionalSeconds) return 0;
  const firstThree = fractionalSeconds.slice(0, 3).padEnd(3, '0');
  const parsed = Number(firstThree);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTimezoneOffsetMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.trim();
  if (!normalized) return null;
  if (normalized.toUpperCase() === 'Z') return 0;

  const matched = normalized.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!matched) return null;

  const hours = Number(matched[2]);
  const minutes = Number(matched[3]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;

  const totalMinutes = hours * 60 + minutes;
  return matched[1] === '+' ? totalMinutes : -totalMinutes;
}

function isValidDateParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): boolean {
  if (!Number.isInteger(year) || year <= 0) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return false;
  if (!Number.isInteger(second) || second < 0 || second > 59) return false;

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Number.isInteger(day) && day >= 1 && day <= maxDay;
}

export function parseCaptureTimeToUnixSeconds(raw: string): number | null {
  const normalized = raw.trim();
  if (!normalized) return null;

  const numericLike = parseNumericLikeToUnixSeconds(normalized);
  if (numericLike != null) return numericLike;

  const matched = normalized.match(FLEXIBLE_TIME_RE);
  if (matched) {
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    const hour = matched[4] == null ? 0 : Number(matched[4]);
    const minute = matched[5] == null ? 0 : Number(matched[5]);
    const second = matched[6] == null ? 0 : Number(matched[6]);
    const millisecond = toMilliseconds(matched[7]);
    const timezoneOffsetMinutes = parseTimezoneOffsetMinutes(matched[8]);

    if (!isValidDateParts(year, month, day, hour, minute, second)) {
      return null;
    }

    const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    const adjustedMillis =
      timezoneOffsetMinutes == null ? utcMillis : utcMillis - timezoneOffsetMinutes * 60 * 1000;
    return Number.isFinite(adjustedMillis) ? Math.floor(adjustedMillis / 1000) : null;
  }

  const hasExplicitTimezone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  if (!hasExplicitTimezone) return null;

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 1000);
}

export function extractCapturedAtUnixSecFromExif(exif: unknown): number | null {
  const captureTimeText = readCaptureTimeText(exif);
  if (!captureTimeText) return null;
  return parseCaptureTimeToUnixSeconds(captureTimeText);
}

export function extractCapturedAtUnixSecFromAssetInfo(assetInfo: unknown): number | null {
  if (!assetInfo || typeof assetInfo !== 'object') return null;
  const exif = (assetInfo as Record<string, unknown>).exif;
  return extractCapturedAtUnixSecFromExif(exif);
}
