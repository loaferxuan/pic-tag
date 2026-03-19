import type { SQLiteDatabase } from 'expo-sqlite';
import type { TagRow, TagCategoryRow } from '@/shared/types/database';
import type { QueryOptions } from '@/shared/types/common';

function normalizeExternalIds(externalIds: string[]): string[] {
  return Array.from(
    new Set(
      externalIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

export class TagCategoryRepository {
  constructor(private db: SQLiteDatabase) {}

  async findById(id: number): Promise<TagCategoryRow | null> {
    const row = await this.db.getFirstAsync<TagCategoryRow>(
      'SELECT * FROM tag_categories WHERE id = ?',
      [id]
    );
    return row ?? null;
  }

  async findByExternalId(externalId: string): Promise<TagCategoryRow | null> {
    const normalized = externalId.trim();
    if (!normalized) return null;
    const row = await this.db.getFirstAsync<TagCategoryRow>(
      'SELECT * FROM tag_categories WHERE external_id = ?',
      [normalized]
    );
    return row ?? null;
  }

  async findByExternalIds(externalIds: string[]): Promise<TagCategoryRow[]> {
    const normalized = normalizeExternalIds(externalIds);
    if (normalized.length === 0) return [];
    return this.db.getAllAsync<TagCategoryRow>(
      `SELECT * FROM tag_categories WHERE external_id IN (${normalized.map(() => '?').join(',')})`,
      normalized
    );
  }

  async findByIds(ids: number[]): Promise<TagCategoryRow[]> {
    const normalized = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
    if (normalized.length === 0) return [];
    return this.db.getAllAsync<TagCategoryRow>(
      `SELECT * FROM tag_categories WHERE id IN (${normalized.map(() => '?').join(',')})`,
      normalized
    );
  }

  async findByName(name: string): Promise<TagCategoryRow | null> {
    const rows = await this.findCategoriesByName(name);
    return rows[0] ?? null;
  }

  async findCategoriesByName(name: string): Promise<TagCategoryRow[]> {
    const normalized = name.trim();
    if (!normalized) return [];
    return this.db.getAllAsync<TagCategoryRow>(
      'SELECT * FROM tag_categories WHERE name = ? ORDER BY id ASC',
      [normalized]
    );
  }

  async findAll(options?: QueryOptions): Promise<TagCategoryRow[]> {
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    return this.db.getAllAsync<TagCategoryRow>(
      'SELECT * FROM tag_categories ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );
  }

  async create(data: {
    name: string;
    color?: string;
    sort_order?: number;
    external_id?: string | null;
  }): Promise<TagCategoryRow> {
    const externalId = data.external_id?.trim() || null;
    const result = await this.db.runAsync(
      `INSERT INTO tag_categories (name, color, sort_order, external_id)
       VALUES (?, ?, ?, COALESCE(?, lower(hex(randomblob(16)))))`,
      [data.name, data.color ?? '#6B7280', data.sort_order ?? 0, externalId]
    );
    const id = Number(result.lastInsertRowId);
    const row = await this.findById(id);
    if (!row) throw new Error('创建分类后读取失败');
    return row;
  }

  async update(
    id: number,
    data: Partial<{ name: string; color: string; sort_order: number; external_id: string | null }>
  ): Promise<TagCategoryRow> {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.color !== undefined) {
      updates.push('color = ?');
      params.push(data.color);
    }
    if (data.sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(data.sort_order);
    }
    if (data.external_id !== undefined) {
      updates.push('external_id = ?');
      params.push(data.external_id?.trim() || null);
    }
    if (updates.length > 0) {
      params.push(id);
      await this.db.runAsync(
        `UPDATE tag_categories SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }
    const row = await this.findById(id);
    if (!row) throw new Error('标签分类不存在');
    return row;
  }

  async delete(id: number): Promise<void> {
    await this.db.runAsync('UPDATE tags SET category_id = NULL WHERE category_id = ?', [id]);
    await this.db.runAsync('DELETE FROM tag_categories WHERE id = ?', [id]);
  }
}

export class TagRepository {
  constructor(private db: SQLiteDatabase) {}

  async findById(id: number): Promise<TagRow | null> {
    const row = await this.db.getFirstAsync<TagRow>('SELECT * FROM tags WHERE id = ?', [id]);
    return row ?? null;
  }

  async findByExternalId(externalId: string): Promise<TagRow | null> {
    const normalized = externalId.trim();
    if (!normalized) return null;
    const row = await this.db.getFirstAsync<TagRow>('SELECT * FROM tags WHERE external_id = ?', [normalized]);
    return row ?? null;
  }

  async findByExternalIds(externalIds: string[]): Promise<TagRow[]> {
    const normalized = normalizeExternalIds(externalIds);
    if (normalized.length === 0) return [];
    return this.db.getAllAsync<TagRow>(
      `SELECT * FROM tags WHERE external_id IN (${normalized.map(() => '?').join(',')})`,
      normalized
    );
  }

  async findByIds(ids: number[]): Promise<TagRow[]> {
    const normalized = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
    if (normalized.length === 0) return [];
    return this.db.getAllAsync<TagRow>(
      `SELECT * FROM tags WHERE id IN (${normalized.map(() => '?').join(',')}) ORDER BY sort_order ASC, id ASC`,
      normalized
    );
  }

  async findAll(options?: QueryOptions & { categoryId?: number | null }): Promise<TagRow[]> {
    const limit = options?.limit ?? 200;
    const offset = options?.offset ?? 0;
    if (options?.categoryId !== undefined && options?.categoryId !== null) {
      return this.db.getAllAsync<TagRow>(
        'SELECT * FROM tags WHERE category_id = ? ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?',
        [options.categoryId, limit, offset]
      );
    }
    return this.db.getAllAsync<TagRow>(
      'SELECT * FROM tags ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );
  }

  async create(data: {
    name: string;
    color?: string;
    icon?: string | null;
    category_id?: number | null;
    sort_order?: number;
    external_id?: string | null;
  }): Promise<TagRow> {
    const externalId = data.external_id?.trim() || null;
    const result = await this.db.runAsync(
      `INSERT INTO tags (name, color, icon, category_id, sort_order, external_id)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, lower(hex(randomblob(16)))))`,
      [
        data.name,
        data.color ?? '#6B7280',
        data.icon ?? null,
        data.category_id ?? null,
        data.sort_order ?? 0,
        externalId,
      ]
    );
    const id = Number(result.lastInsertRowId);
    const row = await this.findById(id);
    if (!row) throw new Error('创建标签后读取失败');
    return row;
  }

  async update(
    id: number,
    data: Partial<{
      name: string;
      color: string;
      icon: string | null;
      category_id: number | null;
      sort_order: number;
      external_id: string | null;
    }>
  ): Promise<TagRow> {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.color !== undefined) {
      updates.push('color = ?');
      params.push(data.color);
    }
    if (data.icon !== undefined) {
      updates.push('icon = ?');
      params.push(data.icon ?? null);
    }
    if (data.category_id !== undefined) {
      updates.push('category_id = ?');
      params.push(data.category_id ?? null);
    }
    if (data.sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(data.sort_order);
    }
    if (data.external_id !== undefined) {
      updates.push('external_id = ?');
      params.push(data.external_id?.trim() || null);
    }
    if (updates.length > 0) {
      params.push(id);
      await this.db.runAsync(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    const row = await this.findById(id);
    if (!row) throw new Error('标签不存在');
    return row;
  }

  async delete(id: number): Promise<void> {
    await this.db.runAsync('DELETE FROM photo_tags WHERE tag_id = ?', [id]);
    await this.db.runAsync('DELETE FROM tags WHERE id = ?', [id]);
  }

  async findByName(name: string, categoryId?: number | null): Promise<TagRow | null> {
    const rows = await this.findTagsByName(name, categoryId);
    return rows[0] ?? null;
  }

  async findTagsByName(name: string, categoryId?: number | null): Promise<TagRow[]> {
    const normalized = name.trim();
    if (!normalized) return [];
    if (categoryId === null) {
      return this.db.getAllAsync<TagRow>(
        'SELECT * FROM tags WHERE name = ? AND category_id IS NULL ORDER BY id ASC',
        [normalized]
      );
    }
    if (categoryId !== undefined) {
      return this.db.getAllAsync<TagRow>(
        'SELECT * FROM tags WHERE name = ? AND category_id = ? ORDER BY id ASC',
        [normalized, categoryId]
      );
    }
    return this.db.getAllAsync<TagRow>(
      'SELECT * FROM tags WHERE name = ? ORDER BY id ASC',
      [normalized]
    );
  }

  async findExistingIds(ids: number[]): Promise<number[]> {
    const normalized = Array.from(
      new Set(ids.filter((id) => Number.isInteger(id) && id > 0))
    );
    if (normalized.length === 0) return [];
    const rows = await this.db.getAllAsync<{ id: number }>(
      `SELECT id FROM tags WHERE id IN (${normalized.map(() => '?').join(',')})`,
      normalized
    );
    const existing = new Set(rows.map((row) => row.id));
    return normalized.filter((id) => existing.has(id));
  }
}

