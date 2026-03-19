import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  ImportPendingPhotoTagLinkRow,
  ImportPendingReason,
  PhotoDefaultTagPendingRow,
  PhotoFingerprintAlgorithm,
  PhotoFingerprintStatus,
  PhotoRow,
  PhotoSourceProvider,
} from '@/shared/types/database';
import type { QueryOptions } from '@/shared/types/common';
import type { PhotoQueryOptions } from '@/shared/types/domain';

const VALID_ORDER_COLUMNS = ['id', 'imported_at', 'taken_date', 'filename'] as const;
type OrderColumn = (typeof VALID_ORDER_COLUMNS)[number];
type OrderDirection = 'ASC' | 'DESC';

function resolveOrderColumn(orderBy?: string): OrderColumn {
  if (orderBy && VALID_ORDER_COLUMNS.includes(orderBy as OrderColumn)) {
    return orderBy as OrderColumn;
  }
  return 'taken_date';
}

function resolveOrderDirection(orderDir?: string): OrderDirection {
  return orderDir === 'ASC' ? 'ASC' : 'DESC';
}

function buildOrderByClause(col: OrderColumn, dir: OrderDirection): string {
  if (col === 'taken_date') {
    return `CASE WHEN taken_date IS NULL THEN 0 ELSE 1 END ASC, taken_date ${dir}, imported_at ${dir}, id ${dir}`;
  }
  return `${col} ${dir}, id ${dir}`;
}

function normalizeTagIds(tagIds: number[]): number[] {
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const tagId of tagIds) {
    if (!Number.isInteger(tagId) || tagId <= 0 || seen.has(tagId)) continue;
    seen.add(tagId);
    normalized.push(tagId);
  }
  return normalized;
}

function normalizeUnknownTagIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const numbers: number[] = [];
  for (const item of raw) {
    const candidate =
      typeof item === 'number'
        ? item
        : typeof item === 'string'
          ? Number(item)
          : NaN;
    if (Number.isInteger(candidate) && candidate > 0) {
      numbers.push(candidate);
    }
  }
  return normalizeTagIds(numbers);
}

function normalizeNonEmptyText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeUnixSecond(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function normalizePendingNotesToken(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : '';
}

function normalizeTagExternalIdsJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return raw;
    const normalized = Array.from(
      new Set(
        parsed
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
    return JSON.stringify(normalized);
  } catch {
    return raw;
  }
}

type FingerprintStatePatch = Partial<{
  fingerprint_status: PhotoFingerprintStatus;
  fingerprint_md5: string | null;
  fingerprint_sha256: string | null;
  fingerprint_algo: PhotoFingerprintAlgorithm | null;
  fingerprint_version: number;
  fingerprint_updated_at: string | null;
  fingerprint_error: string | null;
}>;

type PhotoFilters = {
  tagIds?: number[];
  tagMatchMode?: 'AND' | 'OR';
  onlyUntagged?: boolean;
  missingCategoryId?: number;
  dateFrom?: string;
  dateTo?: string;
  onlyUnresolvedAssociation?: boolean;
};

export interface BackupPhotoTagJoinRow {
  photo_id: number;
  fingerprint_md5: string | null;
  file_size: number;
  source_asset_id: string | null;
  taken_date: string | null;
  filename: string;
  notes: string | null;
  tag_id: number | null;
}

export class PhotoRepository {
  constructor(private db: SQLiteDatabase) {}

  async findById(id: number): Promise<PhotoRow | null> {
    const row = await this.db.getFirstAsync<PhotoRow>('SELECT * FROM photos WHERE id = ?', [id]);
    return row ?? null;
  }

  async findAll(options?: PhotoQueryOptions): Promise<PhotoRow[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const col = resolveOrderColumn(options?.orderBy);
    const dir = resolveOrderDirection(options?.orderDir);
    const orderByClause = buildOrderByClause(col, dir);

    if (options?.filters && Object.keys(options.filters).length > 0) {
      return this.findByFilters(options.filters, { limit, offset, orderBy: col, orderDir: dir });
    }

    const rows = await this.db.getAllAsync<PhotoRow>(
      `SELECT * FROM photos ORDER BY ${orderByClause} LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return rows;
  }

  async findByFilters(
    filters: PhotoFilters,
    options?: QueryOptions
  ): Promise<PhotoRow[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const col = resolveOrderColumn(options?.orderBy);
    const dir = resolveOrderDirection(options?.orderDir);
    const orderByClause = buildOrderByClause(col, dir);
    const { whereClause, params } = this.buildFilterWhereClause(filters);
    params.push(limit, offset);
    const rows = await this.db.getAllAsync<PhotoRow>(
      `SELECT * FROM photos ${whereClause} ORDER BY ${orderByClause} LIMIT ? OFFSET ?`,
      params
    );
    return rows;
  }

  async countByFilters(filters?: PhotoFilters): Promise<number> {
    const { whereClause, params } = this.buildFilterWhereClause(filters);
    const row = await this.db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(1) AS total FROM photos ${whereClause}`,
      params
    );
    return row?.total ?? 0;
  }

  private buildFilterWhereClause(filters?: PhotoFilters): {
    whereClause: string;
    params: (string | number)[];
  } {
    if (!filters) {
      return { whereClause: '', params: [] };
    }

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    const normalizedTagIds = normalizeTagIds(filters.tagIds ?? []);
    if (normalizedTagIds.length > 0) {
      const mode = filters.tagMatchMode === 'OR' ? 'OR' : 'AND';
      if (mode === 'AND') {
        for (const tagId of normalizedTagIds) {
          conditions.push('id IN (SELECT photo_id FROM photo_tags WHERE tag_id = ?)');
          params.push(tagId);
        }
      } else {
        conditions.push(
          `id IN (SELECT photo_id FROM photo_tags WHERE tag_id IN (${normalizedTagIds.map(() => '?').join(',')}))`
        );
        params.push(...normalizedTagIds);
      }
    }

    if (filters.onlyUntagged === true) {
      conditions.push(
        `NOT EXISTS (
          SELECT 1
          FROM photo_tags pt
          WHERE pt.photo_id = photos.id
        )`
      );
    }

    if (
      filters.missingCategoryId != null &&
      Number.isInteger(filters.missingCategoryId) &&
      filters.missingCategoryId > 0
    ) {
      conditions.push(
        `NOT EXISTS (
          SELECT 1
          FROM photo_tags pt
          INNER JOIN tags t ON t.id = pt.tag_id
          WHERE pt.photo_id = photos.id
            AND t.category_id = ?
        )`
      );
      params.push(filters.missingCategoryId);
    }

    if (filters.dateFrom) {
      conditions.push('(taken_date IS NOT NULL AND taken_date >= ?)');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('(taken_date IS NOT NULL AND taken_date <= ?)');
      params.push(filters.dateTo);
    }
    if (filters.onlyUnresolvedAssociation === true) {
      conditions.push(
        `EXISTS (
          SELECT 1
          FROM import_pending_photo_tag_links p
          WHERE p.photo_id = photos.id
            AND p.resolved_at IS NULL
            AND p.reason = 'NOT_FOUND'
        )`
      );
    }

    return {
      whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  async create(data: {
    uri: string;
    filename: string;
    width?: number;
    height?: number;
    file_size?: number;
    captured_at_unix_sec?: number | null;
    taken_date?: string | null;
    metadata_json?: string | null;
    notes?: string | null;
    source_asset_id?: string | null;
    source_provider?: PhotoSourceProvider;
    mime_type?: string | null;
    fingerprint_status?: PhotoFingerprintStatus;
  }): Promise<PhotoRow> {
    const result = await this.db.runAsync(
      `INSERT INTO photos (
         uri,
         filename,
         width,
         height,
         file_size,
         captured_at_unix_sec,
         taken_date,
         metadata_json,
         notes,
         source_asset_id,
         source_provider,
         mime_type,
         fingerprint_status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.uri,
        data.filename,
        data.width ?? 0,
        data.height ?? 0,
        data.file_size ?? 0,
        normalizeUnixSecond(data.captured_at_unix_sec),
        data.taken_date ?? null,
        data.metadata_json ?? null,
        data.notes ?? null,
        data.source_asset_id ?? null,
        data.source_provider ?? 'unknown',
        data.mime_type ?? null,
        data.fingerprint_status ?? 'not_requested',
      ]
    );
    const id = Number(result.lastInsertRowId);
    const row = await this.findById(id);
    if (!row) throw new Error('创建照片后读取失败');
    return row;
  }

  async update(
    id: number,
    data: Partial<{
      notes: string | null;
      metadata_json: string | null;
      taken_date: string | null;
    }>
  ): Promise<PhotoRow> {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }
    if (data.metadata_json !== undefined) {
      updates.push('metadata_json = ?');
      params.push(data.metadata_json);
    }
    if (data.taken_date !== undefined) {
      updates.push('taken_date = ?');
      params.push(data.taken_date);
    }
    if (updates.length === 0) {
      const row = await this.findById(id);
      if (!row) throw new Error('照片不存在');
      return row;
    }
    params.push(id);
    await this.db.runAsync(
      `UPDATE photos SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    const row = await this.findById(id);
    if (!row) throw new Error('照片不存在');
    return row;
  }

  async delete(id: number): Promise<void> {
    await this.db.runAsync('DELETE FROM photo_tags WHERE photo_id = ?', [id]);
    await this.db.runAsync('DELETE FROM photo_default_tag_pending WHERE photo_id = ?', [id]);
    await this.db.runAsync('DELETE FROM photos WHERE id = ?', [id]);
  }

  async updateMediaReference(
    id: number,
    data: Partial<{
      uri: string;
      filename: string;
      width: number;
      height: number;
      file_size: number;
      captured_at_unix_sec: number | null;
      source_asset_id: string | null;
      source_provider: PhotoSourceProvider;
      mime_type: string | null;
    }>
  ): Promise<PhotoRow> {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.uri !== undefined) {
      updates.push('uri = ?');
      params.push(data.uri);
    }
    if (data.filename !== undefined) {
      updates.push('filename = ?');
      params.push(data.filename);
    }
    if (data.width !== undefined) {
      updates.push('width = ?');
      params.push(data.width);
    }
    if (data.height !== undefined) {
      updates.push('height = ?');
      params.push(data.height);
    }
    if (data.file_size !== undefined) {
      const normalizedSize = Number.isFinite(data.file_size)
        ? Math.max(0, Math.floor(data.file_size))
        : 0;
      updates.push('file_size = ?');
      params.push(normalizedSize);
    }
    if (data.captured_at_unix_sec !== undefined) {
      updates.push('captured_at_unix_sec = ?');
      params.push(normalizeUnixSecond(data.captured_at_unix_sec));
    }
    if (data.source_asset_id !== undefined) {
      updates.push('source_asset_id = ?');
      params.push(normalizeNonEmptyText(data.source_asset_id));
    }
    if (data.source_provider !== undefined) {
      updates.push('source_provider = ?');
      params.push(data.source_provider);
    }
    if (data.mime_type !== undefined) {
      updates.push('mime_type = ?');
      params.push(normalizeNonEmptyText(data.mime_type));
    }

    if (updates.length === 0) {
      const row = await this.findById(id);
      if (!row) throw new Error('照片不存在');
      return row;
    }

    params.push(id);
    await this.db.runAsync(`UPDATE photos SET ${updates.join(', ')} WHERE id = ?`, params);
    const row = await this.findById(id);
    if (!row) throw new Error('照片不存在');
    return row;
  }

  async getTagIds(photoId: number): Promise<number[]> {
    const rows = await this.db.getAllAsync<{ tag_id: number }>(
      'SELECT tag_id FROM photo_tags WHERE photo_id = ?',
      [photoId]
    );
    return rows.map((r) => r.tag_id);
  }

  async setTags(photoId: number, tagIds: number[]): Promise<void> {
    await this.db.runAsync('DELETE FROM photo_tags WHERE photo_id = ?', [photoId]);
    const now = new Date().toISOString();
    for (const tagId of tagIds) {
      await this.db.runAsync(
        'INSERT INTO photo_tags (photo_id, tag_id, tagged_at) VALUES (?, ?, ?)',
        [photoId, tagId, now]
      );
    }
  }

  async addTag(photoId: number, tagId: number): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      'INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, tagged_at) VALUES (?, ?, ?)',
      [photoId, tagId, now]
    );
  }

  async removeTag(photoId: number, tagId: number): Promise<void> {
    await this.db.runAsync('DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?', [
      photoId,
      tagId,
    ]);
  }

  async setPendingDefaultTags(photoId: number, tagIds: number[]): Promise<void> {
    const normalized = normalizeTagIds(tagIds);
    await this.db.runAsync(
      `INSERT OR REPLACE INTO photo_default_tag_pending (photo_id, snapshot_tag_ids_json, created_at)
       VALUES (?, ?, datetime('now'))`,
      [photoId, JSON.stringify(normalized)]
    );
  }

  async getPendingDefaultTags(photoId: number): Promise<number[] | null> {
    const row = await this.db.getFirstAsync<PhotoDefaultTagPendingRow>(
      'SELECT * FROM photo_default_tag_pending WHERE photo_id = ?',
      [photoId]
    );
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.snapshot_tag_ids_json) as unknown;
      return normalizeUnknownTagIds(parsed);
    } catch {
      return [];
    }
  }

  async clearPendingDefaultTags(photoId: number): Promise<void> {
    await this.db.runAsync('DELETE FROM photo_default_tag_pending WHERE photo_id = ?', [photoId]);
  }

  async updateFingerprintState(photoId: number, patch: FingerprintStatePatch): Promise<void> {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    if (patch.fingerprint_status !== undefined) {
      updates.push('fingerprint_status = ?');
      params.push(patch.fingerprint_status);
    }
    if (patch.fingerprint_md5 !== undefined) {
      updates.push('fingerprint_md5 = ?');
      params.push(patch.fingerprint_md5);
    }
    if (patch.fingerprint_sha256 !== undefined) {
      updates.push('fingerprint_sha256 = ?');
      params.push(patch.fingerprint_sha256);
    }
    if (patch.fingerprint_algo !== undefined) {
      updates.push('fingerprint_algo = ?');
      params.push(patch.fingerprint_algo);
    }
    if (patch.fingerprint_version !== undefined) {
      updates.push('fingerprint_version = ?');
      params.push(patch.fingerprint_version);
    }
    if (patch.fingerprint_updated_at !== undefined) {
      updates.push('fingerprint_updated_at = ?');
      params.push(patch.fingerprint_updated_at);
    }
    if (patch.fingerprint_error !== undefined) {
      updates.push('fingerprint_error = ?');
      params.push(patch.fingerprint_error);
    }
    if (updates.length === 0) return;
    params.push(photoId);
    await this.db.runAsync(
      `UPDATE photos SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }

  async findPendingFingerprintPhotos(limit = 100): Promise<PhotoRow[]> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100;
    const rows = await this.db.getAllAsync<PhotoRow>(
      `SELECT * FROM photos
       WHERE fingerprint_status = 'pending' AND fingerprint_md5 IS NULL
       ORDER BY id ASC
       LIMIT ?`,
      [safeLimit]
    );
    return rows;
  }

  async findByFingerprint(filters: {
    md5?: string;
    sha256?: string;
    fileSize?: number;
  }): Promise<PhotoRow[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.md5) {
      conditions.push('fingerprint_md5 = ?');
      params.push(filters.md5);
    }
    if (filters.sha256) {
      conditions.push('fingerprint_sha256 = ?');
      params.push(filters.sha256);
    }
    if (filters.fileSize !== undefined) {
      conditions.push('file_size = ?');
      params.push(filters.fileSize);
    }

    if (conditions.length === 0) return [];

    return this.db.getAllAsync<PhotoRow>(
      `SELECT * FROM photos WHERE ${conditions.join(' AND ')} ORDER BY id ASC`,
      params
    );
  }

  async findBySourceAssetId(sourceAssetId: string, fileSize?: number): Promise<PhotoRow[]> {
    const normalized = sourceAssetId.trim();
    if (!normalized) return [];

    if (fileSize !== undefined) {
      return this.db.getAllAsync<PhotoRow>(
        `SELECT * FROM photos
         WHERE source_asset_id = ? AND file_size = ?
         ORDER BY id ASC`,
        [normalized, fileSize]
      );
    }

    return this.db.getAllAsync<PhotoRow>(
      `SELECT * FROM photos WHERE source_asset_id = ? ORDER BY id ASC`,
      [normalized]
    );
  }

  async findByUri(uri: string, fileSize?: number): Promise<PhotoRow[]> {
    const normalized = uri.trim();
    if (!normalized) return [];

    if (fileSize !== undefined) {
      return this.db.getAllAsync<PhotoRow>(
        `SELECT * FROM photos
         WHERE uri = ? AND file_size = ?
         ORDER BY id ASC`,
        [normalized, fileSize]
      );
    }

    return this.db.getAllAsync<PhotoRow>(
      `SELECT * FROM photos WHERE uri = ? ORDER BY id ASC`,
      [normalized]
    );
  }

  async getTaggedPhotoLinksForBackup(): Promise<BackupPhotoTagJoinRow[]> {
    return this.db.getAllAsync<BackupPhotoTagJoinRow>(
      `SELECT
         p.id AS photo_id,
         p.fingerprint_md5,
         p.file_size,
         p.source_asset_id,
         p.taken_date,
         p.filename,
         p.notes,
         pt.tag_id
       FROM photos p
       LEFT JOIN photo_tags pt ON pt.photo_id = p.id
       WHERE pt.tag_id IS NOT NULL
          OR (p.notes IS NOT NULL AND TRIM(p.notes) <> '')
       ORDER BY p.id ASC, pt.tag_id ASC`
    );
  }

  async createImportPendingPhotoTagLink(data: {
    photo_id?: number | null;
    fingerprint_md5?: string | null;
    file_size?: number;
    source_asset_id?: string | null;
    taken_date?: string | null;
    tag_external_ids_json: string;
    notes?: string | null;
    reason: ImportPendingReason;
  }): Promise<void> {
    const normalizedPhotoId = normalizePositiveInteger(data.photo_id);
    const normalizedFingerprintMd5 = normalizeNonEmptyText(data.fingerprint_md5)?.toLowerCase() ?? null;
    const normalizedSourceAssetId = normalizeNonEmptyText(data.source_asset_id);
    const normalizedTakenDate = normalizeNonEmptyText(data.taken_date);
    const normalizedTagExternalIdsJson = normalizeTagExternalIdsJson(data.tag_external_ids_json);
    const normalizedNotes = normalizePendingNotesToken(data.notes);
    const rawFileSize = typeof data.file_size === 'number' ? data.file_size : 0;
    const fileSize = Number.isFinite(rawFileSize) ? Math.max(0, Math.floor(rawFileSize)) : 0;

    const duplicate = await this.db.getFirstAsync<{ id: number }>(
      `SELECT id
       FROM import_pending_photo_tag_links
       WHERE resolved_at IS NULL
         AND reason = ?
         AND file_size = ?
         AND tag_external_ids_json = ?
          AND COALESCE(fingerprint_md5, '') = COALESCE(?, '')
          AND COALESCE(source_asset_id, '') = COALESCE(?, '')
          AND COALESCE(taken_date, '') = COALESCE(?, '')
          AND COALESCE(photo_id, 0) = COALESCE(?, 0)
          AND notes IS ?
        LIMIT 1`,
      [
        data.reason,
        fileSize,
        normalizedTagExternalIdsJson,
        normalizedFingerprintMd5,
        normalizedSourceAssetId,
        normalizedTakenDate,
        normalizedPhotoId,
        normalizedNotes,
      ]
    );
    if (duplicate) return;

    await this.db.runAsync(
      `INSERT INTO import_pending_photo_tag_links (
         photo_id,
         fingerprint_md5,
         file_size,
         source_asset_id,
         taken_date,
         tag_external_ids_json,
         notes,
         reason,
         created_at,
         last_attempt_at,
         resolved_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), NULL, NULL)`,
      [
        normalizedPhotoId,
        normalizedFingerprintMd5,
        fileSize,
        normalizedSourceAssetId,
        normalizedTakenDate,
        normalizedTagExternalIdsJson,
        normalizedNotes,
        data.reason,
      ]
    );
  }

  async findUnresolvedImportPendingPhotoTagLinks(limit = 200): Promise<ImportPendingPhotoTagLinkRow[]> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200;
    return this.db.getAllAsync<ImportPendingPhotoTagLinkRow>(
      `SELECT *
       FROM import_pending_photo_tag_links
       WHERE resolved_at IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT ?`,
      [safeLimit]
    );
  }

  async countUnresolvedImportPendingPhotoTagLinks(): Promise<number> {
    const row = await this.db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(1) as total
       FROM import_pending_photo_tag_links
       WHERE resolved_at IS NULL`
    );
    return row?.total ?? 0;
  }

  async findUnresolvedPendingBySourceAsset(limit = 200): Promise<ImportPendingPhotoTagLinkRow[]> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200;
    return this.db.getAllAsync<ImportPendingPhotoTagLinkRow>(
      `SELECT *
       FROM import_pending_photo_tag_links
       WHERE resolved_at IS NULL
         AND reason = 'NOT_FOUND'
         AND source_asset_id IS NOT NULL
         AND TRIM(source_asset_id) <> ''
       ORDER BY created_at ASC, id ASC
       LIMIT ?`,
      [safeLimit]
    );
  }

  async findUnresolvedPendingByPhotoId(photoId: number): Promise<ImportPendingPhotoTagLinkRow[]> {
    const normalizedPhotoId = normalizePositiveInteger(photoId);
    if (!normalizedPhotoId) return [];
    return this.db.getAllAsync<ImportPendingPhotoTagLinkRow>(
      `SELECT *
       FROM import_pending_photo_tag_links
       WHERE resolved_at IS NULL
         AND photo_id = ?
       ORDER BY created_at ASC, id ASC`,
      [normalizedPhotoId]
    );
  }

  async findUnresolvedPendingBySourceAssetId(
    sourceAssetId: string,
    fileSize?: number
  ): Promise<ImportPendingPhotoTagLinkRow[]> {
    const normalizedSourceAssetId = normalizeNonEmptyText(sourceAssetId);
    if (!normalizedSourceAssetId) return [];

    if (fileSize !== undefined && Number.isFinite(fileSize) && fileSize > 0) {
      const safeFileSize = Math.floor(fileSize);
      return this.db.getAllAsync<ImportPendingPhotoTagLinkRow>(
        `SELECT *
         FROM import_pending_photo_tag_links
         WHERE resolved_at IS NULL
           AND source_asset_id = ?
           AND (file_size <= 0 OR file_size = ?)
         ORDER BY created_at ASC, id ASC`,
        [normalizedSourceAssetId, safeFileSize]
      );
    }

    return this.db.getAllAsync<ImportPendingPhotoTagLinkRow>(
      `SELECT *
       FROM import_pending_photo_tag_links
       WHERE resolved_at IS NULL
         AND source_asset_id = ?
       ORDER BY created_at ASC, id ASC`,
      [normalizedSourceAssetId]
    );
  }

  async findUnresolvedPendingByFingerprintReference(
    md5: string,
    fileSize: number
  ): Promise<ImportPendingPhotoTagLinkRow[]> {
    const normalizedMd5 = normalizeNonEmptyText(md5)?.toLowerCase() ?? null;
    if (!normalizedMd5 || !Number.isFinite(fileSize) || fileSize <= 0) return [];

    const safeFileSize = Math.floor(fileSize);
    return this.db.getAllAsync<ImportPendingPhotoTagLinkRow>(
      `SELECT *
       FROM import_pending_photo_tag_links
       WHERE resolved_at IS NULL
         AND fingerprint_md5 = ?
         AND file_size = ?
       ORDER BY created_at ASC, id ASC`,
      [normalizedMd5, safeFileSize]
    );
  }

  async findUnresolvedPendingForFingerprintPage(
    limit = 200,
    offset = 0
  ): Promise<ImportPendingPhotoTagLinkRow[]> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200;
    const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
    return this.db.getAllAsync<ImportPendingPhotoTagLinkRow>(
      `SELECT *
       FROM import_pending_photo_tag_links
       WHERE resolved_at IS NULL
         AND reason = 'NOT_FOUND'
         AND fingerprint_md5 IS NOT NULL
         AND TRIM(fingerprint_md5) <> ''
         AND file_size > 0
       ORDER BY created_at ASC, id ASC
       LIMIT ? OFFSET ?`,
      [safeLimit, safeOffset]
    );
  }

  async findUnresolvedPendingForFingerprint(limit = 200): Promise<ImportPendingPhotoTagLinkRow[]> {
    return this.findUnresolvedPendingForFingerprintPage(limit, 0);
  }

  async touchImportPendingPhotoTagLinkAttempt(id: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE import_pending_photo_tag_links
       SET last_attempt_at = datetime('now')
       WHERE id = ?`,
      [id]
    );
  }

  async markImportPendingPhotoTagLinkResolved(id: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE import_pending_photo_tag_links
       SET resolved_at = datetime('now'), last_attempt_at = datetime('now')
       WHERE id = ?`,
      [id]
    );
  }
}

