import type { SQLiteDatabase } from 'expo-sqlite';
import { KV_SCHEMA_VERSION } from '@/shared/constants';
import * as seedDefaultTags from './seed-default-tags';
import * as seedAdditionalTags from './seed-additional-default-tags';

export const DATABASE_SCHEMA_VERSION = 1;

async function getCurrentSchemaVersion(db: SQLiteDatabase): Promise<number> {
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM kv_store WHERE key = ?`,
      [KV_SCHEMA_VERSION]
    );
    if (!row) return 0;
    const parsed = Number.parseInt(row.value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

async function rebuildSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS photo_tags;
    DROP TABLE IF EXISTS photo_default_tag_pending;
    DROP TABLE IF EXISTS import_pending_photo_tag_links;
    DROP TABLE IF EXISTS photos;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS tag_categories;
    DROP TABLE IF EXISTS kv_store;
    DROP TABLE IF EXISTS photo_albums;
    DROP TABLE IF EXISTS albums;

    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tag_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6B7280',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      external_id TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6B7280',
      icon TEXT,
      category_id INTEGER REFERENCES tag_categories(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      external_id TEXT
    );

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uri TEXT NOT NULL,
      filename TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      file_size INTEGER NOT NULL DEFAULT 0,
      captured_at_unix_sec INTEGER,
      taken_date TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT,
      notes TEXT,
      source_asset_id TEXT,
      source_provider TEXT NOT NULL DEFAULT 'unknown',
      mime_type TEXT,
      fingerprint_status TEXT NOT NULL DEFAULT 'not_requested',
      fingerprint_md5 TEXT,
      fingerprint_sha256 TEXT,
      fingerprint_algo TEXT,
      fingerprint_version INTEGER NOT NULL DEFAULT 2,
      fingerprint_updated_at TEXT,
      fingerprint_error TEXT
    );

    CREATE TABLE IF NOT EXISTS photo_tags (
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      tagged_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (photo_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS photo_default_tag_pending (
      photo_id INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
      snapshot_tag_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_pending_photo_tag_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER,
      fingerprint_md5 TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      source_asset_id TEXT,
      taken_date TEXT,
      tag_external_ids_json TEXT NOT NULL,
      notes TEXT,
      reason TEXT NOT NULL CHECK (reason IN ('NOT_FOUND', 'AMBIGUOUS', 'MISSING_TAGS')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_attempt_at TEXT,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_photos_imported_at ON photos(imported_at);
    CREATE INDEX IF NOT EXISTS idx_photos_taken_date ON photos(taken_date);
    CREATE INDEX IF NOT EXISTS idx_photo_tags_photo_id ON photo_tags(photo_id);
    CREATE INDEX IF NOT EXISTS idx_photo_tags_tag_id ON photo_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_tags_category_id ON tags(category_id);

    CREATE INDEX IF NOT EXISTS idx_photos_fingerprint_md5_size
      ON photos(fingerprint_md5, file_size)
      WHERE fingerprint_md5 IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_photos_fingerprint_sha256_size
      ON photos(fingerprint_sha256, file_size)
      WHERE fingerprint_sha256 IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_photos_fingerprint_status
      ON photos(fingerprint_status);
    CREATE INDEX IF NOT EXISTS idx_photos_source_asset_id
      ON photos(source_asset_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_categories_external_id_unique
      ON tag_categories(external_id)
      WHERE external_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_external_id_unique
      ON tags(external_id)
      WHERE external_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_pending_links_md5_size
      ON import_pending_photo_tag_links(fingerprint_md5, file_size)
      WHERE resolved_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pending_links_source_asset_id
      ON import_pending_photo_tag_links(source_asset_id)
      WHERE resolved_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pending_links_photo_id
      ON import_pending_photo_tag_links(photo_id)
      WHERE resolved_at IS NULL AND photo_id IS NOT NULL;
  `);
}

export async function initializeDatabaseSchema(db: SQLiteDatabase): Promise<void> {
  const current = await getCurrentSchemaVersion(db);
  if (current === DATABASE_SCHEMA_VERSION) return;

  await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
    await rebuildSchema(db);
    await seedDefaultTags.up(db);
    await seedAdditionalTags.up(db);

    await db.execAsync(`
      UPDATE tag_categories
      SET external_id = lower(hex(randomblob(16)))
      WHERE external_id IS NULL;

      UPDATE tags
      SET external_id = lower(hex(randomblob(16)))
      WHERE external_id IS NULL;
    `);

    await db.runAsync(
      `INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [KV_SCHEMA_VERSION, String(DATABASE_SCHEMA_VERSION)]
    );

    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
