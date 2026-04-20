export interface PgyerCheckRequest {
  appKey: string;
  apiKey: string;
  buildVersion?: string | null;
  channelKey?: string | null;
}

export interface PgyerCheckData {
  buildHaveNewVersion: boolean;
  needForceUpdate: boolean;
  downloadURL: string;
  buildVersion: string;
  buildVersionNo: string | null;
  buildUpdateDescription: string | null;
  buildKey: string;
}

interface PgyerCheckResponsePayload {
  code?: unknown;
  message?: unknown;
  data?: unknown;
}

interface PgyerCheckDataPayload {
  buildHaveNewVersion?: unknown;
  needForceUpdate?: unknown;
  downloadURL?: unknown;
  buildVersion?: unknown;
  buildVersionNo?: unknown;
  buildUpdateDescription?: unknown;
  buildKey?: unknown;
}

const PGYER_CHECK_ENDPOINT = 'https://api.pgyer.com/apiv2/app/check';
const REQUEST_TIMEOUT_MS = 6000;

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export class PgyerClientError extends Error {
  readonly code: number | null;

  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = 'PgyerClientError';
    this.code = code;
  }
}

export class PgyerNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgyerNetworkError';
  }
}

function parsePgyerData(payload: PgyerCheckDataPayload): PgyerCheckData {
  const buildKey = normalizeNonEmptyString(payload.buildKey);
  const downloadURL = normalizeNonEmptyString(payload.downloadURL);
  const buildVersion = normalizeNonEmptyString(payload.buildVersion);

  if (!buildKey || !downloadURL || !buildVersion) {
    throw new PgyerClientError('蒲公英返回数据不完整');
  }

  return {
    buildHaveNewVersion: toBoolean(payload.buildHaveNewVersion),
    needForceUpdate: toBoolean(payload.needForceUpdate),
    downloadURL,
    buildVersion,
    buildVersionNo: normalizeNonEmptyString(payload.buildVersionNo),
    buildUpdateDescription: normalizeNonEmptyString(payload.buildUpdateDescription),
    buildKey,
  };
}

export async function checkPgyerLatest(request: PgyerCheckRequest): Promise<PgyerCheckData> {
  const body = new URLSearchParams();
  body.set('_api_key', request.apiKey);
  body.set('appKey', request.appKey);
  const buildVersion = normalizeNonEmptyString(request.buildVersion);
  if (buildVersion) {
    body.set('buildVersion', buildVersion);
  }
  const channelKey = normalizeNonEmptyString(request.channelKey);
  if (channelKey) {
    body.set('channelKey', channelKey);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(PGYER_CHECK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new PgyerNetworkError(`请求失败（HTTP ${response.status}）`);
    }

    const payload = (await response.json()) as PgyerCheckResponsePayload;
    const code = toNumber(payload.code);
    if (code !== 0) {
      const message = normalizeNonEmptyString(payload.message) ?? '蒲公英接口返回错误';
      throw new PgyerClientError(message, code);
    }

    if (!payload.data || typeof payload.data !== 'object') {
      throw new PgyerClientError('蒲公英返回 data 为空');
    }

    return parsePgyerData(payload.data as PgyerCheckDataPayload);
  } catch (error) {
    if (error instanceof PgyerClientError || error instanceof PgyerNetworkError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new PgyerNetworkError('请求超时，请稍后重试');
    }
    throw new PgyerNetworkError(error instanceof Error ? error.message : '网络请求失败');
  } finally {
    clearTimeout(timeout);
  }
}
