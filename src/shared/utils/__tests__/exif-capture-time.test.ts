import {
  extractCapturedAtUnixSecFromExif,
  parseCaptureTimeToUnixSeconds,
} from '@/shared/utils/exif-capture-time';

describe('exif capture time utils', () => {
  it('parses unix-like numeric text', () => {
    expect(parseCaptureTimeToUnixSeconds('1700000000')).toBe(1700000000);
  });

  it('parses exif datetime with timezone', () => {
    const result = parseCaptureTimeToUnixSeconds('2024:01:02 03:04:05+08:00');
    expect(result).not.toBeNull();
  });

  it('returns null for invalid capture time', () => {
    expect(parseCaptureTimeToUnixSeconds('2024-02-30 10:00:00')).toBeNull();
    expect(parseCaptureTimeToUnixSeconds('')).toBeNull();
  });

  it('extracts capture time from exif object', () => {
    const exif = {
      DateTimeOriginal: '2025:03:01 08:00:00',
      OffsetTimeOriginal: '+08:00',
    };
    const result = extractCapturedAtUnixSecFromExif(exif);
    expect(result).not.toBeNull();
  });
});
