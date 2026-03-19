import { buildSearchFilters } from '@/features/search/hooks/useSearch';

describe('buildSearchFilters', () => {
  it('uses onlyUntagged as a strict zero-tag filter and ignores selected tags', () => {
    const filters = buildSearchFilters({
      selectedTagIds: [3, 3, 4],
      tagMatchMode: 'OR',
      onlyUntagged: true,
      missingCategoryId: null,
      dateFrom: null,
      dateTo: null,
      onlyUnresolvedAssociation: false,
    });

    expect(filters).toEqual({
      onlyUntagged: true,
    });
  });

  it('preserves tag filters when onlyUntagged is disabled', () => {
    const filters = buildSearchFilters({
      selectedTagIds: [2, 2, 5],
      tagMatchMode: 'OR',
      onlyUntagged: false,
      missingCategoryId: 8,
      dateFrom: new Date('2026-03-01T00:00:00.000Z'),
      dateTo: new Date('2026-03-03T00:00:00.000Z'),
      onlyUnresolvedAssociation: true,
    });

    expect(filters).toEqual({
      tagIds: [2, 5],
      tagMatchMode: 'OR',
      missingCategoryId: 8,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-03',
      onlyUnresolvedAssociation: true,
    });
  });
});
