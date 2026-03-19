import { getRepositories } from '@/infra/db';
import type { TagRow, TagCategoryRow } from '@/shared/types/database';
import type { Tag, TagCategory } from '@/shared/types/domain';
import type { QueryOptions } from '@/shared/types/common';

function rowToTag(r: TagRow, category?: TagCategory | null): Tag {
  return {
    id: r.id,
    externalId: r.external_id ?? `tag-${r.id}`,
    name: r.name,
    color: r.color,
    icon: r.icon,
    categoryId: r.category_id,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    category: category ?? null,
  };
}

function rowToCategory(r: TagCategoryRow): TagCategory {
  return {
    id: r.id,
    externalId: r.external_id ?? `category-${r.id}`,
    name: r.name,
    color: r.color,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

// ---------- 标签分类 ----------

export async function getTagCategories(options?: QueryOptions): Promise<TagCategory[]> {
  const repos = await getRepositories();
  const rows = await repos.tagCategory.findAll(options);
  return rows.map(rowToCategory);
}

export async function createTagCategory(data: { name: string; color?: string; sortOrder?: number }): Promise<TagCategory> {
  const repos = await getRepositories();
  const row = await repos.tagCategory.create({
    name: data.name,
    color: data.color,
    sort_order: data.sortOrder,
  });
  return rowToCategory(row);
}

export async function updateTagCategory(
  id: number,
  data: Partial<{ name: string; color: string; sortOrder: number }>
): Promise<TagCategory | null> {
  const repos = await getRepositories();
  await repos.tagCategory.update(id, {
    name: data.name,
    color: data.color,
    sort_order: data.sortOrder,
  });
  const row = await repos.tagCategory.findById(id);
  return row ? rowToCategory(row) : null;
}

export async function deleteTagCategory(id: number): Promise<void> {
  const repos = await getRepositories();
  await repos.tagCategory.delete(id);
}

// ---------- 标签 ----------

export async function getTags(options?: QueryOptions & { categoryId?: number | null }): Promise<Tag[]> {
  const repos = await getRepositories();
  const rows = await repos.tag.findAll(options);
  const categories = await getTagCategories({ limit: 500 });
  const catMap = new Map(categories.map((c) => [c.id, c]));
  return rows.map((r) => rowToTag(r, r.category_id ? catMap.get(r.category_id) : null));
}

export async function getTag(id: number): Promise<Tag | null> {
  const repos = await getRepositories();
  const row = await repos.tag.findById(id);
  if (!row) return null;
  const category = row.category_id ? (await repos.tagCategory.findById(row.category_id)) : null;
  return rowToTag(row, category ? rowToCategory(category) : null);
}

export async function getTagsByIds(ids: number[]): Promise<Tag[]> {
  const normalized = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  if (normalized.length === 0) return [];

  const repos = await getRepositories();
  const rows = await repos.tag.findByIds(normalized);
  if (rows.length === 0) return [];

  const categoryIds = Array.from(
    new Set(
      rows
        .map((row) => row.category_id)
        .filter((categoryId): categoryId is number => Number.isInteger(categoryId) && categoryId > 0)
    )
  );
  const categoryRows = await repos.tagCategory.findByIds(categoryIds);
  const categoryMap = new Map(categoryRows.map((row) => [row.id, rowToCategory(row)]));

  return rows.map((row) => rowToTag(row, row.category_id ? categoryMap.get(row.category_id) ?? null : null));
}

export async function createTag(data: {
  name: string;
  color?: string;
  icon?: string | null;
  categoryId?: number | null;
  sortOrder?: number;
}): Promise<Tag> {
  const repos = await getRepositories();
  const row = await repos.tag.create({
    name: data.name,
    color: data.color,
    icon: data.icon,
    category_id: data.categoryId,
    sort_order: data.sortOrder,
  });
  return rowToTag(row);
}

export async function updateTag(
  id: number,
  data: Partial<{ name: string; color: string; icon: string | null; categoryId: number | null; sortOrder: number }>
): Promise<Tag | null> {
  const repos = await getRepositories();
  await repos.tag.update(id, {
    name: data.name,
    color: data.color,
    icon: data.icon,
    category_id: data.categoryId,
    sort_order: data.sortOrder,
  });
  return getTag(id);
}

export async function deleteTag(id: number): Promise<void> {
  const repos = await getRepositories();
  await repos.tag.delete(id);
}

export async function getTagsWithCategories(): Promise<{ categories: TagCategory[]; tagsByCategory: Map<number, Tag[]> }> {
  const categories = await getTagCategories({ limit: 200 });
  const allTags = await getTags({ limit: 500 });
  const tagsByCategory = new Map<number, Tag[]>();
  for (const c of categories) {
    tagsByCategory.set(c.id, allTags.filter((t) => t.categoryId === c.id));
  }
  const uncategorized = allTags.filter((t) => t.categoryId == null);
  if (uncategorized.length) {
    tagsByCategory.set(-1, uncategorized);
  }
  return { categories, tagsByCategory };
}
