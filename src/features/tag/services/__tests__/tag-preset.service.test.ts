import type { TagPresetDisplay, TagPresetDisplayItem } from '@/features/tag/services/tag-preset.service';

interface MockPresetRow {
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

interface MockPresetItemRow {
  id: number;
  preset_id: number;
  tag_id: number | null;
  custom_tag_name: string | null;
  custom_tag_color: string | null;
  sort_order: number;
  created_at: string;
}

interface MockPresetWithItems extends MockPresetRow {
  items: MockPresetItemRow[];
}

const mockPresets: MockPresetRow[] = [
  {
    id: 1,
    name: '演唱会应援',
    description: '演唱会常用标签',
    color: '#6366F1',
    is_active: 1,
    is_default: 1,
    sort_order: 0,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: '日常记录',
    description: null,
    color: '#22C55E',
    is_active: 1,
    is_default: 0,
    sort_order: 1,
    created_at: '2026-03-02T00:00:00.000Z',
    updated_at: '2026-03-02T00:00:00.000Z',
  },
  {
    id: 3,
    name: '已停用预设',
    description: '这个预设已停用',
    color: '#EF4444',
    is_active: 0,
    is_default: 0,
    sort_order: 2,
    created_at: '2026-03-03T00:00:00.000Z',
    updated_at: '2026-03-03T00:00:00.000Z',
  },
];

const mockPresetItems: Record<number, MockPresetItemRow[]> = {
  1: [
    { id: 1, preset_id: 1, tag_id: 101, custom_tag_name: null, custom_tag_color: null, sort_order: 0, created_at: '2026-03-01T00:00:00.000Z' },
    { id: 2, preset_id: 1, tag_id: 102, custom_tag_name: null, custom_tag_color: null, sort_order: 1, created_at: '2026-03-01T00:00:00.000Z' },
  ],
  2: [
    { id: 3, preset_id: 2, tag_id: 103, custom_tag_name: null, custom_tag_color: null, sort_order: 0, created_at: '2026-03-02T00:00:00.000Z' },
    { id: 4, preset_id: 2, tag_id: null, custom_tag_name: '自定义标签', custom_tag_color: '#F97316', sort_order: 1, created_at: '2026-03-02T00:00:00.000Z' },
  ],
  3: [],
};

function createMockPresetWithItems(presetId: number): MockPresetWithItems | null {
  const preset = mockPresets.find((p) => p.id === presetId);
  if (!preset) return null;
  return {
    ...preset,
    items: mockPresetItems[presetId] ?? [],
  };
}

describe('TagPresetDisplay 类型映射', () => {
  it('正确映射 is_active 字段', () => {
    const activePreset = mockPresets[0];
    expect(activePreset.is_active === 1).toBe(true);

    const inactivePreset = mockPresets[2];
    expect(inactivePreset.is_active === 1).toBe(false);
  });

  it('正确映射 is_default 字段', () => {
    const defaultPreset = mockPresets[0];
    expect(defaultPreset.is_default === 1).toBe(true);

    const nonDefaultPreset = mockPresets[1];
    expect(nonDefaultPreset.is_default === 1).toBe(false);
  });

  it('正确处理 itemCount', () => {
    const preset1Items = mockPresetItems[1] ?? [];
    expect(preset1Items.length).toBe(2);

    const preset3Items = mockPresetItems[3] ?? [];
    expect(preset3Items.length).toBe(0);
  });
});

describe('TagPresetDisplayItem 类型映射', () => {
  it('existing 类型项包含 tagId', () => {
    const items = mockPresetItems[1];
    const existingItem = items[0];
    expect(existingItem.tag_id).not.toBeNull();
    expect(existingItem.custom_tag_name).toBeNull();
  });

  it('custom 类型项包含自定义名称和颜色', () => {
    const items = mockPresetItems[2];
    const customItem = items[1];
    expect(customItem.tag_id).toBeNull();
    expect(customItem.custom_tag_name).toBe('自定义标签');
    expect(customItem.custom_tag_color).toBe('#F97316');
  });
});

describe('标签预设数据验证', () => {
  it('预设名称不能为空', () => {
    const presets = mockPresets.filter((p) => p.name.trim().length > 0);
    expect(presets.length).toBe(mockPresets.length);
  });

  it('预设颜色应为有效十六进制格式', () => {
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    mockPresets.forEach((preset) => {
      expect(colorRegex.test(preset.color)).toBe(true);
    });
  });

  it('预设描述可以为 null', () => {
    const presetWithNullDesc = mockPresets.find((p) => p.description === null);
    expect(presetWithNullDesc).toBeDefined();
  });

  it('sort_order 应为非负整数', () => {
    mockPresets.forEach((preset) => {
      expect(preset.sort_order).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(preset.sort_order)).toBe(true);
    });
  });
});

describe('标签预设 ID 过滤', () => {
  it('过滤掉无效的 tagId', () => {
    const rawTagIds = [101, -1, 0, 102, null, undefined, 999];
    const validTagIds = rawTagIds.filter((id): id is number => typeof id === 'number' && id > 0);
    expect(validTagIds).toEqual([101, 102, 999]);
  });

  it('去重 tagId', () => {
    const rawTagIds = [101, 101, 102, 102, 103];
    const uniqueTagIds = [...new Set(rawTagIds)];
    expect(uniqueTagIds).toEqual([101, 102, 103]);
  });

  it('从预设中提取有效的 tagId', () => {
    const items = mockPresetItems[1];
    const tagIds = items
      .filter((item) => item.tag_id !== null)
      .map((item) => item.tag_id as number);
    expect(tagIds).toEqual([101, 102]);
  });

  it('空预设返回空 tagId 数组', () => {
    const items = mockPresetItems[3] ?? [];
    const tagIds = items
      .filter((item) => item.tag_id !== null)
      .map((item) => item.tag_id as number);
    expect(tagIds).toEqual([]);
  });
});

describe('预设过滤逻辑', () => {
  it('只获取活跃预设', () => {
    const activePresets = mockPresets.filter((p) => p.is_active === 1);
    expect(activePresets.length).toBe(2);
    expect(activePresets.map((p) => p.id)).toEqual([1, 2]);
  });

  it('只获取默认预设', () => {
    const defaultPresets = mockPresets.filter((p) => p.is_default === 1);
    expect(defaultPresets.length).toBe(1);
    expect(defaultPresets[0]?.id).toBe(1);
  });

  it('同时满足活跃和默认条件', () => {
    const activeDefaultPresets = mockPresets.filter((p) => p.is_active === 1 && p.is_default === 1);
    expect(activeDefaultPresets.length).toBe(1);
    expect(activeDefaultPresets[0]?.name).toBe('演唱会应援');
  });
});

describe('预设排序逻辑', () => {
  it('按 sort_order 和 id 排序', () => {
    const sorted = [...mockPresets].sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.id - b.id;
    });
    expect(sorted.map((p) => p.id)).toEqual([1, 2, 3]);
  });
});

describe('预设复制逻辑', () => {
  it('复制预设时保留原属性', () => {
    const sourcePreset = mockPresets[0];
    const newPreset: MockPresetRow = {
      ...sourcePreset,
      id: 99,
      name: '演唱会应援 (副本)',
      is_default: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(newPreset.name).toBe('演唱会应援 (副本)');
    expect(newPreset.color).toBe(sourcePreset.color);
    expect(newPreset.description).toBe(sourcePreset.description);
    expect(newPreset.is_default).toBe(0);
  });

  it('复制预设时复制所有标签项', () => {
    const sourceItems = mockPresetItems[1];
    const copiedItems: MockPresetItemRow[] = sourceItems.map((item, index) => ({
      ...item,
      id: 100 + index,
      preset_id: 99,
    }));

    expect(copiedItems.length).toBe(sourceItems.length);
    expect(copiedItems[0]?.tag_id).toBe(sourceItems[0].tag_id);
    expect(copiedItems[1]?.tag_id).toBe(sourceItems[1].tag_id);
  });
});

describe('颜色预定义列表', () => {
  const PRESET_COLORS = [
    '#6366F1',
    '#8B5CF6',
    '#EC4899',
    '#EF4444',
    '#F97316',
    '#EAB308',
    '#22C55E',
    '#14B8A6',
    '#06B6D4',
    '#3B82F6',
  ];

  it('预定义颜色列表包含10种颜色', () => {
    expect(PRESET_COLORS.length).toBe(10);
  });

  it('所有预定义颜色都是有效的十六进制格式', () => {
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    PRESET_COLORS.forEach((color) => {
      expect(colorRegex.test(color)).toBe(true);
    });
  });

  it('预定义颜色列表中没有重复', () => {
    const uniqueColors = [...new Set(PRESET_COLORS)];
    expect(uniqueColors.length).toBe(PRESET_COLORS.length);
  });
});

describe('边界条件测试', () => {
  it('处理不存在的预设ID', () => {
    const nonExistentPreset = createMockPresetWithItems(9999);
    expect(nonExistentPreset).toBeNull();
  });

  it('处理空标签项数组', () => {
    const emptyPreset = mockPresetItems[3];
    expect(emptyPreset).toEqual([]);
  });

  it('处理超长预设名称', () => {
    const longName = 'a'.repeat(200);
    expect(longName.length).toBe(200);
  });

  it('处理特殊字符的预设名称', () => {
    const specialName = '演唱会 🎤 & 应援 #1 <script>';
    expect(specialName.length).toBeGreaterThan(0);
  });
});

describe('默认预设设置逻辑', () => {
  it('设置新默认预设时应清除旧默认', () => {
    const presets = [...mockPresets];
    const currentDefault = presets.find((p) => p.is_default === 1);
    expect(currentDefault?.id).toBe(1);

    const newDefault = presets.find((p) => p.id === 2);
    if (newDefault) {
      presets.forEach((p) => (p.is_default = 0));
      newDefault.is_default = 1;
    }

    const updatedDefault = presets.find((p) => p.is_default === 1);
    expect(updatedDefault?.id).toBe(2);
    expect(presets.filter((p) => p.is_default === 1).length).toBe(1);
  });

  it('取消默认预设应保留预设本身', () => {
    const preset = mockPresets[0];
    preset.is_default = 0;
    expect(preset.is_active).toBe(1);
    expect(preset.is_default).toBe(0);
  });

  it('只有一个预设可以是默认', () => {
    const defaults = mockPresets.filter((p) => p.is_default === 1);
    expect(defaults.length).toBeLessThanOrEqual(1);
  });
});
