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
});
