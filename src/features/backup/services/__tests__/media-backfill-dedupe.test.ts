import { __dedupeEquivalentPendingRowsForTest } from '@/features/backup/services/media-backfill.service';
import type { ImportPendingPhotoTagLinkRow } from '@/shared/types/database';

function row(partial: Partial<ImportPendingPhotoTagLinkRow>): ImportPendingPhotoTagLinkRow {
  return {
    id: 1,
    photo_id: null,
    fingerprint_md5: null,
    file_size: 0,
    source_asset_id: null,
    taken_date: null,
    tag_external_ids_json: '[]',
    notes: null,
    reason: 'NOT_FOUND',
    created_at: '2026-03-05T00:00:00.000Z',
    last_attempt_at: null,
    resolved_at: null,
    ...partial,
  };
}

describe('media backfill dedupe', () => {
  it('deduplicates equivalent pending rows and keeps smallest id', () => {
    const input = [
      row({ id: 10, fingerprint_md5: 'ABC', file_size: 100, tag_external_ids_json: '["t1"]' }),
      row({ id: 3, fingerprint_md5: 'abc', file_size: 100, tag_external_ids_json: '["t1"]' }),
      row({ id: 11, fingerprint_md5: 'def', file_size: 200, tag_external_ids_json: '["t2"]' }),
    ];
    const output = __dedupeEquivalentPendingRowsForTest(input);
    expect(output).toHaveLength(2);
    expect(output.some((r) => r.id === 3)).toBe(true);
    expect(output.some((r) => r.id === 11)).toBe(true);
  });
});
