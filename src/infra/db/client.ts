import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { DB_NAME } from '@/shared/constants';
import { initializeDatabaseSchema } from './schema/initialize-schema';

let db: SQLiteDatabase | null = null;
let initPromise: Promise<SQLiteDatabase> | null = null;

/**
 * 获取数据库连接（单例）。首次调用时打开数据库并初始化数据库结构。
 */
export async function getDb(): Promise<SQLiteDatabase> {
  if (db) return db;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const database = await openDatabaseAsync(DB_NAME);
    await initializeDatabaseSchema(database);
    db = database;
    return database;
  })();
  return initPromise;
}

/**
 * 关闭数据库连接（用于测试或重置）
 */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    initPromise = null;
  }
}
