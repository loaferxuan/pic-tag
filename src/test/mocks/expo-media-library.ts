export const MediaType = {
  photo: 'photo',
} as const;

export const SortBy = {
  creationTime: 'creationTime',
} as const;

export async function getAssetsAsync(): Promise<{
  assets: Array<Record<string, unknown>>;
  endCursor?: string;
  hasNextPage: boolean;
  totalCount: number;
}> {
  return {
    assets: [],
    endCursor: undefined,
    hasNextPage: false,
    totalCount: 0,
  };
}

export async function getAssetInfoAsync(): Promise<Record<string, unknown>> {
  return {};
}

export async function getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  return { granted: true, canAskAgain: true };
}

export async function requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  return { granted: true, canAskAgain: true };
}
