import type { SQLiteDatabase } from 'expo-sqlite';
import type { TimeStatsGranularity } from '@/shared/types/domain';

export interface TagUsageByCategoryRawRow {
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  tag_id: number;
  tag_name: string;
  tag_color: string;
  photo_count: number;
}

export interface CategoryCoverageRawRow {
  category_id: number | null;
  coverage_photo_count: number;
}

export interface TakenDateBucketRawRow {
  bucket_key: string;
  photo_count: number;
}

const DATED_PHOTO_WHERE_CLAUSE = `taken_date IS NOT NULL AND TRIM(taken_date) <> '' AND length(taken_date) >= 10`;
const UNDATED_PHOTO_WHERE_CLAUSE = `taken_date IS NULL OR TRIM(taken_date) = ''`;

function resolveBucketExpression(granularity: TimeStatsGranularity): string {
  if (granularity === 'year') return `substr(taken_date, 1, 4)`;
  if (granularity === 'day') return `substr(taken_date, 1, 10)`;
  return `substr(taken_date, 1, 7)`;
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.floor(value);
}

function normalizeOffset(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export class StatsRepository {
  constructor(private db: SQLiteDatabase) {}

  async getTagUsageByCategoryRaw(): Promise<TagUsageByCategoryRawRow[]> {
    return this.db.getAllAsync<TagUsageByCategoryRawRow>(
      `SELECT
         c.id AS category_id,
         c.name AS category_name,
         c.color AS category_color,
         t.id AS tag_id,
         t.name AS tag_name,
         t.color AS tag_color,
         COUNT(pt.photo_id) AS photo_count
       FROM tags t
       LEFT JOIN tag_categories c ON c.id = t.category_id
       LEFT JOIN photo_tags pt ON pt.tag_id = t.id
       GROUP BY t.id
       ORDER BY photo_count DESC, t.name ASC`
    );
  }

  async getCategoryCoverageRaw(): Promise<CategoryCoverageRawRow[]> {
    return this.db.getAllAsync<CategoryCoverageRawRow>(
      `SELECT
         t.category_id AS category_id,
         COUNT(DISTINCT pt.photo_id) AS coverage_photo_count
       FROM tags t
       LEFT JOIN photo_tags pt ON pt.tag_id = t.id
       GROUP BY t.category_id`
    );
  }

  async getUntaggedCount(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM photos p
       WHERE NOT EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id)`
    );
    return row?.count ?? 0;
  }

  async getTotalPhotoCount(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM photos');
    return row?.count ?? 0;
  }

  async getUnresolvedAssociationPhotoCount(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(DISTINCT photo_id) AS count
       FROM import_pending_photo_tag_links
       WHERE resolved_at IS NULL
         AND reason = 'NOT_FOUND'
         AND photo_id IS NOT NULL`
    );
    return row?.count ?? 0;
  }

  async getTakenDateBucketsRaw(
    granularity: TimeStatsGranularity,
    limit: number,
    offset: number
  ): Promise<TakenDateBucketRawRow[]> {
    const safeLimit = normalizeLimit(limit);
    const safeOffset = normalizeOffset(offset);
    const bucketExpr = resolveBucketExpression(granularity);
    return this.db.getAllAsync<TakenDateBucketRawRow>(
      `SELECT
         ${bucketExpr} AS bucket_key,
         COUNT(1) AS photo_count
       FROM photos
       WHERE ${DATED_PHOTO_WHERE_CLAUSE}
       GROUP BY bucket_key
       ORDER BY bucket_key DESC
       LIMIT ? OFFSET ?`,
      [safeLimit, safeOffset]
    );
  }

  async countTakenDateBuckets(granularity: TimeStatsGranularity): Promise<number> {
    const bucketExpr = resolveBucketExpression(granularity);
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(DISTINCT ${bucketExpr}) AS count
       FROM photos
       WHERE ${DATED_PHOTO_WHERE_CLAUSE}`
    );
    return row?.count ?? 0;
  }

  async getUndatedPhotoCount(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM photos
       WHERE ${UNDATED_PHOTO_WHERE_CLAUSE}`
    );
    return row?.count ?? 0;
  }

  async getDatedPhotoCount(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM photos
       WHERE ${DATED_PHOTO_WHERE_CLAUSE}`
    );
    return row?.count ?? 0;
  }
}
