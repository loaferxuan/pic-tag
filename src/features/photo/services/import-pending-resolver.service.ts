import { getRepositories } from '@/infra/db';
import type { ImportPendingPhotoTagLinkRow, PhotoRow } from '@/shared/types/database';
import { decodePendingNotesToken, normalizeEditableNotes } from '@/shared/utils/photo-notes';

export interface ResolveSummary {
  attempted: number;
  resolved: number;
  stillPending: number;
}

function createSummary(): ResolveSummary {
  return {
    attempted: 0,
    resolved: 0,
    stillPending: 0,
  };
}

function mergeSummary(base: ResolveSummary, next: ResolveSummary): ResolveSummary {
  return {
    attempted: base.attempted + next.attempted,
    resolved: base.resolved + next.resolved,
    stillPending: base.stillPending + next.stillPending,
  };
}

function normalizeExternalIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function tryParseTagExternalIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeExternalIds(parsed);
  } catch {
    return [];
  }
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

async function findRelatedPendingRowsForPhoto(photo: PhotoRow): Promise<ImportPendingPhotoTagLinkRow[]> {
  const repos = await getRepositories();
  const byPhotoId = await repos.photo.findUnresolvedPendingByPhotoId(photo.id);
  const bySourceAssetId = photo.source_asset_id
    ? await repos.photo.findUnresolvedPendingBySourceAssetId(
        photo.source_asset_id,
        photo.file_size > 0 ? photo.file_size : undefined,
      )
    : [];
  const byFingerprint =
    photo.fingerprint_md5 && photo.file_size > 0
      ? await repos.photo.findUnresolvedPendingByFingerprintReference(photo.fingerprint_md5, photo.file_size)
      : [];

  const merged = new Map<number, ImportPendingPhotoTagLinkRow>();
  for (const row of byPhotoId) {
    merged.set(row.id, row);
  }
  for (const row of bySourceAssetId) {
    merged.set(row.id, row);
  }
  for (const row of byFingerprint) {
    merged.set(row.id, row);
  }
  return Array.from(merged.values()).sort((a, b) => a.id - b.id);
}

async function findPhotoCandidates(row: ImportPendingPhotoTagLinkRow): Promise<PhotoRow[]> {
  const repos = await getRepositories();
  const hasSourceAssetId = typeof row.source_asset_id === 'string' && row.source_asset_id.length > 0;
  if (hasSourceAssetId) {
    const fileSize = row.file_size > 0 ? row.file_size : undefined;
    const bySourceAssetId = await repos.photo.findBySourceAssetId(row.source_asset_id!, fileSize);
    if (bySourceAssetId.length > 0) {
      return bySourceAssetId;
    }
  }

  const hasMd5 = typeof row.fingerprint_md5 === 'string' && row.fingerprint_md5.length > 0;
  if (hasMd5) {
    return repos.photo.findByFingerprint({
      md5: row.fingerprint_md5 ?? undefined,
      fileSize: row.file_size,
    });
  }

  return [];
}

async function resolvePendingRow(row: ImportPendingPhotoTagLinkRow): Promise<ResolveSummary> {
  const summary = createSummary();
  summary.attempted += 1;

  const repos = await getRepositories();
  const tagExternalIds = tryParseTagExternalIds(row.tag_external_ids_json);
  const pendingNotesPatch = decodePendingNotesToken(row.notes);
  const pendingTakenDate = normalizeNonEmptyString(row.taken_date);

  const tagIdByExternalId = new Map<string, number>();
  if (tagExternalIds.length > 0) {
    const tags = await repos.tag.findByExternalIds(tagExternalIds);
    for (const tag of tags) {
      if (typeof tag.external_id !== 'string' || tag.external_id.length === 0) continue;
      tagIdByExternalId.set(tag.external_id, tag.id);
    }

    const missingTagExists = tagExternalIds.some((externalId) => !tagIdByExternalId.has(externalId));
    if (missingTagExists && row.reason !== 'NOT_FOUND') {
      await repos.photo.touchImportPendingPhotoTagLinkAttempt(row.id);
      summary.stillPending += 1;
      return summary;
    }
  }

  let targetPhoto: PhotoRow | null = null;
  if (Number.isInteger(row.photo_id) && row.photo_id != null && row.photo_id > 0) {
    targetPhoto = await repos.photo.findById(row.photo_id);
    if (!targetPhoto) {
      await repos.photo.touchImportPendingPhotoTagLinkAttempt(row.id);
      summary.stillPending += 1;
      return summary;
    }
  } else {
    const candidates = await findPhotoCandidates(row);
    if (candidates.length !== 1) {
      await repos.photo.touchImportPendingPhotoTagLinkAttempt(row.id);
      summary.stillPending += 1;
      return summary;
    }
    targetPhoto = candidates[0];
  }

  if (row.reason === 'NOT_FOUND') {
    const normalizedUri = normalizeNonEmptyString(targetPhoto.uri);
    if (!normalizedUri) {
      await repos.photo.touchImportPendingPhotoTagLinkAttempt(row.id);
      summary.stillPending += 1;
      return summary;
    }
  }

  const hasPayloadToApply =
    tagExternalIds.length > 0 || pendingNotesPatch.shouldUpdate || pendingTakenDate !== null;
  if (row.reason !== 'NOT_FOUND' && !hasPayloadToApply) {
    await repos.photo.touchImportPendingPhotoTagLinkAttempt(row.id);
    summary.stillPending += 1;
    return summary;
  }

  const patch: Partial<{ taken_date: string | null; notes: string | null }> = {};
  if (pendingTakenDate && pendingTakenDate !== targetPhoto.taken_date) {
    patch.taken_date = pendingTakenDate;
  }

  const normalizedCurrentNotes = normalizeEditableNotes(targetPhoto.notes);
  if (pendingNotesPatch.shouldUpdate && pendingNotesPatch.notes !== normalizedCurrentNotes) {
    patch.notes = pendingNotesPatch.notes;
  }
  if (Object.keys(patch).length > 0) {
    await repos.photo.update(targetPhoto.id, patch);
  }

  if (tagExternalIds.length > 0) {
    const existingTagIds = new Set(await repos.photo.getTagIds(targetPhoto.id));
    for (const externalId of tagExternalIds) {
      const tagId = tagIdByExternalId.get(externalId);
      if (!tagId || existingTagIds.has(tagId)) continue;
      await repos.photo.addTag(targetPhoto.id, tagId);
    }
  }

  await repos.photo.markImportPendingPhotoTagLinkResolved(row.id);
  summary.resolved += 1;
  return summary;
}

export async function resolvePendingForPhoto(photoId: number): Promise<ResolveSummary> {
  if (!Number.isInteger(photoId) || photoId <= 0) {
    return createSummary();
  }

  const repos = await getRepositories();
  const photo = await repos.photo.findById(photoId);
  if (!photo) {
    return createSummary();
  }

  const relatedRows = await findRelatedPendingRowsForPhoto(photo);
  let summary = createSummary();
  for (const row of relatedRows) {
    summary = mergeSummary(summary, await resolvePendingRow(row));
  }
  return summary;
}