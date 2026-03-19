import type { SQLiteDatabase } from 'expo-sqlite';
import { KV_SCHEMA_VERSION } from '@/shared/constants';

export const version = 3;
export const name = '003_seed_additional_default_tags';

const DEFAULT_COLOR = '#6B7280';

interface CategorySeed {
  name: string;
  color: string;
  sortOrder: number;
}

interface TagSeed {
  name: string;
  sortOrder: number;
}

interface CategoryWithTagsSeed {
  category: CategorySeed;
  tags: TagSeed[];
}

const SEEDS: CategoryWithTagsSeed[] = [
  {
    category: { name: '切奇尺寸', color: DEFAULT_COLOR, sortOrder: 50 },
    tags: [
      { name: '三寸', sortOrder: 10 },
      { name: '五寸', sortOrder: 20 },
    ],
  },
  {
    category: { name: '切奇人数', color: DEFAULT_COLOR, sortOrder: 60 },
    tags: [
      { name: '单人', sortOrder: 10 },
      { name: '合影', sortOrder: 20 },
      { name: 'CP', sortOrder: 30 },
      { name: '夹心', sortOrder: 40 },
      { name: '全员', sortOrder: 50 },
      { name: '围拍', sortOrder: 60 },
    ],
  },
  {
    category: { name: '签绘状态', color: DEFAULT_COLOR, sortOrder: 70 },
    tags: [
      { name: '无签', sortOrder: 10 },
      { name: '带签', sortOrder: 20 },
      { name: '背签', sortOrder: 30 },
      { name: '主题', sortOrder: 40 },
      { name: '宿题', sortOrder: 50 },
    ],
  },
  {
    category: { name: '返图状态', color: DEFAULT_COLOR, sortOrder: 80 },
    tags: [
      { name: '已返', sortOrder: 10 },
    ],
  },
  {
    category: { name: '获取渠道', color: DEFAULT_COLOR, sortOrder: 90 },
    tags: [
      { name: '物贩', sortOrder: 10 },
      { name: '电切', sortOrder: 20 },
      { name: '盲盒', sortOrder: 30 },
      { name: '抽奖', sortOrder: 40 },
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
        color: category.color,
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
