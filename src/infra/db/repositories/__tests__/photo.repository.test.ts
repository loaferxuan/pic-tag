import { PhotoRepository } from '@/infra/db/repositories/photo.repository';

describe('PhotoRepository filter builder', () => {
  it('adds a zero-tag NOT EXISTS clause when onlyUntagged is enabled', () => {
    const repo = new PhotoRepository({} as never);

    const { whereClause, params } = (repo as any).buildFilterWhereClause({
      onlyUntagged: true,
    });

    expect(whereClause).toContain('NOT EXISTS');
    expect(whereClause).toContain('FROM photo_tags pt');
    expect(whereClause).toContain('pt.photo_id = photos.id');
    expect(params).toEqual([]);
  });

  it('combines onlyUntagged with other supported filters', () => {
    const repo = new PhotoRepository({} as never);

    const { whereClause, params } = (repo as any).buildFilterWhereClause({
      onlyUntagged: true,
      missingCategoryId: 11,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      onlyUnresolvedAssociation: true,
    });

    expect(whereClause).toContain('NOT EXISTS');
    expect(whereClause).toContain('t.category_id = ?');
    expect(whereClause).toContain('taken_date >= ?');
    expect(whereClause).toContain('taken_date <= ?');
    expect(whereClause).toContain("reason = 'NOT_FOUND'");
    expect(params).toEqual([11, '2026-03-01', '2026-03-31']);
  });

  it('does not add the zero-tag clause when onlyUntagged is disabled', () => {
    const repo = new PhotoRepository({} as never);

    const { whereClause } = (repo as any).buildFilterWhereClause({
      onlyUntagged: false,
    });

    expect(whereClause).toBe('');
  });

  it('adds a NOT EXISTS IN clause when excludedTagIds is provided', () => {
    const repo = new PhotoRepository({} as never);

    const { whereClause, params } = (repo as any).buildFilterWhereClause({
      excludedTagIds: [3, 5],
    });

    expect(whereClause).toContain('NOT EXISTS');
    expect(whereClause).toContain('FROM photo_tags pt');
    expect(whereClause).toContain('pt.photo_id = photos.id');
    expect(whereClause).toContain('pt.tag_id IN (?,?)');
    expect(params).toEqual([3, 5]);
  });

  it('combines included AND excluded tag clauses', () => {
    const repo = new PhotoRepository({} as never);

    const { whereClause, params } = (repo as any).buildFilterWhereClause({
      tagIds: [7],
      tagMatchMode: 'AND',
      excludedTagIds: [9, 10],
    });

    expect(whereClause).toContain('id IN (SELECT photo_id FROM photo_tags WHERE tag_id = ?)');
    expect(whereClause).toContain('pt.tag_id IN (?,?)');
    expect(params).toEqual([7, 9, 10]);
  });

  it('normalizes excludedTagIds (dedupes and drops invalid values)', () => {
    const repo = new PhotoRepository({} as never);

    const { whereClause, params } = (repo as any).buildFilterWhereClause({
      excludedTagIds: [3, 3, 0, -1, 5, Number.NaN],
    });

    expect(whereClause).toContain('pt.tag_id IN (?,?)');
    expect(params).toEqual([3, 5]);
  });

  it('omits the exclusion clause when excludedTagIds is empty or all invalid', () => {
    const repo = new PhotoRepository({} as never);

    const { whereClause: emptyClause } = (repo as any).buildFilterWhereClause({
      excludedTagIds: [],
    });
    expect(emptyClause).toBe('');

    const { whereClause: invalidClause, params: invalidParams } = (repo as any).buildFilterWhereClause({
      excludedTagIds: [0, -1, Number.NaN],
    });
    expect(invalidClause).toBe('');
    expect(invalidParams).toEqual([]);
  });
});
