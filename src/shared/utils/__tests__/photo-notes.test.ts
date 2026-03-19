import {
  decodePendingNotesToken,
  encodePendingNotesToken,
  normalizeEditableNotes,
  validateNotesLength,
} from '@/shared/utils/photo-notes';
import { PHOTO_NOTES_MAX_LENGTH } from '@/shared/constants';

describe('photo notes utils', () => {
  it('normalizes editable notes', () => {
    expect(normalizeEditableNotes('  hello  ')).toBe('hello');
    expect(normalizeEditableNotes('   ')).toBeNull();
  });

  it('validates notes length', () => {
    expect(validateNotesLength('ok')).toEqual({ valid: true });
    const longValue = 'a'.repeat(PHOTO_NOTES_MAX_LENGTH + 1);
    expect(validateNotesLength(longValue).valid).toBe(false);
  });

  it('encodes and decodes pending notes token', () => {
    expect(encodePendingNotesToken(false, 'x')).toBeNull();
    expect(encodePendingNotesToken(true, null)).toBe('');
    expect(encodePendingNotesToken(true, 'abc')).toBe('abc');

    expect(decodePendingNotesToken(null)).toEqual({ shouldUpdate: false, notes: null });
    expect(decodePendingNotesToken('')).toEqual({ shouldUpdate: true, notes: null });
    expect(decodePendingNotesToken('  abc  ')).toEqual({ shouldUpdate: true, notes: 'abc' });
  });
});
