import { useTagStore } from '@/features/tag/store/tag.store';
import * as tagService from '@/features/tag/services/tag.service';
import type { Tag, TagCategory } from '@/shared/types/domain';

jest.mock('@/features/tag/services/tag.service', () => ({
  getTagsByIds: jest.fn(),
  getTagsWithCategories: jest.fn(),
}));

const getTagsByIdsMock = tagService.getTagsByIds as jest.MockedFunction<typeof tagService.getTagsByIds>;
const getTagsWithCategoriesMock = tagService.getTagsWithCategories as jest.MockedFunction<
  typeof tagService.getTagsWithCategories
>;

function buildCategory(id: number): TagCategory {
  return {
    id,
    externalId: `category-${id}`,
    name: `Category ${id}`,
    color: '#2563eb',
    sortOrder: id,
    createdAt: '2026-03-09T00:00:00.000Z',
  };
}

function buildTag(id: number, category: TagCategory | null): Tag {
  return {
    id,
    externalId: `tag-${id}`,
    name: `Tag ${id}`,
    color: '#111827',
    icon: null,
    categoryId: category?.id ?? null,
    sortOrder: id,
    createdAt: '2026-03-09T00:00:00.000Z',
    category,
  };
}

describe('tag store', () => {
  afterEach(() => {
    jest.clearAllMocks();
    useTagStore.setState({
      tags: [],
      categories: [],
      tagsByCategory: new Map(),
      hasLoadedWithCategories: false,
      loading: false,
      error: null,
    });
  });

  it('ensures missing tags by ids without toggling loading', async () => {
    const category = buildCategory(7);
    const tag = buildTag(1, category);
    getTagsByIdsMock.mockResolvedValueOnce([tag]);

    await useTagStore.getState().ensureTagsByIds([1]);

    const state = useTagStore.getState();
    expect(getTagsByIdsMock).toHaveBeenCalledWith([1]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.tags).toEqual([tag]);
    expect(state.categories).toEqual([category]);
    expect(state.tagsByCategory.get(category.id)).toEqual([tag]);
  });

  it('fetches only missing tag ids and preserves existing tags on failure', async () => {
    const existingCategory = buildCategory(3);
    const existingTag = buildTag(1, existingCategory);
    useTagStore.setState({
      tags: [existingTag],
      categories: [existingCategory],
      tagsByCategory: new Map([[existingCategory.id, [existingTag]]]),
      loading: false,
      error: null,
    });
    getTagsByIdsMock.mockRejectedValueOnce(new Error('boom'));

    await useTagStore.getState().ensureTagsByIds([1, 2]);

    const state = useTagStore.getState();
    expect(getTagsByIdsMock).toHaveBeenCalledWith([2]);
    expect(state.tags).toEqual([existingTag]);
    expect(state.categories).toEqual([existingCategory]);
    expect(state.tagsByCategory.get(existingCategory.id)).toEqual([existingTag]);
    expect(state.loading).toBe(false);
    expect(state.error).toBe('boom');
  });

  it('loads tags with categories only once unless force is used', async () => {
    const category = buildCategory(5);
    const tag = buildTag(11, category);
    getTagsWithCategoriesMock.mockResolvedValue({
      categories: [category],
      tagsByCategory: new Map([[category.id, [tag]]]),
    });

    await useTagStore.getState().loadTagsWithCategories();
    await useTagStore.getState().loadTagsWithCategories();
    await useTagStore.getState().loadTagsWithCategories({ force: true });

    const state = useTagStore.getState();
    expect(getTagsWithCategoriesMock).toHaveBeenCalledTimes(2);
    expect(state.hasLoadedWithCategories).toBe(true);
    expect(state.tags).toEqual([tag]);
    expect(state.categories).toEqual([category]);
    expect(state.tagsByCategory.get(category.id)).toEqual([tag]);
  });

  it('marks an empty tag library as loaded to avoid repeated reloads', async () => {
    getTagsWithCategoriesMock.mockResolvedValue({
      categories: [],
      tagsByCategory: new Map(),
    });

    await useTagStore.getState().loadTagsWithCategories();
    await useTagStore.getState().loadTagsWithCategories();

    const state = useTagStore.getState();
    expect(getTagsWithCategoriesMock).toHaveBeenCalledTimes(1);
    expect(state.hasLoadedWithCategories).toBe(true);
    expect(state.tags).toEqual([]);
    expect(state.categories).toEqual([]);
    expect(Array.from(state.tagsByCategory.entries())).toEqual([]);
  });
});
