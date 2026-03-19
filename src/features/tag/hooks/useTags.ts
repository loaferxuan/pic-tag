import { useEffect } from 'react';
import { useTagStore } from '@/features/tag/store/tag.store';

export function useTags(options?: { categoryId?: number | null }) {
  const categoryId = options?.categoryId;
  const tags = useTagStore((s) => s.tags);
  const loading = useTagStore((s) => s.loading);
  const error = useTagStore((s) => s.error);
  const loadTags = useTagStore((s) => s.loadTags);

  useEffect(() => {
    void loadTags(categoryId == null ? undefined : { categoryId });
  }, [categoryId, loadTags]);

  return {
    tags,
    loading,
    error,
    reload: () => loadTags(categoryId == null ? undefined : { categoryId }),
  };
}

export function useTagCategories() {
  const categories = useTagStore((s) => s.categories);
  const loading = useTagStore((s) => s.loading);
  const error = useTagStore((s) => s.error);
  const loadCategories = useTagStore((s) => s.loadCategories);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  return { categories, loading, error, reload: loadCategories };
}

export function useTagsWithCategories(options?: { enabled?: boolean; force?: boolean }) {
  const enabled = options?.enabled ?? true;
  const force = options?.force ?? false;
  const tags = useTagStore((s) => s.tags);
  const categories = useTagStore((s) => s.categories);
  const tagsByCategory = useTagStore((s) => s.tagsByCategory);
  const loading = useTagStore((s) => s.loading);
  const error = useTagStore((s) => s.error);
  const loadTagsWithCategories = useTagStore((s) => s.loadTagsWithCategories);

  useEffect(() => {
    if (!enabled) return;
    void loadTagsWithCategories({ force });
  }, [enabled, force, loadTagsWithCategories]);

  return {
    tags,
    categories,
    tagsByCategory,
    loading,
    error,
    reload: () => loadTagsWithCategories({ force: true }),
  };
}
