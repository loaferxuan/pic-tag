import {
  mergeTagCategoryCollapsedState,
  shouldAutoCollapseTagCategory,
} from '@/shared/utils/tag-category-collapse';

describe('tag category collapse utils', () => {
  it('auto-collapses only when tag count exceeds the threshold', () => {
    expect(shouldAutoCollapseTagCategory(8)).toBe(false);
    expect(shouldAutoCollapseTagCategory(9)).toBe(true);
  });

  it('preserves existing user state when merging refreshed categories', () => {
    const previous = {
      1: true,
      2: false,
    };

    const next = mergeTagCategoryCollapsedState(previous, [
      { categoryId: 1, tagCount: 1 },
      { categoryId: 2, tagCount: 20 },
      { categoryId: 3, tagCount: 10 },
    ]);

    expect(next).toEqual({
      1: true,
      2: false,
      3: true,
    });
    expect(previous).toEqual({
      1: true,
      2: false,
    });
  });

  it('initializes only newly seen categories', () => {
    const next = mergeTagCategoryCollapsedState(
      {
        1: false,
      },
      [
        { categoryId: 1, tagCount: 30 },
        { categoryId: 2, tagCount: 4 },
      ]
    );

    expect(next).toEqual({
      1: false,
      2: false,
    });
  });
});
