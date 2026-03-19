import { usePhotoDetailStore } from '@/features/photo/store/photo-detail.store';
import * as photoService from '@/features/photo/services/photo.service';
import type { Photo } from '@/shared/types/domain';

jest.mock('@/features/photo/services/photo.service', () => ({
  getPhoto: jest.fn(),
}));

const getPhotoMock = photoService.getPhoto as jest.MockedFunction<typeof photoService.getPhoto>;

function buildPhoto(id: number): Photo {
  return {
    id,
    uri: `file:///photo-${id}.jpg`,
    filename: `photo-${id}.jpg`,
    width: 100,
    height: 100,
    fileSize: 1024,
    takenDate: '2026-03-09',
    importedAt: '2026-03-09T00:00:00.000Z',
    metadata: null,
    notes: null,
    sourceAssetId: `asset-${id}`,
    sourceProvider: 'media_library',
    mimeType: 'image/jpeg',
    fingerprintStatus: 'ready',
    fingerprintMd5: null,
    fingerprintSha256: null,
    fingerprintAlgo: null,
    fingerprintVersion: 2,
    fingerprintUpdatedAt: null,
    fingerprintError: null,
    tagIds: [],
  };
}

describe('photo detail store', () => {
  afterEach(() => {
    jest.clearAllMocks();
    usePhotoDetailStore.setState({
      currentPhoto: null,
      loading: false,
      error: null,
    });
  });

  it('primes current photo immediately', () => {
    const photo = buildPhoto(1);

    usePhotoDetailStore.getState().primePhoto(photo);

    expect(usePhotoDetailStore.getState().currentPhoto).toEqual(photo);
    expect(usePhotoDetailStore.getState().error).toBeNull();
  });

  it('keeps primed photo visible during silent refresh failure', async () => {
    const primed = buildPhoto(1);
    usePhotoDetailStore.getState().primePhoto(primed);
    getPhotoMock.mockRejectedValueOnce(new Error('boom'));

    await usePhotoDetailStore.getState().loadPhoto(1, { silent: true });

    expect(usePhotoDetailStore.getState().currentPhoto).toEqual(primed);
    expect(usePhotoDetailStore.getState().loading).toBe(false);
    expect(usePhotoDetailStore.getState().error).toBe('boom');
  });
});
