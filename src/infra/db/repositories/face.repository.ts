import type { SQLiteDatabase } from 'expo-sqlite';

export type FaceProcessingStatus = 'not_requested' | 'pending' | 'ready' | 'failed';

export type PeopleEmbedding = number[];

export interface PhotoFaceProcessingRow {
  photo_id: number;
  status: FaceProcessingStatus;
  embedding_version: number;
  error: string | null;
  updated_at: string;
}

export interface PeopleIdentityRow {
  id: number;
  external_id: string;
  name: string;
  sort_order: number;
  embedding_version: number;
  embedding_count: number;
  embedding_json: string;
  created_at: string;
}

export interface PeopleFaceRow {
  id: number;
  photo_id: number;
  identity_id: number | null;
  embedding_version: number;
  embedding_json: string;
  bbox_json: string | null;
  embedding_confidence: number | null;
  detected_at: string;
}

export class FaceRepository {
  constructor(private db: SQLiteDatabase) {}

  async setPhotoProcessingStatus(params: {
    photoId: number;
    status: FaceProcessingStatus;
    embeddingVersion: number;
    error?: string | null;
  }): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO photo_face_processing (photo_id, status, embedding_version, error, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(photo_id) DO UPDATE SET
         status = excluded.status,
         embedding_version = excluded.embedding_version,
         error = excluded.error,
         updated_at = datetime('now')`,
      [params.photoId, params.status, params.embeddingVersion, params.error ?? null]
    );
  }

  async enqueuePendingForPhoto(photoId: number, embeddingVersion: number): Promise<void> {
    await this.setPhotoProcessingStatus({
      photoId,
      status: 'pending',
      embeddingVersion,
      error: null,
    });
  }

  async findPendingPhotoIds(limit = 200): Promise<number[]> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200;
    const rows = await this.db.getAllAsync<{ photo_id: number }>(
      `SELECT photo_id
       FROM photo_face_processing
       WHERE status = 'pending'
       ORDER BY updated_at ASC, photo_id ASC
       LIMIT ?`,
      [safeLimit]
    );
    return rows.map((r) => r.photo_id);
  }

  async clearFacesForPhoto(photoId: number): Promise<void> {
    await this.db.runAsync(`DELETE FROM people_faces WHERE photo_id = ?`, [photoId]);
  }

  async getAllIdentities(): Promise<PeopleIdentityRow[]> {
    return this.db.getAllAsync<PeopleIdentityRow>(
      `SELECT *
       FROM people_identities
       ORDER BY sort_order ASC, id ASC`
    );
  }

  async createIdentity(params: {
    externalId: string;
    name: string;
    sortOrder: number;
    embeddingVersion: number;
    embeddingCount: number;
    embeddingJson: string;
  }): Promise<PeopleIdentityRow> {
    const result = await this.db.runAsync(
      `INSERT INTO people_identities (external_id, name, sort_order, embedding_version, embedding_count, embedding_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.externalId,
        params.name,
        params.sortOrder,
        params.embeddingVersion,
        params.embeddingCount,
        params.embeddingJson,
      ]
    );
    const id = Number(result.lastInsertRowId);
    const row = await this.db.getFirstAsync<PeopleIdentityRow>(`SELECT * FROM people_identities WHERE id = ?`, [id]);
    if (!row) {
      throw new Error('创建人脸身份后读取失败');
    }
    return row;
  }

  async updateIdentityEmbedding(params: {
    identityId: number;
    embeddingVersion: number;
    embeddingCount: number;
    embeddingJson: string;
  }): Promise<void> {
    await this.db.runAsync(
      `UPDATE people_identities
       SET embedding_version = ?, embedding_count = ?, embedding_json = ?
       WHERE id = ?`,
      [params.embeddingVersion, params.embeddingCount, params.embeddingJson, params.identityId]
    );
  }

  async saveFacesForPhoto(params: {
    photoId: number;
    faces: Array<{
      identityId: number | null;
      embeddingVersion: number;
      embeddingJson: string;
      bboxJson: string | null;
      embeddingConfidence: number | null;
    }>;
  }): Promise<void> {
    for (const face of params.faces) {
      await this.db.runAsync(
        `INSERT INTO people_faces
         (photo_id, identity_id, embedding_version, embedding_json, bbox_json, embedding_confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [params.photoId, face.identityId, face.embeddingVersion, face.embeddingJson, face.bboxJson, face.embeddingConfidence]
      );
    }
  }

  async getIdentityById(id: number): Promise<PeopleIdentityRow | null> {
    const row = await this.db.getFirstAsync<PeopleIdentityRow>(
      `SELECT * FROM people_identities WHERE id = ?`,
      [id]
    );
    return row ?? null;
  }

  async updateIdentityName(identityId: number, name: string): Promise<PeopleIdentityRow | null> {
    await this.db.runAsync(
      `UPDATE people_identities SET name = ? WHERE id = ?`,
      [name, identityId]
    );
    return this.getIdentityById(identityId);
  }

  async getFacesByIdentityId(identityId: number): Promise<PeopleFaceRow[]> {
    return this.db.getAllAsync<PeopleFaceRow>(
      `SELECT * FROM people_faces WHERE identity_id = ? ORDER BY detected_at ASC`,
      [identityId]
    );
  }

  async getFacesByPhotoId(photoId: number): Promise<PeopleFaceRow[]> {
    return this.db.getAllAsync<PeopleFaceRow>(
      `SELECT * FROM people_faces WHERE photo_id = ? ORDER BY id ASC`,
      [photoId]
    );
  }

  async reassignFacesToIdentity(sourceIdentityId: number, targetIdentityId: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE people_faces SET identity_id = ? WHERE identity_id = ?`,
      [targetIdentityId, sourceIdentityId]
    );
  }

  async clearFacesForIdentity(identityId: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE people_faces SET identity_id = NULL WHERE identity_id = ?`,
      [identityId]
    );
  }

  async deleteIdentity(identityId: number): Promise<void> {
    await this.clearFacesForIdentity(identityId);
    await this.db.runAsync(
      `DELETE FROM people_identities WHERE id = ?`,
      [identityId]
    );
  }

  async setIdentityCoverPhoto(identityId: number, photoId: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE people_identities SET cover_photo_id = ? WHERE id = ?`,
      [photoId, identityId]
    );
  }

  async getIdentitiesByPhotoId(photoId: number): Promise<PeopleIdentityRow[]> {
    return this.db.getAllAsync<PeopleIdentityRow>(
      `SELECT pi.* FROM people_identities pi
       INNER JOIN people_faces pf ON pi.id = pf.identity_id
       WHERE pf.photo_id = ?
       GROUP BY pi.id
       ORDER BY pi.sort_order ASC`,
      [photoId]
    );
  }

  async getPhotoCountByIdentity(identityId: number): Promise<number> {
    const result = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(DISTINCT photo_id) as count FROM people_faces WHERE identity_id = ?`,
      [identityId]
    );
    return result?.count ?? 0;
  }

  async getFaceCountByIdentity(identityId: number): Promise<number> {
    const result = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM people_faces WHERE identity_id = ?`,
      [identityId]
    );
    return result?.count ?? 0;
  }

  async getProcessedPhotoIds(limit: number = 100): Promise<Array<{ photo_id: number }>> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100;
    return this.db.getAllAsync<{ photo_id: number }>(
      `SELECT DISTINCT photo_id FROM people_faces ORDER BY id DESC LIMIT ?`,
      [safeLimit]
    );
  }
}

