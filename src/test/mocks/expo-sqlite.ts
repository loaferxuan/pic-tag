type RunResult = { lastInsertRowId?: number };

type MockDb = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: unknown[]) => Promise<RunResult>;
  getFirstAsync: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
  getAllAsync: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  closeAsync: () => Promise<void>;
};

const mockDb: MockDb = {
  async execAsync() {},
  async runAsync() {
    return { lastInsertRowId: 1 };
  },
  async getFirstAsync<T>() {
    return null as T | null;
  },
  async getAllAsync<T>() {
    return [] as T[];
  },
  async closeAsync() {},
};

export async function openDatabaseAsync(): Promise<MockDb> {
  return mockDb;
}
