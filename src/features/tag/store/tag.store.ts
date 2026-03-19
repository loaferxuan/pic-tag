import { create } from 'zustand';
import { UNCATEGORIZED_TAG_CATEGORY_ID } from '@/shared/constants';
import type { Tag, TagCategory } from '@/shared/types/domain';
import * as tagService from '@/features/tag/services/tag.service';

function normalizeTagIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function sortCategories(categories: TagCategory[]): TagCategory[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function mergeTags(existing: Tag[], incoming: Tag[]): Tag[] {
  const merged = new Map(existing.map((tag) => [tag.id, tag]));
  for (const tag of incoming) {
    merged.set(tag.id, tag);
  }
  return sortTags(Array.from(merged.values()));
}

function mergeCategories(existing: TagCategory[], incoming: TagCategory[]): TagCategory[] {
  const merged = new Map(existing.map((category) => [category.id, category]));
  for (const category of incoming) {
    merged.set(category.id, category);
  }
  return sortCategories(Array.from(merged.values()));
}

function mergeTagsByCategory(existing: Map<number, Tag[]>, incoming: Tag[]): Map<number, Tag[]> {
  const next = new Map<number, Tag[]>(
    Array.from(existing.entries()).map(([categoryId, tags]) => [categoryId, [...tags]])
  );

  for (const incomingTag of incoming) {
    for (const [categoryId, tags] of next.entries()) {
      const filtered = tags.filter((tag) => tag.id !== incomingTag.id);
      if (filtered.length === 0) {
        next.delete(categoryId);
      } else if (filtered.length !== tags.length) {
        next.set(categoryId, filtered);
      }
    }

    const targetCategoryId = incomingTag.categoryId ?? UNCATEGORIZED_TAG_CATEGORY_ID;
    next.set(targetCategoryId, sortTags([...(next.get(targetCategoryId) ?? []), incomingTag]));
  }

  return next;
}

function groupTagsByCategory(tags: Tag[]): Map<number, Tag[]> {
  const next = new Map<number, Tag[]>();

  for (const tag of sortTags(tags)) {
    const categoryId = tag.categoryId ?? UNCATEGORIZED_TAG_CATEGORY_ID;
    next.set(categoryId, [...(next.get(categoryId) ?? []), tag]);
  }

  return next;
}

function hydrateTagCategory(tag: Tag, categories: TagCategory[]): Tag {
  if (tag.categoryId == null) {
    return {
      ...tag,
      category: null,
    };
  }

  return {
    ...tag,
    category: categories.find((category) => category.id === tag.categoryId) ?? tag.category ?? null,
  };
}

interface TagState {
  tags: Tag[];
  categories: TagCategory[];
  tagsByCategory: Map<number, Tag[]>;
  hasLoadedWithCategories: boolean;
  loading: boolean;
  error: string | null;

  loadTags: (options?: { categoryId?: number | null }) => Promise<void>;
  loadCategories: () => Promise<void>;
  loadTagsWithCategories: (options?: { force?: boolean }) => Promise<void>;
  ensureTagsByIds: (ids: number[]) => Promise<void>;
  createCategory: (data: { name: string; color?: string; sortOrder?: number }) => Promise<TagCategory | null>;
  updateCategory: (id: number, data: Partial<{ name: string; color: string; sortOrder: number }>) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
  createTag: (data: {
    name: string;
    color?: string;
    icon?: string | null;
    categoryId?: number | null;
    sortOrder?: number;
  }) => Promise<Tag | null>;
  updateTag: (
    id: number,
    data: Partial<{ name: string; color: string; icon: string | null; categoryId: number | null; sortOrder: number }>
  ) => Promise<void>;
  deleteTag: (id: number) => Promise<void>;
  clearError: () => void;
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],
  categories: [],
  tagsByCategory: new Map(),
  hasLoadedWithCategories: false,
  loading: false,
  error: null,

  loadTags: async (options) => {
    set({ loading: true, error: null });
    try {
      const tags = await tagService.getTags(options);
      set({
        tags,
        tagsByCategory: groupTagsByCategory(tags),
        hasLoadedWithCategories: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '加载标签失败' });
    } finally {
      set({ loading: false });
    }
  },

  loadCategories: async () => {
    set({ loading: true, error: null });
    try {
      const categories = await tagService.getTagCategories();
      set({
        categories,
        hasLoadedWithCategories: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '加载分类失败' });
    } finally {
      set({ loading: false });
    }
  },

  loadTagsWithCategories: async (options) => {
    if (!options?.force && get().hasLoadedWithCategories) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const { categories, tagsByCategory } = await tagService.getTagsWithCategories();
      const tags = Array.from(tagsByCategory.values()).flat();
      set({
        categories,
        tagsByCategory,
        tags,
        hasLoadedWithCategories: true,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '加载失败' });
    } finally {
      set({ loading: false });
    }
  },

  ensureTagsByIds: async (ids) => {
    const normalized = normalizeTagIds(ids);
    if (normalized.length === 0) return;

    const existingIds = new Set(get().tags.map((tag) => tag.id));
    const missingIds = normalized.filter((id) => !existingIds.has(id));
    if (missingIds.length === 0) return;

    try {
      const tags = await tagService.getTagsByIds(missingIds);
      if (tags.length === 0) {
        set({ error: null });
        return;
      }

      const categories = tags
        .map((tag) => tag.category)
        .filter((category): category is TagCategory => category != null);

      set((state) => ({
        error: null,
        tags: mergeTags(state.tags, tags),
        categories: mergeCategories(state.categories, categories),
        tagsByCategory: mergeTagsByCategory(state.tagsByCategory, tags),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '加载标签失败' });
    }
  },

  createCategory: async (data) => {
    set({ error: null });
    try {
      const category = await tagService.createTagCategory(data);
      set((state) => ({
        categories: sortCategories([...state.categories, category]),
        hasLoadedWithCategories: state.hasLoadedWithCategories,
      }));
      return category;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '创建分类失败' });
      return null;
    }
  },

  updateCategory: async (id, data) => {
    set({ error: null });
    try {
      const updated = await tagService.updateTagCategory(id, data);
      if (updated) {
        set((state) => {
          const categories = sortCategories(
            state.categories.map((category) => (category.id === id ? updated : category))
          );
          const tags = sortTags(
            state.tags.map((tag) =>
              tag.categoryId === id
                ? {
                    ...tag,
                    category: updated,
                  }
                : tag
            )
          );

          return {
            categories,
            tags,
            tagsByCategory: groupTagsByCategory(tags),
            hasLoadedWithCategories: state.hasLoadedWithCategories,
          };
        });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '更新分类失败' });
    }
  },

  deleteCategory: async (id) => {
    set({ error: null });
    try {
      await tagService.deleteTagCategory(id);
      set((state) => {
        const tags = sortTags(
          state.tags.map((tag) =>
            tag.categoryId === id
              ? {
                  ...tag,
                  categoryId: null,
                  category: null,
                }
              : tag
          )
        );

        return {
          categories: state.categories.filter((category) => category.id !== id),
          tags,
          tagsByCategory: groupTagsByCategory(tags),
          hasLoadedWithCategories: state.hasLoadedWithCategories,
        };
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '删除分类失败' });
    }
  },

  createTag: async (data) => {
    set({ error: null });
    try {
      const tag = await tagService.createTag(data);
      let createdTag: Tag | null = null;

      set((state) => {
        const hydratedTag = hydrateTagCategory(tag, state.categories);
        const tags = sortTags([...state.tags.filter((existingTag) => existingTag.id !== hydratedTag.id), hydratedTag]);
        createdTag = hydratedTag;

        return {
          tags,
          tagsByCategory: groupTagsByCategory(tags),
          hasLoadedWithCategories: state.hasLoadedWithCategories,
        };
      });

      return createdTag;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '创建标签失败' });
      return null;
    }
  },

  updateTag: async (id, data) => {
    set({ error: null });
    try {
      const updated = await tagService.updateTag(id, data);
      if (updated) {
        set((state) => {
          const hydratedTag = hydrateTagCategory(updated, state.categories);
          const tags = sortTags(state.tags.map((tag) => (tag.id === id ? hydratedTag : tag)));

          return {
            tags,
            tagsByCategory: groupTagsByCategory(tags),
            hasLoadedWithCategories: state.hasLoadedWithCategories,
          };
        });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '更新标签失败' });
    }
  },

  deleteTag: async (id) => {
    set({ error: null });
    try {
      await tagService.deleteTag(id);
      set((state) => {
        const tags = state.tags.filter((tag) => tag.id !== id);

        return {
          tags,
          tagsByCategory: groupTagsByCategory(tags),
          hasLoadedWithCategories: state.hasLoadedWithCategories,
        };
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '删除标签失败' });
    }
  },

  clearError: () => set({ error: null }),
}));
