import Constants from 'expo-constants';
import type { NativeUpdateCheckResult, NativeUpdateInfo } from '@/shared/types/native-update';
import { getPgyerCredentials } from '@/features/update/config/pgyer.config';
import {
  checkPgyerLatest,
  PgyerClientError,
  PgyerNetworkError,
  type PgyerCheckData,
} from '@/features/update/services/pgyer.client';

const MISCONFIG_ERROR_CODES = new Set([1002, 1009, 1055, 1076]);

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toNativeUpdateInfo(data: PgyerCheckData): NativeUpdateInfo {
  return {
    latestVersion: data.buildVersion,
    latestVersionNo: data.buildVersionNo,
    buildKey: data.buildKey,
    downloadURL: data.downloadURL,
    releaseNotes: data.buildUpdateDescription,
    forceUpdate: data.needForceUpdate === true,
  };
}

function resolveBuildVersion(): string | null {
  return normalizeNonEmptyString(Constants.expoConfig?.version);
}

function resolveChannelKey(): string | null {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  if (!extra) return null;
  return normalizeNonEmptyString(extra.channelKey);
}

function resolveAppVariant(): string | null {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  if (!extra) return null;
  return normalizeNonEmptyString(extra.appVariant);
}

export interface NativeUpdateServiceDeps {
  getCredentials: typeof getPgyerCredentials;
  requestLatest: typeof checkPgyerLatest;
}

export interface NativeUpdateService {
  checkOnStartup: () => Promise<NativeUpdateCheckResult>;
  checkManually: () => Promise<NativeUpdateCheckResult>;
}

export function createNativeUpdateService(deps?: Partial<NativeUpdateServiceDeps>): NativeUpdateService {
  const getCredentials = deps?.getCredentials ?? getPgyerCredentials;
  const requestLatest = deps?.requestLatest ?? checkPgyerLatest;
  let lastPromptedBuildKey: string | null = null;

  const checkCore = async (mode: 'startup' | 'manual'): Promise<NativeUpdateCheckResult> => {
    // Dev / Preview 变体与生产 APK 的包名/通道独立，弹升级到生产版对用户毫无意义；直接短路。
    const variant = resolveAppVariant();
    if (variant === 'development' || variant === 'preview') {
      return { kind: 'up_to_date' };
    }

    const credentials = getCredentials();
    if (!credentials) {
      return { kind: 'misconfigured' };
    }

    try {
      const data = await requestLatest({
        appKey: credentials.appKey,
        apiKey: credentials.apiKey,
        buildVersion: resolveBuildVersion(),
        channelKey: resolveChannelKey(),
      });

      if (!data.buildHaveNewVersion) {
        return { kind: 'up_to_date' };
      }

      if (mode === 'startup' && lastPromptedBuildKey === data.buildKey) {
        return { kind: 'up_to_date' };
      }

      lastPromptedBuildKey = data.buildKey;
      return { kind: 'has_update', info: toNativeUpdateInfo(data) };
    } catch (error) {
      if (error instanceof PgyerClientError) {
        if (error.code != null && MISCONFIG_ERROR_CODES.has(error.code)) {
          return { kind: 'misconfigured' };
        }
        return { kind: 'network_error', message: error.message };
      }
      if (error instanceof PgyerNetworkError) {
        return { kind: 'network_error', message: error.message };
      }
      return {
        kind: 'network_error',
        message: error instanceof Error ? error.message : '检查更新失败',
      };
    }
  };

  return {
    checkOnStartup: () => checkCore('startup'),
    checkManually: () => checkCore('manual'),
  };
}

const nativeUpdateService = createNativeUpdateService();

export const checkNativeUpdateOnStartup = nativeUpdateService.checkOnStartup;
export const checkNativeUpdateManually = nativeUpdateService.checkManually;
