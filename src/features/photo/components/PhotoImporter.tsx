import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getInfoAsync } from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import type { PhotoImportItem } from '@/features/photo/services/photo.service';
import { readCapturedAtUnixSecFromUri } from '@/features/photo/services/photo-exif-reader.service';
import { ensureAllPhotosPermissionOrThrow, isMediaPermissionError } from '@/features/photo/services/media-permission.service';
import {
  acknowledgeExternalPhotoStorage,
  getExternalPhotoStorageNoticeLines,
  hasAcknowledgedExternalPhotoStorage,
} from '@/features/settings/services/photo-storage-notice.service';
import { Button } from '@/shared/ui/Button';
import { usePhotoStore } from '@/features/photo/store/photo.store';
import { toStoredDate } from '@/shared/utils/format';

interface PhotoImporterProps {
  onImported?: (count: number) => void;
  multi?: boolean;
  mode?: 'import' | 'select';
  onSelectResolvedItem?: (item: PhotoImportItem) => Promise<void> | void;
  buttonTitle?: string;
  disabled?: boolean;
}

const ASSET_PAGE_SIZE = 120;
const SELECT_ALL_PAGE_SIZE = 300;
const ALL_ALBUM_ID = '__ALL__';
const PHOTO_IMPORT_DEBUG_PREFIX = '[photo.import.debug]';

type FileInfoLike = {
  exists: boolean;
  size?: number | null;
};

type LoadAssetsPageOptions = {
  reset: boolean;
  albumId: string;
};

type AlbumOption = {
  id: string;
  title: string;
  assetCount: number | null;
};

type DebugLogPayload = Record<string, unknown>;

function isImportDebugEnabled(): boolean {
  return __DEV__;
}

function formatDebugPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable-payload]';
  }
}

function formatDebugError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const stackTop = typeof error.stack === 'string' ? error.stack.split('\n')[0] : null;
    return {
      name: error.name,
      message: error.message,
      stackTop,
    };
  }
  return {
    message: String(error),
  };
}

function summarizeAssetInfoForDebug(assetInfo: unknown): Record<string, unknown> {
  if (!assetInfo || typeof assetInfo !== 'object') {
    return {
      exists: false,
    };
  }

  return {
    exists: true,
    id: readStringField(assetInfo, 'id'),
    uri: readStringField(assetInfo, 'uri'),
    localUri: readStringField(assetInfo, 'localUri'),
    filename: readStringField(assetInfo, 'filename'),
    creationTime: readNumberField(assetInfo, 'creationTime') ?? null,
    width: readNumberField(assetInfo, 'width') ?? null,
    height: readNumberField(assetInfo, 'height') ?? null,
    fileSize: readNumberField(assetInfo, 'fileSize') ?? null,
    mimeType: readStringField(assetInfo, 'mimeType'),
  };
}

function logImportDebug(step: string, payload?: DebugLogPayload): void {
  if (!isImportDebugEnabled()) return;
  if (payload) {
    console.info(`${PHOTO_IMPORT_DEBUG_PREFIX} ${step}`, formatDebugPayload(payload));
    return;
  }
  console.info(`${PHOTO_IMPORT_DEBUG_PREFIX} ${step}`);
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[key];
  return normalizeNonEmptyString(typeof raw === 'string' ? raw : null);
}

function readNumberField(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function resolvePositiveInteger(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function toStoredDateFromTimestamp(value: number | null | undefined): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return undefined;
  return toStoredDate(date);
}

async function getExistingFileInfo(
  uriCandidates: string[]
): Promise<{ uri: string; info: FileInfoLike } | null> {
  for (const uri of uriCandidates) {
    try {
      const info = (await getInfoAsync(uri)) as FileInfoLike;
      if (info.exists) {
        return { uri, info };
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function dedupeAssetsById(items: MediaLibrary.Asset[]): MediaLibrary.Asset[] {
  const byId = new Map<string, MediaLibrary.Asset>();
  for (const item of items) {
    if (!item.id) continue;
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

async function resolveAssetForImport(asset: MediaLibrary.Asset): Promise<PhotoImportItem | null> {
  const uriCandidates = [normalizeNonEmptyString(asset.uri)].filter((value): value is string => !!value);

  const fileInfo = await getExistingFileInfo(uriCandidates);
  if (!fileInfo) {
    logImportDebug('asset.resolve.unreadable', {
      mode: 'resolveAssetForImport',
      assetId: asset.id,
      assetFilename: normalizeNonEmptyString(asset.filename),
      uriCandidates,
    });
    return null;
  }

  const width = resolvePositiveInteger(asset.width) ?? 0;
  const height = resolvePositiveInteger(asset.height) ?? 0;
  const fileSize = resolvePositiveInteger(fileInfo.info.size);
  const capturedAtUnixSec = await readCapturedAtUnixSecFromUri(fileInfo.uri);
  const takenDate = toStoredDateFromTimestamp(asset.creationTime);
  const fileName = normalizeNonEmptyString(asset.filename) ?? undefined;
  const mimeType = undefined;

  logImportDebug('asset.resolve.result', {
    mode: 'resolveAssetForImport',
    asset: {
      id: asset.id,
      uri: normalizeNonEmptyString(asset.uri),
      filename: normalizeNonEmptyString(asset.filename),
      creationTime: asset.creationTime ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
    },
    uriCandidates,
    resolved: {
      uri: fileInfo.uri,
      width,
      height,
      fileSize: fileSize ?? null,
      capturedAtUnixSec,
      takenDate: takenDate ?? null,
      fileName: fileName ?? null,
      mimeType: mimeType ?? null,
    },
    exifRead: {
      mode: 'uri-exifr',
      capturedAtUnixSec,
    },
  });

  return {
    uri: fileInfo.uri,
    width,
    height,
    fileSize,
    capturedAtUnixSec,
    takenDate,
    fileName,
    mimeType,
    assetId: asset.id,
    sourceProvider: 'media_library',
  };
}

async function resolveAssetForImportById(assetId: string): Promise<PhotoImportItem | null> {
  let assetInfo: MediaLibrary.AssetInfo;
  try {
    // Keep as best-effort fallback for resolving URI when only assetId is available.
    assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
  } catch (error) {
    logImportDebug('assetInfo.fetch.failed', {
      mode: 'resolveAssetForImportById',
      assetId,
      error: formatDebugError(error),
    });
    return null;
  }

  const uriCandidates = [
    normalizeNonEmptyString(assetInfo.localUri),
    normalizeNonEmptyString(assetInfo.uri),
  ].filter((value): value is string => !!value);

  const fileInfo = await getExistingFileInfo(uriCandidates);
  if (!fileInfo) {
    logImportDebug('asset.resolve.unreadable', {
      mode: 'resolveAssetForImportById',
      assetId,
      uriCandidates,
      assetInfo: summarizeAssetInfoForDebug(assetInfo as unknown),
    });
    return null;
  }

  const width = resolvePositiveInteger(assetInfo.width) ?? 0;
  const height = resolvePositiveInteger(assetInfo.height) ?? 0;
  const fileSize =
    resolvePositiveInteger(fileInfo.info.size) ??
    resolvePositiveInteger(readNumberField(assetInfo as unknown, 'fileSize'));
  const capturedAtUnixSec = await readCapturedAtUnixSecFromUri(fileInfo.uri);
  const takenDate = toStoredDateFromTimestamp(assetInfo.creationTime);
  const fileName = normalizeNonEmptyString(assetInfo.filename) ?? undefined;
  const mimeType = readStringField(assetInfo as unknown, 'mimeType') ?? undefined;

  logImportDebug('asset.resolve.result', {
    mode: 'resolveAssetForImportById',
    assetId,
    assetInfo: summarizeAssetInfoForDebug(assetInfo as unknown),
    uriCandidates,
    resolved: {
      uri: fileInfo.uri,
      width,
      height,
      fileSize: fileSize ?? null,
      capturedAtUnixSec,
      takenDate: takenDate ?? null,
      fileName: fileName ?? null,
      mimeType: mimeType ?? null,
    },
    exifRead: {
      mode: 'uri-exifr',
      capturedAtUnixSec,
    },
  });

  return {
    uri: fileInfo.uri,
    width,
    height,
    fileSize,
    capturedAtUnixSec,
    takenDate,
    fileName,
    mimeType,
    assetId,
    sourceProvider: 'media_library',
  };
}

export function PhotoImporter({
  onImported,
  multi = true,
  mode = 'import',
  onSelectResolvedItem,
  buttonTitle,
  disabled = false,
}: PhotoImporterProps) {
  const isSelectMode = mode === 'select';
  const enableMulti = !isSelectMode && multi;
  const [modalVisible, setModalVisible] = useState(false);
  const [albumPickerVisible, setAlbumPickerVisible] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectAllLoading, setSelectAllLoading] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>(ALL_ALBUM_ID);
  const [currentAlbumTotalCount, setCurrentAlbumTotalCount] = useState<number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [storageNoticeVisible, setStorageNoticeVisible] = useState(false);
  const [checkingStorageNotice, setCheckingStorageNotice] = useState(false);
  const [confirmingStorageNotice, setConfirmingStorageNotice] = useState(false);
  const requestSeqRef = useRef(0);
  const selectAllRequestSeqRef = useRef(0);

  const { importPhotos } = usePhotoStore();
  const selectedCount = selectedAssetIds.size;
  const storageNoticeLines = useMemo(() => getExternalPhotoStorageNoticeLines(), []);

  const albumOptions = useMemo<AlbumOption[]>(() => {
    const localAlbums = albums.map((album) => ({
      id: album.id,
      title: album.title,
      assetCount: typeof album.assetCount === 'number' ? album.assetCount : null,
    }));
    return [
      {
        id: ALL_ALBUM_ID,
        title: '所有照片',
        assetCount: null,
      },
      ...localAlbums,
    ];
  }, [albums]);

  const selectedAlbumTitle = useMemo(() => {
    return albumOptions.find((item) => item.id === selectedAlbumId)?.title ?? '所有照片';
  }, [albumOptions, selectedAlbumId]);

  const closePicker = useCallback(() => {
    requestSeqRef.current += 1;
    selectAllRequestSeqRef.current += 1;
    setModalVisible(false);
    setAlbumPickerVisible(false);
    setImporting(false);
    setSelectAllLoading(false);
    setLoadingAlbums(false);
    setLoadingAssets(false);
    setLoadingMore(false);
    setAlbums([]);
    setAssets([]);
    setSelectedAssetIds(new Set());
    setSelectedAlbumId(ALL_ALBUM_ID);
    setCurrentAlbumTotalCount(null);
    setHasNextPage(false);
    setCursor(undefined);
  }, []);

  const closeStorageNotice = useCallback(() => {
    if (confirmingStorageNotice) return;
    setStorageNoticeVisible(false);
  }, [confirmingStorageNotice]);

  const loadAlbums = useCallback(async (): Promise<MediaLibrary.Album[]> => {
    setLoadingAlbums(true);
    try {
      const fetched = await MediaLibrary.getAlbumsAsync();
      const filtered = fetched
        .filter((album) => (album.assetCount ?? 0) > 0)
        .sort((a, b) => a.title.localeCompare(b.title));
      setAlbums(filtered);
      return filtered;
    } finally {
      setLoadingAlbums(false);
    }
  }, []);

  const loadAssetsPage = useCallback(
    async ({ reset, albumId }: LoadAssetsPageOptions): Promise<void> => {
      const requestId = ++requestSeqRef.current;
      if (reset) {
        setLoadingAssets(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const options: MediaLibrary.AssetsOptions = {
          first: ASSET_PAGE_SIZE,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        };

        if (albumId !== ALL_ALBUM_ID) {
          options.album = albumId;
        }

        if (!reset && cursor) {
          options.after = cursor;
        }

        const page = await MediaLibrary.getAssetsAsync(options);
        if (requestId !== requestSeqRef.current) return;

        setCurrentAlbumTotalCount(page.totalCount);
        if (reset) {
          setAssets(page.assets);
        } else {
          setAssets((prev) => dedupeAssetsById([...prev, ...page.assets]));
        }

        setHasNextPage(page.hasNextPage);
        setCursor(page.endCursor ?? undefined);
      } finally {
        if (requestId === requestSeqRef.current) {
          if (reset) {
            setLoadingAssets(false);
          } else {
            setLoadingMore(false);
          }
        }
      }
    },
    [cursor]
  );

  const fetchAllAssetIdsForAlbum = useCallback(async (albumId: string): Promise<Set<string>> => {
    const requestId = ++selectAllRequestSeqRef.current;
    const collected = new Set<string>();

    let after: string | undefined;
    let hasNextPage = true;

    while (hasNextPage) {
      const options: MediaLibrary.AssetsOptions = {
        first: SELECT_ALL_PAGE_SIZE,
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      };

      if (albumId !== ALL_ALBUM_ID) {
        options.album = albumId;
      }

      if (after) {
        options.after = after;
      }

      const page = await MediaLibrary.getAssetsAsync(options);

      if (requestId !== selectAllRequestSeqRef.current) {
        throw new Error('SELECT_ALL_ABORTED');
      }

      for (const asset of page.assets) {
        if (asset.id) {
          collected.add(asset.id);
        }
      }

      hasNextPage = page.hasNextPage;
      after = page.endCursor ?? undefined;
    }

    return collected;
  }, []);

  const loadMoreAssets = useCallback(async () => {
    if (!hasNextPage || !cursor || loadingAssets || loadingMore) return;
    await loadAssetsPage({ reset: false, albumId: selectedAlbumId });
  }, [cursor, hasNextPage, loadAssetsPage, loadingAssets, loadingMore, selectedAlbumId]);

  const openPickerInternal = useCallback(async () => {
    try {
      await ensureAllPhotosPermissionOrThrow('photo_import');
    } catch (error) {
      if (isMediaPermissionError(error)) {
        Alert.alert(
          '需要完整照片权限',
          '导入前请在系统设置中允许访问“所有照片”。',
          [
            { text: '稍后', style: 'cancel' },
            {
              text: '打开设置',
              onPress: () => {
                void Linking.openSettings();
              },
            },
          ]
        );
        return;
      }

      Alert.alert('访问媒体库失败', error instanceof Error ? error.message : '未知错误');
      return;
    }

    setModalVisible(true);
    setAlbumPickerVisible(false);
    setSelectedAssetIds(new Set());
    setSelectedAlbumId(ALL_ALBUM_ID);
    setCurrentAlbumTotalCount(null);
    setAssets([]);
    setHasNextPage(false);
    setCursor(undefined);

    try {
      await loadAlbums();
    } catch (error) {
      setAlbums([]);
      Alert.alert(
        '加载相册失败',
        error instanceof Error
          ? `${error.message}\n将回退到“所有照片”。`
          : '将回退到“所有照片”。'
      );
    }

    try {
      await loadAssetsPage({ reset: true, albumId: ALL_ALBUM_ID });
    } catch (error) {
      Alert.alert('加载照片失败', error instanceof Error ? error.message : '未知错误');
      setModalVisible(false);
    }
  }, [loadAlbums, loadAssetsPage]);

  const openPicker = useCallback(async () => {
    if (disabled || importing || checkingStorageNotice || confirmingStorageNotice) return;

    setCheckingStorageNotice(true);
    try {
      const acknowledged = await hasAcknowledgedExternalPhotoStorage();
      if (acknowledged) {
        await openPickerInternal();
        return;
      }
      setStorageNoticeVisible(true);
    } catch (error) {
      console.info(
        `${PHOTO_IMPORT_DEBUG_PREFIX} storage_notice_check_failed`,
        formatDebugPayload(formatDebugError(error))
      );
      setStorageNoticeVisible(true);
    } finally {
      setCheckingStorageNotice(false);
    }
  }, [checkingStorageNotice, confirmingStorageNotice, disabled, importing, openPickerInternal]);

  const handleConfirmStorageNotice = useCallback(async () => {
    if (confirmingStorageNotice) return;

    setConfirmingStorageNotice(true);
    try {
      try {
        await acknowledgeExternalPhotoStorage();
      } catch (error) {
        console.info(
          `${PHOTO_IMPORT_DEBUG_PREFIX} storage_notice_persist_failed`,
          formatDebugPayload(formatDebugError(error))
        );
      }

      setStorageNoticeVisible(false);
      await openPickerInternal();
    } finally {
      setConfirmingStorageNotice(false);
    }
  }, [confirmingStorageNotice, openPickerInternal]);

  const handleSelectAlbum = useCallback(
    async (albumId: string) => {
      setAlbumPickerVisible(false);
      if (albumId === selectedAlbumId) {
        return;
      }

      selectAllRequestSeqRef.current += 1;
      setSelectAllLoading(false);
      setSelectedAssetIds(new Set());
      try {
        await loadAssetsPage({ reset: true, albumId });
        setSelectedAlbumId(albumId);
      } catch (error) {
        Alert.alert(
          '加载相册照片失败',
          error instanceof Error ? error.message : '未知错误'
        );
      }
    },
    [loadAssetsPage, selectedAlbumId]
  );

  const toggleSelection = useCallback(
    (assetId: string) => {
      setSelectedAssetIds((prev) => {
        const next = new Set(prev);
        const alreadySelected = next.has(assetId);

        if (alreadySelected) {
          next.delete(assetId);
          return next;
        }

        if (!enableMulti) {
          next.clear();
        }
        next.add(assetId);
        return next;
      });
    },
    [enableMulti]
  );

  const runSelectAllCurrentAlbum = useCallback(async () => {
    if (!enableMulti || selectAllLoading) return;

    setSelectAllLoading(true);
    try {
      const allIds = await fetchAllAssetIdsForAlbum(selectedAlbumId);
      setSelectedAssetIds(allIds);
    } catch (error) {
      if (error instanceof Error && error.message === 'SELECT_ALL_ABORTED') {
        return;
      }
      Alert.alert('全选失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setSelectAllLoading(false);
    }
  }, [enableMulti, fetchAllAssetIdsForAlbum, selectAllLoading, selectedAlbumId]);

  const handleSelectAllCurrentAlbum = useCallback(() => {
    if (!enableMulti || selectAllLoading) return;

    if (selectedAlbumId === ALL_ALBUM_ID) {
      Alert.alert(
        '要全选“所有照片”吗？',
        '这可能会选中非常多照片，并耗费较长时间。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '全选',
            onPress: () => {
              void runSelectAllCurrentAlbum();
            },
          },
        ]
      );
      return;
    }

    void runSelectAllCurrentAlbum();
  }, [enableMulti, runSelectAllCurrentAlbum, selectAllLoading, selectedAlbumId]);

  const notifyImportSummary = useCallback(
    (createdCount: number, duplicateCount: number, unreadableCount: number) => {
      if (createdCount > 0) {
        onImported?.(createdCount);
      }

      const lines = [`已导入：${createdCount}`];
      if (duplicateCount > 0) {
        lines.push(`已跳过重复项：${duplicateCount}`);
      }
      if (unreadableCount > 0) {
        lines.push(`已跳过不可读取资源：${unreadableCount}`);
      }

      Alert.alert('导入完成', lines.join('\n'));
    },
    [onImported]
  );

  const importSelectedAssets = useCallback(async () => {
    if (selectedAssetIds.size === 0) {
      Alert.alert('未选择照片', isSelectMode ? '请先选择一张照片。' : '请至少选择一张照片后再导入。');
      return;
    }
    if (isSelectMode && selectedAssetIds.size > 1) {
      Alert.alert('请选择单张照片', '当前仅支持单张手动关联。');
      return;
    }

    setImporting(true);
    try {
      const loadedAssetById = new Map(assets.map((asset) => [asset.id, asset]));

      const importItems: PhotoImportItem[] = [];
      let unreadableCount = 0;

      for (const assetId of selectedAssetIds) {
        const loadedAsset = loadedAssetById.get(assetId);
        const item = loadedAsset
          ? await resolveAssetForImport(loadedAsset)
          : await resolveAssetForImportById(assetId);

        if (!item) {
          logImportDebug('asset.resolve.skipped', {
            assetId,
            reason: 'unreadable-or-assetInfo-fetch-failed',
          });
          unreadableCount += 1;
          continue;
        }

        logImportDebug('asset.resolve.enqueue', {
          assetId,
          uri: item.uri,
          capturedAtUnixSec: item.capturedAtUnixSec ?? null,
          fileName: item.fileName ?? null,
          fileSize: item.fileSize ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
        });
        importItems.push(item);
      }

      if (importItems.length === 0) {
        Alert.alert(isSelectMode ? '关联失败' : '导入失败', '所选资源均无法从本地存储读取。');
        return;
      }

      if (isSelectMode) {
        const selectedItem = importItems[0];
        if (!selectedItem) {
          Alert.alert('关联失败', '未找到可关联的照片资源。');
          return;
        }
        if (!onSelectResolvedItem) {
          throw new Error('未提供手动关联处理函数');
        }
        await onSelectResolvedItem(selectedItem);
        Alert.alert('关联完成', '已更新当前记录的照片关联。');
        closePicker();
        return;
      }

      const importedPhotos = await importPhotos(importItems);
      const createdCount = importedPhotos.length;
      const duplicateCount = importItems.length - createdCount;
      logImportDebug('import.batch.summary', {
        selectedCount: selectedAssetIds.size,
        importItemsCount: importItems.length,
        createdCount,
        duplicateCount,
        unreadableCount,
      });
      notifyImportSummary(createdCount, duplicateCount, unreadableCount);
      closePicker();
    } catch (error) {
      Alert.alert(isSelectMode ? '关联失败' : '导入失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setImporting(false);
    }
  }, [
    assets,
    closePicker,
    importPhotos,
    isSelectMode,
    notifyImportSummary,
    onSelectResolvedItem,
    selectedAssetIds,
  ]);

  const renderAssetItem = useCallback(
    ({ item }: { item: MediaLibrary.Asset }) => {
      const selected = selectedAssetIds.has(item.id);
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.assetCell}
          onPress={() => toggleSelection(item.id)}
        >
          <Image source={{ uri: item.uri }} style={styles.assetImage} />
          {selected ? (
            <View style={styles.selectedOverlay}>
              <Text style={styles.selectedMark}>已选</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [selectedAssetIds, toggleSelection]
  );

  const renderAlbumItem = useCallback(
    ({ item }: { item: AlbumOption }) => {
      const selected = item.id === selectedAlbumId;
      return (
        <TouchableOpacity
          style={[styles.albumItem, selected && styles.albumItemSelected]}
          onPress={() => {
            void handleSelectAlbum(item.id);
          }}
        >
          <Text style={[styles.albumItemTitle, selected && styles.albumItemTitleSelected]}>{item.title}</Text>
          {item.assetCount != null ? (
            <Text style={[styles.albumItemCount, selected && styles.albumItemCountSelected]}>{item.assetCount}</Text>
          ) : null}
        </TouchableOpacity>
      );
    },
    [handleSelectAlbum, selectedAlbumId]
  );

  const importButtonTitle = useMemo(() => {
    if (isSelectMode) {
      return selectedCount > 0 ? `关联所选（${selectedCount}）` : '关联所选';
    }
    if (!enableMulti) return '导入所选';
    return selectedCount > 0 ? `导入所选（${selectedCount}）` : '导入所选';
  }, [enableMulti, isSelectMode, selectedCount]);

  const emptyAssetText = useMemo(() => {
    if (selectedAlbumId === ALL_ALBUM_ID) {
      return '媒体库中未找到照片。';
    }
    return '该相册暂无照片。';
  }, [selectedAlbumId]);

  return (
    <View style={styles.wrap}>
      <Button
        title={buttonTitle ?? (isSelectMode ? '手动关联照片' : enableMulti ? '从媒体库导入' : '导入单张照片')}
        onPress={() => {
          void openPicker();
        }}
        loading={checkingStorageNotice || (importing && !modalVisible)}
        disabled={disabled || checkingStorageNotice || confirmingStorageNotice}
      />

      <Modal
        visible={storageNoticeVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeStorageNotice}
      >
        <View style={styles.noticeOverlay}>
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>继续前请确认</Text>
            <Text style={styles.noticeLead}>请先了解本应用与照片原文件的边界：</Text>
            {storageNoticeLines.map((line, index) => (
              <Text key={`storage-notice-${index}`} style={styles.noticeLine}>
                {index + 1}. {line}
              </Text>
            ))}

            <View style={styles.noticeActions}>
              <Button
                title="取消"
                variant="outline"
                onPress={closeStorageNotice}
                disabled={confirmingStorageNotice}
                style={styles.flexButton}
              />
              <View style={styles.actionGap} />
              <Button
                title="我已了解"
                onPress={() => {
                  void handleConfirmStorageNotice();
                }}
                loading={confirmingStorageNotice}
                disabled={confirmingStorageNotice}
                style={styles.flexButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={closePicker}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>选择照片</Text>
            <Text style={styles.modalSubtitle}>已选：{selectedCount}</Text>
            {currentAlbumTotalCount != null ? (
              <Text style={styles.modalSubtitle}>{`相册总数：${currentAlbumTotalCount}`}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.albumSwitcher}
              onPress={() => setAlbumPickerVisible(true)}
              activeOpacity={0.8}
              disabled={loadingAlbums}
            >
              <Text style={styles.albumSwitcherLabel}>相册</Text>
              <Text style={styles.albumSwitcherValue}>{selectedAlbumTitle}</Text>
            </TouchableOpacity>
            {albums.length === 0 && !loadingAlbums ? (
              <Text style={styles.albumHint}>未找到可用相册，当前显示“所有照片”。</Text>
            ) : null}

            {enableMulti ? (
              <View style={styles.selectActions}>
                <Button
                  title={selectAllLoading ? '全选中...' : '全选'}
                  onPress={handleSelectAllCurrentAlbum}
                  loading={selectAllLoading}
                  disabled={loadingAssets || importing}
                  variant="outline"
                  style={styles.selectActionButton}
                />
                <View style={styles.actionGap} />
                <Button
                  title="清空"
                  onPress={() => setSelectedAssetIds(new Set())}
                  variant="outline"
                  disabled={selectedCount === 0 || selectAllLoading || importing}
                  style={styles.selectActionButton}
                />
              </View>
            ) : null}
          </View>

          {loadingAssets ? (
            <View style={styles.centerContent}>
              <Text style={styles.hintText}>加载照片中...</Text>
            </View>
          ) : (
            <FlatList
              data={assets}
              keyExtractor={(item) => item.id}
              renderItem={renderAssetItem}
              numColumns={3}
              contentContainerStyle={styles.assetListContent}
              columnWrapperStyle={styles.assetRow}
              onEndReached={() => {
                void loadMoreAssets();
              }}
              onEndReachedThreshold={0.4}
              ListEmptyComponent={
                <View style={styles.centerContent}>
                  <Text style={styles.hintText}>{emptyAssetText}</Text>
                </View>
              }
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footerLoading}>
                    <Text style={styles.hintText}>正在加载更多...</Text>
                  </View>
                ) : null
              }
            />
          )}

          <View style={styles.modalActions}>
            <Button title="取消" variant="outline" onPress={closePicker} style={styles.flexButton} />
            <View style={styles.actionGap} />
            <Button
              title={importButtonTitle}
              onPress={() => {
                void importSelectedAssets();
              }}
              loading={importing}
              disabled={selectedCount === 0 || loadingAssets || selectAllLoading}
              style={styles.flexButton}
            />
          </View>
        </View>

        <Modal visible={albumPickerVisible} transparent animationType="fade" onRequestClose={() => setAlbumPickerVisible(false)}>
          <View style={styles.albumOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setAlbumPickerVisible(false)}
            />
            <View style={styles.albumSheet}>
              <Text style={styles.albumSheetTitle}>选择相册</Text>
              <FlatList
                data={albumOptions}
                keyExtractor={(item) => item.id}
                renderItem={renderAlbumItem}
                ItemSeparatorComponent={() => <View style={styles.albumSeparator} />}
              />
            </View>
          </View>
        </Modal>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 12,
  },
  noticeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  noticeCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbeafe',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  noticeTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  noticeLead: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  noticeLine: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  noticeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  modalHeader: {
    marginBottom: 10,
  },
  modalTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  albumSwitcher: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  albumSwitcherLabel: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 2,
  },
  albumSwitcherValue: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  albumHint: {
    marginTop: 6,
    color: '#64748b',
    fontSize: 12,
  },
  selectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  selectActionButton: {
    flex: 1,
  },
  assetListContent: {
    paddingBottom: 12,
  },
  assetRow: {
    gap: 8,
  },
  assetCell: {
    flex: 1,
    aspectRatio: 1,
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    position: 'relative',
  },
  assetImage: {
    width: '100%',
    height: '100%',
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.35)',
  },
  selectedMark: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  hintText: {
    color: '#64748b',
    fontSize: 13,
  },
  footerLoading: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  flexButton: {
    flex: 1,
  },
  actionGap: {
    width: 10,
  },
  albumOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  albumSheet: {
    maxHeight: '70%',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
  },
  albumSheetTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  albumItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  albumItemSelected: {
    backgroundColor: '#dbeafe',
  },
  albumItemTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  albumItemTitleSelected: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  albumItemCount: {
    color: '#64748b',
    fontSize: 12,
    marginLeft: 12,
  },
  albumItemCountSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  albumSeparator: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginLeft: 14,
  },
});

