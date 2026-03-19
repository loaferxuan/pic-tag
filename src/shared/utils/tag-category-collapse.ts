import { TAG_CATEGORY_COLLAPSE_THRESHOLD } from '@/shared/constants';

export interface TagCategoryVisibilitySnapshot {
  categoryId: number;
  tagCount: number;
}

export type TagCategoryCollapsedState = Partial<Record<number, boolean>>;

export function shouldAutoCollapseTagCategory(
  tagCount: number,
  threshold = TAG_CATEGORY_COLLAPSE_THRESHOLD
): boolean {
  return tagCount > threshold;
}

export function mergeTagCategoryCollapsedState(
  previous: TagCategoryCollapsedState,
  snapshots: TagCategoryVisibilitySnapshot[],
  threshold = TAG_CATEGORY_COLLAPSE_THRESHOLD
): TagCategoryCollapsedState {
  let next = previous;

  for (const snapshot of snapshots) {
    if (Object.prototype.hasOwnProperty.call(next, snapshot.categoryId)) {
      continue;
    }

    if (next === previous) {
      next = { ...previous };
    }

    next[snapshot.categoryId] = shouldAutoCollapseTagCategory(snapshot.tagCount, threshold);
  }

  return next;
}
