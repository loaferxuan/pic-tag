import type { NativeUpdateServiceDeps } from '@/features/update/services/native-update.service';
import { PgyerClientError, PgyerNetworkError, type PgyerCheckData } from '@/features/update/services/pgyer.client';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      extra: {},
    },
  },
}));

const { createNativeUpdateService } = require('@/features/update/services/native-update.service') as {
  createNativeUpdateService: (deps?: Partial<NativeUpdateServiceDeps>) => {
    checkOnStartup: () => Promise<unknown>;
    checkManually: () => Promise<unknown>;
  };
};

function createMockDeps(
  options?: Partial<{
    credentials: ReturnType<NativeUpdateServiceDeps['getCredentials']>;
    requestLatest: NativeUpdateServiceDeps['requestLatest'];
  }>
): NativeUpdateServiceDeps {
  const hasCredentialsOverride = options && Object.prototype.hasOwnProperty.call(options, 'credentials');
  return {
    getCredentials: () => (hasCredentialsOverride ? options?.credentials ?? null : { appKey: 'app-key', apiKey: 'api-key' }),
    requestLatest:
      options?.requestLatest ??
      (async () => ({
        buildHaveNewVersion: false,
        needForceUpdate: false,
        downloadURL: 'https://www.pgyer.com/example',
        buildVersion: '1.0.0',
        buildVersionNo: '1',
        buildUpdateDescription: null,
        buildKey: 'build-1',
      })),
  };
}

function buildData(overrides?: Partial<PgyerCheckData>): PgyerCheckData {
  return {
    buildHaveNewVersion: true,
    needForceUpdate: false,
    downloadURL: 'https://www.pgyer.com/example',
    buildVersion: '1.1.0',
    buildVersionNo: '2',
    buildUpdateDescription: '修复若干问题',
    buildKey: 'build-2',
    ...overrides,
  };
}

describe('native update service', () => {
  it('returns up_to_date when server says no new version', async () => {
    const service = createNativeUpdateService(
      createMockDeps({
        requestLatest: async () => buildData({ buildHaveNewVersion: false }),
      })
    );

    await expect(service.checkOnStartup()).resolves.toEqual({ kind: 'up_to_date' });
  });

  it('returns has_update with non-forced flag', async () => {
    const service = createNativeUpdateService(
      createMockDeps({
        requestLatest: async () => buildData({ needForceUpdate: false }),
      })
    );

    await expect(service.checkOnStartup()).resolves.toMatchObject({
      kind: 'has_update',
      info: { forceUpdate: false, buildKey: 'build-2' },
    });
  });

  it('returns has_update with forced flag', async () => {
    const service = createNativeUpdateService(
      createMockDeps({
        requestLatest: async () => buildData({ needForceUpdate: true }),
      })
    );

    await expect(service.checkOnStartup()).resolves.toMatchObject({
      kind: 'has_update',
      info: { forceUpdate: true, buildKey: 'build-2' },
    });
  });

  it('maps misconfigured errors from pgyer codes', async () => {
    const service = createNativeUpdateService(
      createMockDeps({
        requestLatest: async () => {
          throw new PgyerClientError('invalid key', 1002);
        },
      })
    );

    await expect(service.checkOnStartup()).resolves.toEqual({ kind: 'misconfigured' });
  });

  it('maps network errors from pgyer client', async () => {
    const service = createNativeUpdateService(
      createMockDeps({
        requestLatest: async () => {
          throw new PgyerNetworkError('timeout');
        },
      })
    );

    await expect(service.checkOnStartup()).resolves.toEqual({ kind: 'network_error', message: 'timeout' });
  });

  it('returns misconfigured when credentials are missing', async () => {
    const requestLatest = jest.fn(async () => buildData());
    const service = createNativeUpdateService(
      createMockDeps({
        credentials: null,
        requestLatest,
      })
    );

    await expect(service.checkOnStartup()).resolves.toEqual({ kind: 'misconfigured' });
    expect(requestLatest).not.toHaveBeenCalled();
  });

  it('dedupes same build on startup but not on manual check', async () => {
    const service = createNativeUpdateService(
      createMockDeps({
        requestLatest: async () => buildData({ buildKey: 'same-build' }),
      })
    );

    await expect(service.checkOnStartup()).resolves.toMatchObject({ kind: 'has_update' });
    await expect(service.checkOnStartup()).resolves.toEqual({ kind: 'up_to_date' });
    await expect(service.checkManually()).resolves.toMatchObject({
      kind: 'has_update',
      info: { buildKey: 'same-build' },
    });
  });
});
