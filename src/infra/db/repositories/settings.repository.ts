import type { SQLiteDatabase } from 'expo-sqlite';

export class SettingsRepository {
  constructor(private db: SQLiteDatabase) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM kv_store WHERE key = ?',
      [key]
    );
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, value]
    );
  }
}
