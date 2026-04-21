import type { NativeUpdateServiceDeps } from '@/features/update/services/native-update.service';
import { PgyerClientError, PgyerNetworkError, type PgyerCheckData } from '@/features/update/services/pgyer.client';

const expoConstantsMock: { default: { expoConfig: { version: string; extra: Record<string, unknown> } } } = {
  default: {
    expoConfig: {
      version: '1.0.0',
      extra: {},
    },
  },
};

jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return expoConstantsMock.default;
  },
}));

beforeEach(() => {
  expoConstantsMock.default.expoConfig.extra = {};
});

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

  it.each([1002, 1009, 1055, 1076])('maps misconfigured error code %s to misconfigured', async (code) => {
    const service = createNativeUpdateService(
      createMockDeps({
        requestLatest: async () => {
          throw new PgyerClientError(`pgyer error ${code}`, code);
        },
      })
    );

    await expect(service.checkOnStartup()).resolves.toEqual({ kind: 'misconfigured' });
  });

  it('keeps non-misconfigured pgyer codes as network_error', async () => {
    const service = createNativeUpdateService(
      createMockDeps({
        requestLatest: async () => {
          throw new PgyerClientError('rate limited', 1216);
        },
      })
    );

    await expect(service.checkOnStartup()).resolves.toEqual({
      kind: 'network_error',
      message: 'rate limited',
    });
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

  it('short-circuits to up_to_date in development variant without calling network', async () => {
    expoConstantsMock.default.expoConfig.extra = { appVariant: 'development' };
    const requestLatest = jest.fn(async () => buildData());
    const getCredentials = jest.fn(() => ({ appKey: 'app-key', apiKey: 'api-key' }));
    const service = createNativeUpdateService({ getCredentials, requestLatest });

    await expect(service.checkOnStartup()).resolves.toEqual({ kind: 'up_to_date' });
    await expect(service.checkManually()).resolves.toEqual({ kind: 'up_to_date' });
    expect(requestLatest).not.toHaveBeenCalled();
    expect(getCredentials).not.toHaveBeenCalled();
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
