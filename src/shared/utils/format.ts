import { format as fnsFormat, formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

const STORED_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseStoredDate(value: string): Date | null {
  const matched = value.match(STORED_DATE_RE);
  if (!matched) return null;

  const [, y, mo, d] = matched;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function formatDate(iso: string, fmt = 'yyyy-MM-dd'): string {
  try {
    const storedDate = parseStoredDate(iso);
    if (storedDate) {
      return fnsFormat(storedDate, fmt, { locale: zhCN });
    }
    return fnsFormat(new Date(iso), fmt, { locale: zhCN });
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: zhCN });
  } catch {
    return iso;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toDateFromStoredDate(stored: string | null | undefined): Date | null {
  if (!stored) return null;
  const exactDate = parseStoredDate(stored);
  if (exactDate) return exactDate;

  const parsed = new Date(stored);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
}

export function toStoredDate(date: Date): string {
  return fnsFormat(date, 'yyyy-MM-dd');
}
