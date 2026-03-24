import type { SQLiteDatabase } from 'expo-sqlite';

export interface TagPresetRow {
  id: number;
  name: string;
  description: string | null;
  color: string;
  is_active: number;
  is_default: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TagPresetItemRow {
  id: number;
  preset_id: number;
  tag_id: number | null;
  custom_tag_name: string | null;
  custom_tag_color: string | null;
  sort_order: number;
  created_at: string;
}

export interface TagPresetWithItems extends TagPresetRow {
  items: TagPresetItemRow[];
}

export class TagPresetRepository {
  constructor(private db: SQLiteDatabase) {}

  async findAll(includeInactive = false): Promise<TagPresetRow[]> {
    if (includeInactive) {
      return this.db.getAllAsync<TagPresetRow>(
        `SELECT * FROM tag_presets ORDER BY sort_order ASC, id ASC`
      );
    }
    return this.db.getAllAsync<TagPresetRow>(
      `SELECT * FROM tag_presets WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`
    );
  }

  async findById(id: number): Promise<TagPresetRow | null> {
    const row = await this.db.getFirstAsync<TagPresetRow>(
      `SELECT * FROM tag_presets WHERE id = ?`,
      [id]
    );
    return row ?? null;
  }

  async create(data: {
    name: string;
    description?: string | null;
    color?: string;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<TagPresetRow> {
    const result = await this.db.runAsync(
      `INSERT INTO tag_presets (name, description, color, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.name,
        data.description ?? null,
        data.color ?? '#6366F1',
        data.isActive !== false ? 1 : 0,
        data.sortOrder ?? 0,
      ]
    );
    const id = Number(result.lastInsertRowId);
    const row = await this.findById(id);
    if (!row) throw new Error('创建预设后读取失败');
    return row;
  }

  async update(
    id: number,
    data: Partial<{
      name: string;
      description: string | null;
      color: string;
      isActive: boolean;
      sortOrder: number;
    }>
  ): Promise<TagPresetRow | null> {
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.color !== undefined) {
      updates.push('color = ?');
      values.push(data.color);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }
    if (data.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      values.push(data.sortOrder);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = datetime("now")');
    values.push(id);

    await this.db.runAsync(
      `UPDATE tag_presets SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.runAsync(`DELETE FROM tag_presets WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  async softDelete(id: number): Promise<TagPresetRow | null> {
    return this.update(id, { isActive: false });
  }

  async getItemsByPresetId(presetId: number): Promise<TagPresetItemRow[]> {
    return this.db.getAllAsync<TagPresetItemRow>(
      `SELECT * FROM tag_preset_items WHERE preset_id = ? ORDER BY sort_order ASC, id ASC`,
      [presetId]
    );
  }

  async getPresetWithItems(presetId: number): Promise<TagPresetWithItems | null> {
    const preset = await this.findById(presetId);
    if (!preset) return null;

    const items = await this.getItemsByPresetId(presetId);
    return { ...preset, items };
  }

  async getAllPresetsWithItems(includeInactive = false): Promise<TagPresetWithItems[]> {
    const presets = await this.findAll(includeInactive);
    const result: TagPresetWithItems[] = [];

    for (const preset of presets) {
      const items = await this.getItemsByPresetId(preset.id);
      result.push({ ...preset, items });
    }

    return result;
  }

  async addItem(data: {
    presetId: number;
    tagId?: number | null;
    customTagName?: string | null;
    customTagColor?: string | null;
    sortOrder?: number;
  }): Promise<TagPresetItemRow> {
    const result = await this.db.runAsync(
      `INSERT INTO tag_preset_items (preset_id, tag_id, custom_tag_name, custom_tag_color, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.presetId,
        data.tagId ?? null,
        data.customTagName ?? null,
        data.customTagColor ?? null,
        data.sortOrder ?? 0,
      ]
    );
    const id = Number(result.lastInsertRowId);
    const row = await this.db.getFirstAsync<TagPresetItemRow>(
      `SELECT * FROM tag_preset_items WHERE id = ?`,
      [id]
    );
    if (!row) throw new Error('创建预设项后读取失败');
    return row;
  }

  async updateItem(
    id: number,
    data: Partial<{
      tagId: number | null;
      customTagName: string | null;
      customTagColor: string | null;
      sortOrder: number;
    }>
  ): Promise<TagPresetItemRow | null> {
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.tagId !== undefined) {
      updates.push('tag_id = ?');
      values.push(data.tagId);
    }
    if (data.customTagName !== undefined) {
      updates.push('custom_tag_name = ?');
      values.push(data.customTagName);
    }
    if (data.customTagColor !== undefined) {
      updates.push('custom_tag_color = ?');
      values.push(data.customTagColor);
    }
    if (data.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      values.push(data.sortOrder);
    }

    if (updates.length === 0) {
      const row = await this.db.getFirstAsync<TagPresetItemRow>(
        `SELECT * FROM tag_preset_items WHERE id = ?`,
        [id]
      );
      return row ?? null;
    }

    values.push(id);
    await this.db.runAsync(
      `UPDATE tag_preset_items SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const row = await this.db.getFirstAsync<TagPresetItemRow>(
      `SELECT * FROM tag_preset_items WHERE id = ?`,
      [id]
    );
    return row ?? null;
  }

  async deleteItem(id: number): Promise<boolean> {
    const result = await this.db.runAsync(`DELETE FROM tag_preset_items WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  async deleteAllItems(presetId: number): Promise<number> {
    const result = await this.db.runAsync(
      `DELETE FROM tag_preset_items WHERE preset_id = ?`,
      [presetId]
    );
    return result.changes;
  }

  async getItemCount(presetId: number): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM tag_preset_items WHERE preset_id = ?`,
      [presetId]
    );
    return row?.count ?? 0;
  }

  async duplicatePreset(sourcePresetId: number, newName: string): Promise<TagPresetRow | null> {
    const source = await this.getPresetWithItems(sourcePresetId);
    if (!source) return null;

    const newPreset = await this.create({
      name: newName,
      description: source.description,
      color: source.color,
    });

    for (const item of source.items) {
      await this.addItem({
        presetId: newPreset.id,
        tagId: item.tag_id,
        customTagName: item.custom_tag_name,
        customTagColor: item.custom_tag_color,
        sortOrder: item.sort_order,
      });
    }

    return newPreset;
  }

  async reorderItems(presetId: number, itemIds: number[]): Promise<void> {
    for (let i = 0; i < itemIds.length; i += 1) {
      await this.db.runAsync(
        `UPDATE tag_preset_items SET sort_order = ? WHERE id = ? AND preset_id = ?`,
        [i, itemIds[i]!, presetId]
      );
    }
  }

  async setAsDefault(presetId: number): Promise<TagPresetRow | null> {
    await this.db.runAsync(`UPDATE tag_presets SET is_default = 0 WHERE is_default = 1`);
    await this.db.runAsync(`UPDATE tag_presets SET is_default = 1, updated_at = datetime('now') WHERE id = ?`, [presetId]);
    return this.findById(presetId);
  }

  async removeDefault(presetId: number): Promise<TagPresetRow | null> {
    await this.db.runAsync(`UPDATE tag_presets SET is_default = 0, updated_at = datetime('now') WHERE id = ?`, [presetId]);
    return this.findById(presetId);
  }

  async getDefaultPreset(): Promise<TagPresetRow | null> {
    return this.db.getFirstAsync<TagPresetRow>(
      `SELECT * FROM tag_presets WHERE is_default = 1 LIMIT 1`
    );
  }

  async getDefaultPresetTagIds(): Promise<number[]> {
    const preset = await this.getDefaultPreset();
    if (!preset) return [];

    const items = await this.getItemsByPresetId(preset.id);
    return items.filter((item) => item.tag_id !== null).map((item) => item.tag_id as number);
  }
}
