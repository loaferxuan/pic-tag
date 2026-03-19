import { PHOTO_NOTES_MAX_LENGTH } from '@/shared/constants';

export function normalizeEditableNotes(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function validateNotesLength(value: string | null): { valid: true } | { valid: false; message: string } {
  if (value == null) return { valid: true };
  if (value.length <= PHOTO_NOTES_MAX_LENGTH) return { valid: true };
  return {
    valid: false,
    message: `Notes can be at most ${PHOTO_NOTES_MAX_LENGTH} characters`,
  };
}

export function encodePendingNotesToken(
  hasNotesField: boolean,
  normalizedNotes: string | null
): string | null {
  if (!hasNotesField) {
    return null;
  }
  if (normalizedNotes == null) {
    return '';
  }
  return normalizedNotes;
}

export function decodePendingNotesToken(
  token: string | null | undefined
): { shouldUpdate: boolean; notes: string | null } {
  if (token == null) {
    return { shouldUpdate: false, notes: null };
  }
  if (token.trim().length === 0) {
    return { shouldUpdate: true, notes: null };
  }
  return {
    shouldUpdate: true,
    notes: normalizeEditableNotes(token),
  };
}
