/** 通用分页/排序参数 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
}

/** 键值对 */
export type KV = Record<string, unknown>;
