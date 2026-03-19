import { getRepositories } from '@/infra/db';
import {
  __normalizeExternalPhotoStorageAckForTest,
  acknowledgeExternalPhotoStorage,
  hasAcknowledgedExternalPhotoStorage,
} from '@/features/settings/services/photo-storage-notice.service';
import { KV_HAS_ACKNOWLEDGED_EXTERNAL_PHOTO_STORAGE } from '@/shared/constants';

jest.mock('@/infra/db', () => ({
  getRepositories: jest.fn(),
}));

const getRepositoriesMock = getRepositories as jest.MockedFunction<typeof getRepositories>;

describe('photo storage notice service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('parses acknowledged flag values safely', () => {
    expect(__normalizeExternalPhotoStorageAckForTest(null)).toBe(false);
    expect(__normalizeExternalPhotoStorageAckForTest('0')).toBe(false);
    expect(__normalizeExternalPhotoStorageAckForTest('1')).toBe(true);
    expect(__normalizeExternalPhotoStorageAckForTest(' true ')).toBe(true);
  });

  it('reads acknowledgement state from settings repository', async () => {
    getRepositoriesMock.mockResolvedValue({
      settings: {
        get: jest.fn().mockResolvedValue('1'),
      },
    } as unknown as Awaited<ReturnType<typeof getRepositories>>);

    await expect(hasAcknowledgedExternalPhotoStorage()).resolves.toBe(true);
  });

  it('persists acknowledgement state to settings repository', async () => {
    const set = jest.fn().mockResolvedValue(undefined);
    getRepositoriesMock.mockResolvedValue({
      settings: {
        set,
      },
    } as unknown as Awaited<ReturnType<typeof getRepositories>>);

    await acknowledgeExternalPhotoStorage();

    expect(set).toHaveBeenCalledWith(KV_HAS_ACKNOWLEDGED_EXTERNAL_PHOTO_STORAGE, '1');
  });
});
