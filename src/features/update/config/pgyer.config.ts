import Constants from 'expo-constants';

export interface PgyerCredentials {
  appKey: string;
  apiKey: string;
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getPgyerCredentials(): PgyerCredentials | null {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const pgyerConfig =
    extra && typeof extra.pgyer === 'object' ? (extra.pgyer as Record<string, unknown>) : undefined;

  const appKey = normalizeNonEmptyString(pgyerConfig?.appKey);
  const apiKey =
    normalizeNonEmptyString(process.env.EXPO_PUBLIC_PGYER_API_KEY) ??
    normalizeNonEmptyString(pgyerConfig?.apiKey);

  if (!appKey || !apiKey) {
    return null;
  }

  return { appKey, apiKey };
}
