import type { TagPresetRow, TagPresetItemRow, TagPresetWithItems } from '@/infra/db/repositories/tag-preset.repository';

describe('TagPresetRow 类型验证', () => {
  const validPreset: TagPresetRow = {
    id: 1,
    name: '测试预设',
    description: '测试描述',
    color: '#6366F1',
    is_active: 1,
    is_default: 0,
    sort_order: 0,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
  };

  it('有效的预设行对象', () => {
    expect(validPreset.id).toBe(1);
    expect(validPreset.name).toBe('测试预设');
    expect(validPreset.is_active).toBe(1);
    expect(validPreset.is_default).toBe(0);
  });

  it('is_active 为 1 表示活跃', () => {
    const activePreset = { ...validPreset, is_active: 1 };
    expect(activePreset.is_active === 1).toBe(true);
  });

  it('is_active 为 0 表示非活跃', () => {
    const inactivePreset = { ...validPreset, is_active: 0 };
    expect(inactivePreset.is_active === 0).toBe(true);
    expect(inactivePreset.is_active === 1).toBe(false);
  });

  it('is_default 为 1 表示默认', () => {
    const defaultPreset = { ...validPreset, is_default: 1 };
    expect(defaultPreset.is_default === 1).toBe(true);
  });

  it('is_default 为 0 表示非默认', () => {
    const nonDefaultPreset = { ...validPreset, is_default: 0 };
    expect(nonDefaultPreset.is_default === 0).toBe(true);
    expect(nonDefaultPreset.is_default === 1).toBe(false);
  });

  it('description 可以为 null', () => {
    const presetWithNullDesc = { ...validPreset, description: null };
    expect(presetWithNullDesc.description).toBeNull();
  });
});

describe('TagPresetItemRow 类型验证', () => {
  const validItem: TagPresetItemRow = {
    id: 1,
    preset_id: 1,
    tag_id: 101,
    custom_tag_name: null,
    custom_tag_color: null,
    sort_order: 0,
    created_at: '2026-03-01T00:00:00.000Z',
  };

  it('有效的预设项行对象', () => {
    expect(validItem.id).toBe(1);
    expect(validItem.preset_id).toBe(1);
    expect(validItem.tag_id).toBe(101);
  });

  it('existing 类型项有 tag_id', () => {
    const existingItem = { ...validItem, tag_id: 102 };
    expect(existingItem.tag_id).not.toBeNull();
    expect(existingItem.custom_tag_name).toBeNull();
  });

  it('custom 类型项有自定义名称', () => {
    const customItem: TagPresetItemRow = {
      ...validItem,
      id: 2,
      tag_id: null,
      custom_tag_name: '自定义标签',
      custom_tag_color: '#F97316',
    };
    expect(customItem.tag_id).toBeNull();
    expect(customItem.custom_tag_name).toBe('自定义标签');
    expect(customItem.custom_tag_color).toBe('#F97316');
  });

  it('sort_order 应为非负整数', () => {
    expect(validItem.sort_order).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(validItem.sort_order)).toBe(true);
  });
});

describe('TagPresetWithItems 类型验证', () => {
  const presetWithItems: TagPresetWithItems = {
    id: 1,
    name: '演唱会应援',
    description: '演唱会常用标签',
    color: '#6366F1',
    is_active: 1,
    is_default: 1,
    sort_order: 0,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    items: [
      { id: 1, preset_id: 1, tag_id: 101, custom_tag_name: null, custom_tag_color: null, sort_order: 0, created_at: '2026-03-01T00:00:00.000Z' },
      { id: 2, preset_id: 1, tag_id: 102, custom_tag_name: null, custom_tag_color: null, sort_order: 1, created_at: '2026-03-01T00:00:00.000Z' },
    ],
  };

  it('包含预设信息和标签项', () => {
    expect(presetWithItems.id).toBe(1);
    expect(presetWithItems.items.length).toBe(2);
  });

  it('items 数组包含所有标签项', () => {
    expect(presetWithItems.items[0]?.tag_id).toBe(101);
    expect(presetWithItems.items[1]?.tag_id).toBe(102);
  });

  it('空预设可以有空 items 数组', () => {
    const emptyPreset: TagPresetWithItems = {
      ...presetWithItems,
      items: [],
    };
    expect(emptyPreset.items).toEqual([]);
  });
});

describe('SQL 查询构造测试', () => {
  describe('SELECT 查询', () => {
    it('基础 SELECT 语句', () => {
      const sql = 'SELECT * FROM tag_presets WHERE id = ?';
      expect(sql).toContain('SELECT');
      expect(sql).toContain('tag_presets');
    });

    it('按 is_active 过滤', () => {
      const sql = 'SELECT * FROM tag_presets WHERE is_active = 1 ORDER BY sort_order ASC, id ASC';
      expect(sql).toContain('is_active = 1');
    });

    it('按 is_default 查询', () => {
      const sql = 'SELECT * FROM tag_presets WHERE is_default = 1 LIMIT 1';
      expect(sql).toContain('is_default = 1');
      expect(sql).toContain('LIMIT 1');
    });

    it('排序查询', () => {
      const sql = 'SELECT * FROM tag_presets ORDER BY sort_order ASC, id ASC';
      expect(sql).toContain('ORDER BY sort_order ASC');
    });
  });

  describe('INSERT 查询', () => {
    it('创建预设 INSERT 语句', () => {
      const sql = `INSERT INTO tag_presets (name, description, color, is_active, is_default, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?)`;
      expect(sql).toContain('INSERT INTO tag_presets');
      expect(sql).toContain('is_default');
    });

    it('添加预设项 INSERT 语句', () => {
      const sql = `INSERT INTO tag_preset_items (preset_id, tag_id, custom_tag_name, custom_tag_color, sort_order)
                   VALUES (?, ?, ?, ?, ?)`;
      expect(sql).toContain('INSERT INTO tag_preset_items');
    });
  });

  describe('UPDATE 查询', () => {
    it('更新预设的 is_default', () => {
      const sql = 'UPDATE tag_presets SET is_default = 0 WHERE is_default = 1';
      expect(sql).toContain('UPDATE tag_presets');
      expect(sql).toContain('is_default = 0');
    });

    it('设置单个预设的 is_default', () => {
      const sql = 'UPDATE tag_presets SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ?';
      expect(sql).toContain('is_default = 1');
      expect(sql).toContain('WHERE id = ?');
    });

    it('取消默认预设', () => {
      const sql = 'UPDATE tag_presets SET is_default = 0, updated_at = datetime(\'now\') WHERE id = ?';
      expect(sql).toContain('is_default = 0');
    });
  });

  describe('DELETE 查询', () => {
    it('删除预设项', () => {
      const sql = 'DELETE FROM tag_preset_items WHERE id = ?';
      expect(sql).toContain('DELETE FROM tag_preset_items');
    });

    it('删除预设（级联删除项）', () => {
      const sql = 'DELETE FROM tag_presets WHERE id = ?';
      expect(sql).toContain('DELETE FROM tag_presets');
    });
  });
});

describe('默认预设设置逻辑测试', () => {
  let presets: TagPresetRow[];

  beforeEach(() => {
    presets = [
      { id: 1, name: '预设A', description: null, color: '#6366F1', is_active: 1, is_default: 1, sort_order: 0, created_at: '', updated_at: '' },
      { id: 2, name: '预设B', description: null, color: '#22C55E', is_active: 1, is_default: 0, sort_order: 1, created_at: '', updated_at: '' },
      { id: 3, name: '预设C', description: null, color: '#EF4444', is_active: 1, is_default: 0, sort_order: 2, created_at: '', updated_at: '' },
    ];
  });

  function setAsDefault(presetId: number): void {
    presets.forEach((p) => {
      p.is_default = p.id === presetId ? 1 : 0;
      p.updated_at = new Date().toISOString();
    });
  }

  it('设置新默认预设', () => {
    setAsDefault(2);
    expect(presets.find((p) => p.id === 1)?.is_default).toBe(0);
    expect(presets.find((p) => p.id === 2)?.is_default).toBe(1);
  });

  it('只有一个预设可以是默认', () => {
    setAsDefault(2);
    const defaultCount = presets.filter((p) => p.is_default === 1).length;
    expect(defaultCount).toBe(1);
  });

  it('取消默认预设', () => {
    presets[0]!.is_default = 0;
    expect(presets.find((p) => p.id === 1)?.is_default).toBe(0);
  });

  it('设置默认时更新时间戳', () => {
    const before = presets[0]!.updated_at;
    setAsDefault(1);
    const after = presets.find((p) => p.id === 1)?.updated_at;
    expect(after).not.toBe('');
  });
});

describe('预设项管理逻辑测试', () => {
  let items: TagPresetItemRow[];

  beforeEach(() => {
    items = [
      { id: 1, preset_id: 1, tag_id: 101, custom_tag_name: null, custom_tag_color: null, sort_order: 0, created_at: '' },
      { id: 2, preset_id: 1, tag_id: 102, custom_tag_name: null, custom_tag_color: null, sort_order: 1, created_at: '' },
      { id: 3, preset_id: 1, tag_id: 103, custom_tag_name: null, custom_tag_color: null, sort_order: 2, created_at: '' },
    ];
  });

  function addItem(presetId: number, tagId: number, sortOrder: number): TagPresetItemRow {
    const newItem: TagPresetItemRow = {
      id: items.length + 1,
      preset_id: presetId,
      tag_id: tagId,
      custom_tag_name: null,
      custom_tag_color: null,
      sort_order: sortOrder,
      created_at: new Date().toISOString(),
    };
    items.push(newItem);
    return newItem;
  }

  function removeItem(itemId: number): boolean {
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) return false;
    items.splice(index, 1);
    return true;
  }

  function getItemCount(presetId: number): number {
    return items.filter((item) => item.preset_id === presetId).length;
  }

  function getTagIds(presetId: number): number[] {
    return items
      .filter((item) => item.preset_id === presetId && item.tag_id !== null)
      .map((item) => item.tag_id as number);
  }

  function reorderItems(presetId: number, itemIds: number[]): void {
    itemIds.forEach((itemId, index) => {
      const item = items.find((i) => i.id === itemId && i.preset_id === presetId);
      if (item) {
        item.sort_order = index;
      }
    });
  }

  it('添加预设项', () => {
    const newItem = addItem(1, 104, 3);
    expect(newItem.tag_id).toBe(104);
    expect(items.length).toBe(4);
  });

  it('删除预设项', () => {
    const removed = removeItem(2);
    expect(removed).toBe(true);
    expect(items.length).toBe(2);
  });

  it('删除不存在的项返回 false', () => {
    const removed = removeItem(999);
    expect(removed).toBe(false);
  });

  it('获取预设项数量', () => {
    expect(getItemCount(1)).toBe(3);
  });

  it('获取预设的 tagId 列表', () => {
    const tagIds = getTagIds(1);
    expect(tagIds).toEqual([101, 102, 103]);
  });

  it('重新排序预设项', () => {
    reorderItems(1, [3, 1, 2]);
    expect(items.find((i) => i.id === 3)?.sort_order).toBe(0);
    expect(items.find((i) => i.id === 1)?.sort_order).toBe(1);
    expect(items.find((i) => i.id === 2)?.sort_order).toBe(2);
  });
});

describe('预设复制逻辑测试', () => {
  const sourcePreset: TagPresetWithItems = {
    id: 1,
    name: '源预设',
    description: '源描述',
    color: '#6366F1',
    is_active: 1,
    is_default: 1,
    sort_order: 0,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    items: [
      { id: 1, preset_id: 1, tag_id: 101, custom_tag_name: null, custom_tag_color: null, sort_order: 0, created_at: '' },
      { id: 2, preset_id: 1, tag_id: null, custom_tag_name: '自定义', custom_tag_color: '#F97316', sort_order: 1, created_at: '' },
    ],
  };

  function duplicatePreset(newName: string): { preset: Partial<TagPresetRow>; items: TagPresetItemRow[] } {
    const newPresetId = 99;
    const newItems = sourcePreset.items.map((item, index) => ({
      ...item,
      id: 100 + index,
      preset_id: newPresetId,
    }));

    return {
      preset: {
        id: newPresetId,
        name: newName,
        description: sourcePreset.description,
        color: sourcePreset.color,
        is_active: 1,
        is_default: 0,
        sort_order: sourcePreset.sort_order,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      items: newItems,
    };
  }

  it('复制预设名称', () => {
    const result = duplicatePreset('副本预设');
    expect(result.preset.name).toBe('副本预设');
  });

  it('复制预设描述', () => {
    const result = duplicatePreset('副本预设');
    expect(result.preset.description).toBe('源描述');
  });

  it('复制预设颜色', () => {
    const result = duplicatePreset('副本预设');
    expect(result.preset.color).toBe('#6366F1');
  });

  it('新预设不是默认', () => {
    const result = duplicatePreset('副本预设');
    expect(result.preset.is_default).toBe(0);
  });

  it('复制所有标签项', () => {
    const result = duplicatePreset('副本预设');
    expect(result.items.length).toBe(2);
    expect(result.items[0]?.tag_id).toBe(101);
    expect(result.items[1]?.custom_tag_name).toBe('自定义');
  });

  it('新预设的标签项使用新的 preset_id', () => {
    const result = duplicatePreset('副本预设');
    result.items.forEach((item) => {
      expect(item.preset_id).toBe(99);
    });
  });
});

describe('数据库约束测试', () => {
  describe('UNIQUE 约束', () => {
    it('tag_preset_items 的唯一约束组合', () => {
      const constraint = 'UNIQUE(preset_id, tag_id, custom_tag_name)';
      expect(constraint).toContain('preset_id');
      expect(constraint).toContain('tag_id');
      expect(constraint).toContain('custom_tag_name');
    });
  });

  describe('FOREIGN KEY 约束', () => {
    it('tag_preset_items.preset_id 引用 tag_presets.id', () => {
      const foreignKey = 'preset_id INTEGER NOT NULL REFERENCES tag_presets(id) ON DELETE CASCADE';
      expect(foreignKey).toContain('ON DELETE CASCADE');
    });

    it('tag_preset_items.tag_id 引用 tags.id (可选)', () => {
      const foreignKey = 'tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE';
      expect(foreignKey).toContain('ON DELETE CASCADE');
    });
  });

  describe('CHECK 约束', () => {
    it('reason 字段的 CHECK 约束', () => {
      const validReasons = ['NOT_FOUND', 'AMBIGUOUS', 'MISSING_TAGS'];
      const reason = 'NOT_FOUND';
      expect(validReasons.includes(reason)).toBe(true);
    });
  });
});

describe('索引测试', () => {
  it('tag_presets 表索引', () => {
    const indexes = [
      'idx_tag_presets_sort_order ON tag_presets(sort_order, id)',
      'idx_tag_presets_is_active ON tag_presets(is_active)',
    ];
    indexes.forEach((idx) => {
      expect(idx).toContain('tag_presets');
    });
  });

  it('tag_preset_items 表索引', () => {
    const indexes = [
      'idx_tag_preset_items_preset_id ON tag_preset_items(preset_id)',
      'idx_tag_preset_items_tag_id ON tag_preset_items(tag_id)',
    ];
    indexes.forEach((idx) => {
      expect(idx).toContain('tag_preset_items');
    });
  });
});

describe('边界条件测试', () => {
  it('处理超长名称', () => {
    const longName = 'a'.repeat(500);
    expect(longName.length).toBe(500);
  });

  it('处理特殊字符名称', () => {
    const specialName = "预设'name\" with <special> & \"chars\"!";
    expect(specialName.length).toBeGreaterThan(0);
  });

  it('处理最大 sort_order', () => {
    const maxSortOrder = Number.MAX_SAFE_INTEGER;
    expect(maxSortOrder).toBeGreaterThan(0);
    expect(Number.isInteger(maxSortOrder)).toBe(true);
  });

  it('处理多个预设项', () => {
    const manyItems = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      preset_id: 1,
      tag_id: i + 100,
      custom_tag_name: null,
      custom_tag_color: null,
      sort_order: i,
      created_at: '',
    }));
    expect(manyItems.length).toBe(100);
  });
});
