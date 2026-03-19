import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import type { AppVersionMeta, ReleaseChannel } from '@/shared/types/version';

const FALLBACK_APP_VERSION = '0.0.0';

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toReleaseChannel(value: unknown): ReleaseChannel | null {
  return normalizeNonEmptyString(value);
}

function normalizeBuildNumber(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return normalizeNonEmptyString(value);
}

function resolveNativeBuildVersion(): string | null {
  const nativeBuildFromConstants = normalizeNonEmptyString(Constants.nativeBuildVersion);
  if (nativeBuildFromConstants) return nativeBuildFromConstants;

  const expoConfig = Constants.expoConfig;
  if (!expoConfig) return null;

  if (Platform.OS === 'ios') {
    return normalizeBuildNumber((expoConfig.ios as { buildNumber?: unknown } | undefined)?.buildNumber);
  }

  if (Platform.OS === 'android') {
    return normalizeBuildNumber((expoConfig.android as { versionCode?: unknown } | undefined)?.versionCode);
  }

  return null;
}

function resolveRuntimeVersion(): string | null {
  const runtimeFromUpdates = normalizeNonEmptyString(
    (Updates as unknown as { runtimeVersion?: string | null }).runtimeVersion
  );
  if (runtimeFromUpdates) return runtimeFromUpdates;

  const runtimeFromConstants = normalizeNonEmptyString(
    (Constants as unknown as { expoRuntimeVersion?: string | null }).expoRuntimeVersion
  );
  if (runtimeFromConstants) return runtimeFromConstants;

  const configRuntime = Constants.expoConfig?.runtimeVersion;
  const runtimeFromConfig = normalizeNonEmptyString(configRuntime);
  if (runtimeFromConfig) return runtimeFromConfig;

  if (configRuntime && typeof configRuntime === 'object') {
    const policy = normalizeNonEmptyString((configRuntime as { policy?: unknown }).policy);
    if (policy) {
      return `policy:${policy}`;
    }
  }

  return null;
}

function resolveReleaseChannel(): ReleaseChannel | null {
  const channelFromUpdates = normalizeNonEmptyString((Updates as unknown as { channel?: string | null }).channel);
  if (channelFromUpdates) {
    return toReleaseChannel(channelFromUpdates);
  }

  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  if (!extra) return null;

  const channelFromEas =
    extra.eas && typeof extra.eas === 'object'
      ? normalizeNonEmptyString((extra.eas as { channel?: unknown }).channel)
      : null;
  if (channelFromEas) {
    return toReleaseChannel(channelFromEas);
  }

  return toReleaseChannel(extra.appVariant);
}

function resolveGitCommitShort(): string | null {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  if (!extra) return null;

  return normalizeNonEmptyString(extra.gitCommitShort);
}

export function getAppVersionMeta(): AppVersionMeta {
  const appVersion = normalizeNonEmptyString(Constants.expoConfig?.version) ?? FALLBACK_APP_VERSION;
  const nativeBuild = resolveNativeBuildVersion();
  const runtimeVersion = resolveRuntimeVersion();
  const channel = resolveReleaseChannel();
  const gitCommitShort = resolveGitCommitShort();

  return {
    appVersion,
    nativeBuild,
    runtimeVersion,
    channel,
    gitCommitShort,
  };
}
