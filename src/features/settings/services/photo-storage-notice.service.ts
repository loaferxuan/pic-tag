import { getRepositories } from '@/infra/db';
import { KV_HAS_ACKNOWLEDGED_EXTERNAL_PHOTO_STORAGE } from '@/shared/constants';

export const PHOTO_STORAGE_HOME_HINT = '本应用不保存照片文件本体，照片仍存放在系统相册中。';
export const PHOTO_STORAGE_SOURCE_NOTICE = '照片来源：系统相册；本应用不负责存储原文件。';
export const PHOTO_STORAGE_MISSING_FILE_NOTICE =
  '原照片文件可能已被删除、移动或权限失效。本应用仅保留记录与标签关联。';
export const PHOTO_STORAGE_BACKUP_EXPORT_NOTICE =
  '备份不包含照片文件，仅包含标签、备注和照片关联信息。';
export const PHOTO_STORAGE_BACKUP_IMPORT_NOTICE =
  '恢复数据后，仍依赖设备中原有照片文件进行重新关联或自动回填。';

const EXTERNAL_PHOTO_STORAGE_ACKNOWLEDGED_VALUES = new Set(['1', 'true', 'yes']);

const PHOTO_STORAGE_NOTICE_LINES = [
  '本应用只记录照片引用、标签、备注和关联信息，不保存照片文件本体。',
  '如果你删除系统相册中的原图，应用内可能无法继续显示该照片。',
  '备份/导出也不包含照片文件本身，只包含标签、备注和照片关联信息。',
];

function normalizeStoredBoolean(raw: string | null): boolean {
  if (!raw) return false;
  return EXTERNAL_PHOTO_STORAGE_ACKNOWLEDGED_VALUES.has(raw.trim().toLowerCase());
}

export function getExternalPhotoStorageNoticeLines(): string[] {
  return [...PHOTO_STORAGE_NOTICE_LINES];
}

export function getExternalPhotoStorageNoticeMessage(): string {
  return PHOTO_STORAGE_NOTICE_LINES.join('\n');
}

export async function hasAcknowledgedExternalPhotoStorage(): Promise<boolean> {
  const repos = await getRepositories();
  const stored = await repos.settings.get(KV_HAS_ACKNOWLEDGED_EXTERNAL_PHOTO_STORAGE);
  return normalizeStoredBoolean(stored);
}

export async function acknowledgeExternalPhotoStorage(): Promise<void> {
  const repos = await getRepositories();
  await repos.settings.set(KV_HAS_ACKNOWLEDGED_EXTERNAL_PHOTO_STORAGE, '1');
}

export function __normalizeExternalPhotoStorageAckForTest(raw: string | null): boolean {
  return normalizeStoredBoolean(raw);
}
