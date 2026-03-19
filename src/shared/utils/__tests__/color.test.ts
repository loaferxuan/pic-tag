import {
  getContrastTextColor,
  hexToRgba,
  isValidHexColor,
  normalizeHexColor,
  sanitizeColorInput,
} from '@/shared/utils/color';

describe('color utils', () => {
  it('normalizes hex with and without hash', () => {
    expect(normalizeHexColor('ff00aa')).toBe('#FF00AA');
    expect(normalizeHexColor('#abc123')).toBe('#ABC123');
    expect(normalizeHexColor('bad', '#000000')).toBe('#000000');
  });

  it('validates hex color', () => {
    expect(isValidHexColor('#FFFFFF')).toBe(true);
    expect(isValidHexColor('#fff')).toBe(false);
    expect(isValidHexColor('')).toBe(false);
  });

  it('sanitizes free text color input', () => {
    expect(sanitizeColorInput('a1b2c3')).toBe('#A1B2C3');
    expect(sanitizeColorInput('#12xz')).toBe('#12');
  });

  it('returns rgba and readable contrast text', () => {
    expect(hexToRgba('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(getContrastTextColor('#FFFFFF')).toBe('#111827');
    expect(getContrastTextColor('#000000')).toBe('#FFFFFF');
  });
});
