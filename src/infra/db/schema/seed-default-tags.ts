import type { SQLiteDatabase } from 'expo-sqlite';
import { KV_SCHEMA_VERSION } from '@/shared/constants';

export const version = 2;
export const name = '002_seed_default_tags';

const DEFAULT_COLOR = '#808080';

const NAMED_COLORS: Record<string, string> = {
  '黄色': '#FFFF00',
  '紫色': '#800080',
  '粉色': '#FFC0CB',
  '蓝色': '#0000FF',
  '橙色': '#FFA500',
  '红色': '#FF0000',
  '金色': '#D4AF37',
  '绿色': '#008000',
  '黑色': '#111111',
  '紫灰色': '#7E6D8A',
  '白色': '#FFFFFF',
  '奶黄色': '#FFF3B0',
  '荧光绿': '#39FF14',
  '银灰色': '#AAA9A9',
  '月白色': '#F3FBFF',
  '水色': '#7FDBFF',
};

interface CategorySeed {
  name: string;
  color: string;
  sortOrder: number;
}

interface TagSeed {
  name: string;
  sortOrder: number;
  colorHex?: string;
  colorName?: keyof typeof NAMED_COLORS;
}

interface CategoryWithTagsSeed {
  category: CategorySeed;
  tags: TagSeed[];
}

const SEEDS: CategoryWithTagsSeed[] = [
  {
    category: { name: '团体', color: DEFAULT_COLOR, sortOrder: 10 },
    tags: [
      { name: '摩多魔多', sortOrder: 10, colorName: '红色' },
      { name: '獸獸大作戰', sortOrder: 20, colorName: '粉色' },
      { name: 'idolzoo', sortOrder: 30, colorName: '蓝色' },
      { name: '青隅NOISE', sortOrder: 40, colorHex: '#00B4D8' },
      { name: 'PON', sortOrder: 50, colorName: '黄色' },
      { name: 'HelluTa', sortOrder: 60, colorName: '黑色' },
    ],
  },
  {
    category: { name: '小偶像', color: DEFAULT_COLOR, sortOrder: 20 },
    tags: [
      { name: '星星', sortOrder: 10, colorName: '黄色' },
      { name: 'Suiki', sortOrder: 20, colorName: '紫色' },
      { name: '桃奈', sortOrder: 30, colorName: '粉色' },
      { name: '织织', sortOrder: 40, colorName: '蓝色' },
      { name: '皮皮猪', sortOrder: 50, colorName: '橙色' },
      { name: '南枝', sortOrder: 60, colorName: '红色' },
      { name: '小仔', sortOrder: 70, colorName: '金色' },
      { name: 'Hina', sortOrder: 80, colorName: '蓝色' },
      { name: '苏苏', sortOrder: 90, colorName: '绿色' },
      { name: '面面', sortOrder: 100, colorName: '紫灰色' },
      { name: '猫猫虫', sortOrder: 110, colorName: '绿色' },
      { name: '饺子', sortOrder: 120, colorName: '黄色' },
      { name: '呆呆', sortOrder: 130, colorName: '紫色' },
      { name: '栗了子', sortOrder: 140, colorName: '红色' },
      { name: '龙傲娇', sortOrder: 150, colorName: '蓝色' },
      { name: 'Sara', sortOrder: 160, colorHex: '#473CD3' },
      { name: '小曦', sortOrder: 170, colorName: '奶黄色' },
      { name: '受受', sortOrder: 180, colorName: '荧光绿' },
      { name: 'SOUKI', sortOrder: 190, colorName: '银灰色' },
      { name: 'YUNOKA', sortOrder: 200, colorName: '月白色' },
      { name: 'niku', sortOrder: 210, colorName: '红色' },
      { name: 'Riri', sortOrder: 220, colorName: '白色' },
      { name: 'Boku', sortOrder: 230, colorName: '紫色' },
      { name: 'ivy', sortOrder: 240, colorName: '粉色' },
      { name: 'Towa', sortOrder: 250, colorName: '紫色' },
      { name: 'Saya', sortOrder: 260, colorName: '蓝色' },
      { name: 'Asano', sortOrder: 270, colorName: '水色' },
      { name: 'Yusakii', sortOrder: 280, colorName: '红色' },
    ],
  },
  {
    category: { name: '地点', color: DEFAULT_COLOR, sortOrder: 30 },
    tags: [
      { name: '天府红', sortOrder: 10 },
      { name: '高升桥不歪', sortOrder: 20 },
      { name: '西村', sortOrder: 30 },
      { name: '红仓', sortOrder: 40 },
      { name: 'MAO Livehouse', sortOrder: 50 },
      { name: '福馆1号馆', sortOrder: 60 },
      { name: '福馆2号馆', sortOrder: 70 },
      { name: '正火6号馆', sortOrder: 80 },
    ],
  },
  {
    category: { name: '城市', color: DEFAULT_COLOR, sortOrder: 40 },
    tags: [
      { name: '成都', sortOrder: 10 },
      { name: '重庆', sortOrder: 20 },
      { name: '北京', sortOrder: 30 },
      { name: '上海', sortOrder: 40 },
      { name: '广州', sortOrder: 50 },
    ],
  },
];

function normalizeHexColor(color: string): string {
  const trimmed = color.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  return DEFAULT_COLOR;
}

function resolveTagColor(tag: TagSeed, categoryColor: string): string {
  if (tag.colorHex) {
    return normalizeHexColor(tag.colorHex);
  }
  if (tag.colorName) {
    const mapped = NAMED_COLORS[tag.colorName];
    if (mapped) {
      return normalizeHexColor(mapped);
    }
  }
  return normalizeHexColor(categoryColor || DEFAULT_COLOR);
}

async function ensureCategory(
  db: SQLiteDatabase,
  data: CategorySeed
): Promise<{ id: number; color: string }> {
  const existing = await db.getFirstAsync<{ id: number; color: string }>(
    `
      SELECT id, color
      FROM tag_categories
      WHERE name = ?
      ORDER BY id ASC
      LIMIT 1
    `,
    [data.name]
  );
  if (existing) {
    return { id: existing.id, color: normalizeHexColor(existing.color) };
  }

  const result = await db.runAsync(
    'INSERT INTO tag_categories (name, color, sort_order) VALUES (?, ?, ?)',
    [data.name, normalizeHexColor(data.color), data.sortOrder]
  );
  return {
    id: Number(result.lastInsertRowId),
    color: normalizeHexColor(data.color),
  };
}

async function ensureTag(
  db: SQLiteDatabase,
  data: {
    name: string;
    color: string;
    categoryId: number | null;
    sortOrder: number;
  }
): Promise<void> {
  let existing: { id: number } | null = null;

  if (data.categoryId === null) {
    existing = await db.getFirstAsync<{ id: number }>(
      `
        SELECT id
        FROM tags
        WHERE name = ? AND category_id IS NULL
        ORDER BY id ASC
        LIMIT 1
      `,
      [data.name]
    );
  } else {
    existing = await db.getFirstAsync<{ id: number }>(
      `
        SELECT id
        FROM tags
        WHERE name = ? AND category_id = ?
        ORDER BY id ASC
        LIMIT 1
      `,
      [data.name, data.categoryId]
    );
  }

  if (existing) return;

  await db.runAsync(
    'INSERT INTO tags (name, color, icon, category_id, sort_order) VALUES (?, ?, ?, ?, ?)',
    [data.name, normalizeHexColor(data.color), null, data.categoryId, data.sortOrder]
  );
}

export async function up(db: SQLiteDatabase): Promise<void> {
  for (const seed of SEEDS) {
    const category = await ensureCategory(db, seed.category);
    for (const tag of seed.tags) {
      await ensureTag(db, {
        name: tag.name,
        color: resolveTagColor(tag, category.color),
        categoryId: category.id,
        sortOrder: tag.sortOrder,
      });
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
    [KV_SCHEMA_VERSION, String(version)]
  );
}
