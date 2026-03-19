import * as MediaLibrary from 'expo-media-library';

export type MediaPermissionContext =
  | 'photo_import'
  | 'backup_export_hydration'
  | 'backup_import_auto_backfill'
  | 'manual_backfill';

const MEDIA_PERMISSION_SCOPE: MediaLibrary.GranularPermission[] = ['photo'];

type PermissionSnapshot = {
  granted: boolean | null;
  canAskAgain: boolean | null;
  accessPrivileges: string | null;
  probeReadable: boolean;
};

export class MediaPermissionError extends Error {
  readonly code = 'MEDIA_PERMISSION_REQUIRE_ALL';

  constructor(
    public readonly context: MediaPermissionContext,
    public readonly snapshot: PermissionSnapshot
  ) {
    super(buildMessage(context, snapshot));
    this.name = 'MediaPermissionError';
  }
}

export function isMediaPermissionError(error: unknown): error is MediaPermissionError {
  return error instanceof MediaPermissionError;
}

function buildMessage(context: MediaPermissionContext, snapshot: PermissionSnapshot): string {
  const contextLabel = (() => {
    switch (context) {
      case 'photo_import':
        return '照片导入';
      case 'backup_export_hydration':
        return '备份导出补全';
      case 'backup_import_auto_backfill':
        return '备份导入后自动回填';
      case 'manual_backfill':
        return '手动回填';
      default:
        return '媒体操作';
    }
  })();

  const grantedText = snapshot.granted == null ? '未知' : snapshot.granted ? '已授权' : '已拒绝';
  const accessText =
    snapshot.accessPrivileges == null
      ? '未知'
      : snapshot.accessPrivileges === 'all'
        ? '所有照片'
        : snapshot.accessPrivileges === 'limited'
          ? '受限访问'
          : snapshot.accessPrivileges;

  return `${contextLabel}需要完整照片库权限（所有照片）。当前权限状态：授权=${grantedText}，访问级别=${accessText}。请在系统设置中授予完整照片权限后重试。`;
}

function hasAllPhotoAccess(permission: MediaLibrary.PermissionResponse | null): boolean {
  if (!permission || permission.granted !== true) return false;
  if (permission.accessPrivileges == null) return true;
  return permission.accessPrivileges === 'all';
}

async function probeReadable(): Promise<boolean> {
  try {
    await MediaLibrary.getAssetsAsync({
      first: 1,
      mediaType: [MediaLibrary.MediaType.photo],
    });
    return true;
  } catch {
    return false;
  }
}

async function safeGetGranularPermission(): Promise<MediaLibrary.PermissionResponse | null> {
  try {
    return await MediaLibrary.getPermissionsAsync(false, MEDIA_PERMISSION_SCOPE);
  } catch {
    return null;
  }
}

async function safeRequestGranularPermission(): Promise<MediaLibrary.PermissionResponse | null> {
  try {
    return await MediaLibrary.requestPermissionsAsync(false, MEDIA_PERMISSION_SCOPE);
  } catch {
    return null;
  }
}

async function safeGetPermission(): Promise<MediaLibrary.PermissionResponse | null> {
  try {
    return await MediaLibrary.getPermissionsAsync();
  } catch {
    return null;
  }
}

async function safeRequestPermission(): Promise<MediaLibrary.PermissionResponse | null> {
  try {
    return await MediaLibrary.requestPermissionsAsync();
  } catch {
    return null;
  }
}

function buildSnapshot(permission: MediaLibrary.PermissionResponse | null, readable: boolean): PermissionSnapshot {
  return {
    granted: permission?.granted ?? null,
    canAskAgain: permission?.canAskAgain ?? null,
    accessPrivileges: permission?.accessPrivileges ?? null,
    probeReadable: readable,
  };
}

export async function ensureAllPhotosPermissionOrThrow(context: MediaPermissionContext): Promise<void> {
  const readableBefore = await probeReadable();

  const granularCurrent = await safeGetGranularPermission();
  if (hasAllPhotoAccess(granularCurrent)) {
    return;
  }

  const granularRequested =
    granularCurrent?.canAskAgain === false ? null : await safeRequestGranularPermission();
  if (hasAllPhotoAccess(granularRequested)) {
    return;
  }

  const current = await safeGetPermission();
  if (hasAllPhotoAccess(current)) {
    return;
  }

  const requested = current?.canAskAgain === false ? null : await safeRequestPermission();
  if (hasAllPhotoAccess(requested)) {
    return;
  }

  const readableAfter = await probeReadable();
  const lastPermission = requested ?? current ?? granularRequested ?? granularCurrent;

  throw new MediaPermissionError(
    context,
    buildSnapshot(lastPermission, readableBefore || readableAfter)
  );
}
