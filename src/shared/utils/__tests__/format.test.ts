import { toDateFromStoredDate, toStoredDate } from '@/shared/utils/format';

describe('format utils', () => {
  it('converts Date to stored date', () => {
    const date = new Date(2026, 2, 5);
    expect(toStoredDate(date)).toBe('2026-03-05');
  });

  it('parses stored date accurately', () => {
    const parsed = toDateFromStoredDate('2024-02-29');
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2024);
    expect(parsed?.getMonth()).toBe(1);
    expect(parsed?.getDate()).toBe(29);
  });

  it('falls back to native parse for non-strict date string', () => {
    expect(toDateFromStoredDate('2024-02-30')).not.toBeNull();
    expect(toDateFromStoredDate('bad-date')).toBeNull();
  });
});
