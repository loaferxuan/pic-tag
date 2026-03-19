import { __parseBackupEnvelopeForTest } from '@/features/backup/services/backup.service';

function buildEnvelope(formatVersion = '1.0.0', format = 'pictag-data') {
  const payload = {
    exportId: 'test-export',
    categories: [],
    tags: [],
    settings: { defaultTagExternalIds: [] as string[] },
    photoTagLinks: [],
    stats: {
      categoryCount: 0,
      tagCount: 0,
      linkCount: 0,
      generatedAt: '2026-03-05T00:00:00.000Z',
    },
  };
  return {
    format,
    formatVersion,
    createdAt: '2026-03-05T00:00:00.000Z',
    appSchemaVersion: 1,
    checksumAlgorithm: 'sha256' as const,
    payloadSha256: 'a'.repeat(64),
    payload,
  };
}

describe('backup parse', () => {
  it('accepts v1 envelope', () => {
    const parsed = __parseBackupEnvelopeForTest(buildEnvelope('1.1.0'));
    expect(parsed.formatVersion).toBe('1.1.0');
  });

  it('rejects legacy format literal', () => {
    expect(() => __parseBackupEnvelopeForTest(buildEnvelope('1.0.0', 'pictag-backup'))).toThrow();
  });

  it('rejects non-v1 envelope', () => {
    expect(() => __parseBackupEnvelopeForTest(buildEnvelope('3.1.0'))).toThrow();
  });
});
