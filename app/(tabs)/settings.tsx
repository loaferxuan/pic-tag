import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Linking, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { getRepositories } from '@/infra/db';
import { Button } from '@/shared/ui/Button';
import type {
  ImportProgressSnapshot,
  ImportProgressStage,
  ImportSummary,
} from '@/shared/types/backup';
import { exportBackupJson, importBackupJsonFromUri } from '@/features/backup/services/backup.service';
import {
  getExternalPhotoStorageNoticeLines,
  PHOTO_STORAGE_BACKUP_EXPORT_NOTICE,
  PHOTO_STORAGE_BACKUP_IMPORT_NOTICE,
  PHOTO_STORAGE_HOME_HINT,
} from '@/features/settings/services/photo-storage-notice.service';
import { getAppVersionMeta } from '@/features/settings/services/version.service';
import { useTagStore } from '@/features/tag/store/tag.store';
import { usePhotoStore } from '@/features/photo/store/photo.store';

const IMPORT_UI_DEBUG_PREFIX = '[backup.import.ui]';
const IMPORT_CONFIRM_COUNTDOWN_SECONDS = 4;

function formatImportProgressStage(stage: ImportProgressStage): string {
  switch (stage) {
    case 'reading_backup':
      return '读取备份文件';
    case 'validating_backup':
      return '校验备份数据';
    case 'rebuilding_placeholders':
      return '重建照片占位记录';
    case 'auto_backfill_fingerprint':
      return '全库扫描自动回填';
    case 'finalizing':
      return '收尾处理中';
    default:
      return '处理中';
  }
}

function formatEtaSeconds(value: number | null, upperBound: number | null): string {
  const formatSingle = (seconds: number): string => {
    if (seconds <= 0) return '即将完成';
    if (seconds < 60) return `约 ${seconds} 秒`;
    if (seconds < 3600) return `约 ${Math.ceil(seconds / 60)} 分钟`;
    return `约 ${Math.ceil(seconds / 3600)} 小时`;
  };

  if (value == null) return '计算中';
  const mainText = formatSingle(value);
  if (upperBound == null || upperBound <= value + 10) {
    return mainText;
  }
  return `${mainText}（最慢${formatSingle(upperBound)}）`;
}

function formatProgressCount(progress: ImportProgressSnapshot): string {
  if (progress.total == null) {
    return `已处理：${progress.completed}`;
  }
  return `已处理：${progress.completed}/${progress.total}`;
}

function formatProgressPercent(progress: ImportProgressSnapshot): string {
  if (progress.percent == null) return '计算中';
  return `${progress.percent.toFixed(1)}%`;
}

function formatScanTotalAssets(value: number | null): string {
  if (value == null) return '获取中';
  return `${value}`;
}

function formatChannel(channel: string | null): string {
  if (!channel) return '未知';
  if (channel === 'production') return '正式版';
  if (channel === 'development') return '开发版';
  if (channel === 'preview') return '预览版';
  return channel;
}

function buildImportResultMessage(summary: ImportSummary): string {
  const lines = [`已恢复 ${summary.processedPhotoLinks} 条照片记录。`];
  const remainingPending = Math.max(
    0,
    summary.pendingPhotoLinks - summary.autoBackfillBySourceMatched - summary.autoBackfillByFingerprintMatched
  );
  if (remainingPending === 0) {
    lines.push('数据已整理完成，现在可以直接使用。');
    return lines.join('\n');
  }
  if (summary.autoBackfillAttempted) {
    lines.push('系统已尝试自动匹配。');
  }
  lines.push(`仍有 ${remainingPending} 条记录暂未完成关联。`);
  lines.push('可在照片详情页使用“手动关联照片”继续处理。');

  return lines.join('\n');
}

function showShareFollowupAlert(params: {
  title: string;
  description: string;
  detailLines: string[];
}): void {
  Alert.alert(
    params.title,
    [
      '已调起系统分享面板。',
      '只有当你在目标应用中完成发送或保存后，才算备份完成。',
      params.description,
      ...params.detailLines,
    ].join('\n')
  );
}

function showUnshareableAlert(params: {
  title: string;
  description: string;
  uri: string;
  detailLines: string[];
}): void {
  Alert.alert(
    params.title,
    [
      '当前设备无法直接分享。',
      '请尽快通过可用方式导出该文件，否则不视为已完成备份。',
      params.description,
      `本地文件：${params.uri}`,
      ...params.detailLines,
    ].join('\n')
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const reloadTagsWithCategories = useTagStore((s) => s.loadTagsWithCategories);
  const reloadPhotos = usePhotoStore((s) => s.loadPhotos);
  const [exportingData, setExportingData] = useState(false);
  const [importingData, setImportingData] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressSnapshot | null>(null);
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [importConfirmChecking, setImportConfirmChecking] = useState(false);
  const [, setImportConfirmHasLocalData] = useState(false);
  const [importConfirmCountdown, setImportConfirmCountdown] = useState(0);
  const [importConfirmExporting, setImportConfirmExporting] = useState(false);
  const [importConfirmCheckError, setImportConfirmCheckError] = useState<string | null>(null);
  const importConfirmProbeRef = useRef(0);
  const appVersionMeta = useMemo(() => getAppVersionMeta(), []);
  const isDevelopmentInfoVisible = __DEV__ || appVersionMeta.channel === 'development';
  const photoStorageNoticeLines = useMemo(() => getExternalPhotoStorageNoticeLines(), []);

  const refreshPhotos = async () => {
    const { queryOptions } = usePhotoStore.getState();
    await reloadPhotos(queryOptions);
  };

  const importProgressVisible = importingData && importProgress != null;

  const closeImportConfirm = () => {
    importConfirmProbeRef.current += 1;
    setImportConfirmVisible(false);
    setImportConfirmChecking(false);
    setImportConfirmHasLocalData(false);
    setImportConfirmCountdown(0);
    setImportConfirmExporting(false);
    setImportConfirmCheckError(null);
  };

  const probeHasLocalDataBeforeImport = async (): Promise<boolean> => {
    const repos = await getRepositories();
    const totalPhotos = await repos.stats.getTotalPhotoCount();
    return totalPhotos > 0;
  };

  const openImportConfirm = async () => {
    const probeId = importConfirmProbeRef.current + 1;
    importConfirmProbeRef.current = probeId;
    setImportConfirmVisible(true);
    setImportConfirmChecking(true);
    setImportConfirmHasLocalData(false);
    setImportConfirmCountdown(0);
    setImportConfirmExporting(false);
    setImportConfirmCheckError(null);
    try {
      const hasLocalData = await probeHasLocalDataBeforeImport();
      if (importConfirmProbeRef.current !== probeId) return;
      setImportConfirmHasLocalData(hasLocalData);
      setImportConfirmCountdown(hasLocalData ? IMPORT_CONFIRM_COUNTDOWN_SECONDS : 0);
    } catch (error) {
      if (importConfirmProbeRef.current !== probeId) return;
      setImportConfirmHasLocalData(true);
      setImportConfirmCountdown(IMPORT_CONFIRM_COUNTDOWN_SECONDS);
      setImportConfirmCheckError(error instanceof Error ? error.message : '本地数据检测失败，已按存在本地数据处理');
    } finally {
      if (importConfirmProbeRef.current === probeId) {
        setImportConfirmChecking(false);
      }
    }
  };

  useEffect(() => {
    if (!importConfirmVisible || importConfirmCountdown <= 0) return;
    const timer = setTimeout(() => {
      setImportConfirmCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [importConfirmCountdown, importConfirmVisible]);

  const runExportData = async () => {
    setExportingData(true);
    try {
      const { uri, summary } = await exportBackupJson();
      const shareAvailable = await Sharing.isAvailableAsync();
      if (shareAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: '导出应用备份',
          UTI: 'public.json',
        });
      }

      const detailLines = [
        `分类数：${summary.categoryCount}`,
        `标签数：${summary.tagCount}`,
        `默认标签数：${summary.defaultTagCount}`,
        `照片关联数：${summary.photoLinkCount}`,
      ];
      if (shareAvailable) {
        showShareFollowupAlert({
          title: '请确认已保存备份文件',
          description: '如未完成发送或保存，请重新执行导出。',
          detailLines,
        });
      } else {
        showUnshareableAlert({
          title: '备份文件已生成',
          description: '当前导出仅完成本地文件生成，尚未完成外部备份。',
          uri,
          detailLines,
        });
      }
    } catch (error) {
      console.info(
        `${IMPORT_UI_DEBUG_PREFIX} failed`,
        JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
        })
      );
      Alert.alert('导出失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setExportingData(false);
    }
  };

  const handleExportData = () => {
    void runExportData();
  };

  const runImportData = async () => {
    setImportingData(true);
    console.info(`${IMPORT_UI_DEBUG_PREFIX} start`);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      console.info(
        `${IMPORT_UI_DEBUG_PREFIX} picker_result`,
        JSON.stringify({
          canceled: picked.canceled,
          assetCount: picked.canceled ? 0 : picked.assets.length,
          firstAssetUri: picked.canceled || picked.assets.length === 0 ? null : picked.assets[0].uri,
        })
      );
      if (picked.canceled || picked.assets.length === 0) {
        console.info(`${IMPORT_UI_DEBUG_PREFIX} canceled_or_empty`);
        return;
      }
      setImportProgress({
        stage: 'reading_backup',
        completed: 0,
        total: 1,
        percent: 0,
        etaSeconds: null,
        etaUpperBoundSeconds: null,
        etaModel: 'scan',
        matched: 0,
        remainingPending: null,
        scanTotalAssets: null,
        scanScannedAssets: null,
        scanStageMatched: 0,
        totalMatched: 0,
      });

      console.info(
        `${IMPORT_UI_DEBUG_PREFIX} call_service`,
        JSON.stringify({
          uri: picked.assets[0].uri,
          autoBackfill: true,
          interactiveAutoBackfillStart: false,
          interactiveAutoBackfill: false,
        })
      );
      const summary = await importBackupJsonFromUri(picked.assets[0].uri, {
        autoBackfill: true,
        onProgress: (progress) => {
          setImportProgress(progress);
        },
      });
      console.info(
        `${IMPORT_UI_DEBUG_PREFIX} service_resolved`,
        JSON.stringify({
          processedPhotoLinks: summary.processedPhotoLinks,
          matchedPhotoLinks: summary.matchedPhotoLinks,
          pendingPhotoLinks: summary.pendingPhotoLinks,
          pendingReasons: summary.pendingReasons,
          autoBackfillBySourceMatched: summary.autoBackfillBySourceMatched,
          autoBackfillByFingerprintMatched: summary.autoBackfillByFingerprintMatched,
        })
      );
      await Promise.all([reloadTagsWithCategories({ force: true }), refreshPhotos()]);

      const importSummaryText = buildImportResultMessage(summary);

      Alert.alert('导入完成', importSummaryText);

      if (summary.autoBackfillSkippedNoPermission > 0) {
        Alert.alert(
          '自动回填已跳过',
          '导入成功，但自动回填需要“所有照片”权限。请前往系统设置授权后重试。',
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
      }
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setImportProgress(null);
      setImportingData(false);
    }
  };

  const handleExportBeforeImport = async () => {
    if (importConfirmChecking || importingData || importConfirmExporting) return;
    setImportConfirmExporting(true);
    try {
      await runExportData();
    } finally {
      setImportConfirmExporting(false);
    }
  };

  const handleConfirmImportContinue = () => {
    if (importConfirmChecking || importingData || importConfirmExporting) return;
    if (importConfirmCountdown > 0) return;
    closeImportConfirm();
    void runImportData();
  };

  const handleImportData = () => {
    void openImportConfirm();
  };

  const importConfirmBusy = importConfirmChecking || importingData || importConfirmExporting;
  const importContinueDisabled = importConfirmBusy || importConfirmCountdown > 0;
  const importContinueTitle = importConfirmChecking
    ? '检测中...'
    : importConfirmCountdown > 0
      ? `继续导入（${importConfirmCountdown}s）`
      : '继续导入';
  const progressStageText = importProgress ? formatImportProgressStage(importProgress.stage) : '';
  const progressCountText = importProgress ? formatProgressCount(importProgress) : '';
  const progressPercentText = importProgress ? formatProgressPercent(importProgress) : '';
  const progressEtaText = importProgress ? formatEtaSeconds(importProgress.etaSeconds, importProgress.etaUpperBoundSeconds) : '';
  const isFingerprintStage = importProgress?.stage === 'auto_backfill_fingerprint';
  const scanTotalAssetsText = importProgress ? formatScanTotalAssets(importProgress.scanTotalAssets) : '获取中';
  const scanScannedAssetsText =
    importProgress == null
      ? '0'
      : `${importProgress.scanScannedAssets ?? importProgress.completed}`;
  const scanScannedDisplayText =
    importProgress != null && importProgress.scanTotalAssets != null
      ? `${scanScannedAssetsText}/${importProgress.scanTotalAssets}`
      : scanScannedAssetsText;
  const scanStageMatchedText = importProgress ? `${importProgress.scanStageMatched}` : '0';
  const progressMatchedText = importProgress ? `累计已匹配：${importProgress.totalMatched}` : '';
  const progressPendingText =
    importProgress == null
      ? ''
      : `剩余待处理：${importProgress.remainingPending == null ? '计算中' : importProgress.remainingPending}`;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>标签设置</Text>
          <Text style={styles.hintText}>管理标签分类、颜色和默认标签。</Text>
          <Button title="管理标签" onPress={() => router.push('/tag/manage')} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>数据导出 / 导入</Text>
          <Text style={styles.hintText}>
            导出内容包括分类、标签、默认标签设置、照片关联映射和照片备注。
          </Text>
          <Text style={styles.hintText}>导入以覆盖模式执行，会清空现有本地数据后重建。</Text>
          <Text style={styles.hintText}>{PHOTO_STORAGE_BACKUP_EXPORT_NOTICE}</Text>
          <Text style={styles.hintText}>{PHOTO_STORAGE_BACKUP_IMPORT_NOTICE}</Text>
          <Text style={styles.hintText}>
            未能关联到设备文件的导入照片会以占位记录保留，可在照片详情页手动关联；导入后仍会自动执行回填流程。
          </Text>

          <View style={styles.editorActions}>
            <Button
              title="导出数据"
              onPress={handleExportData}
              loading={exportingData}
              disabled={importingData}
              style={styles.flexButton}
            />
            <View style={styles.gap} />
            <Button
              title="导入数据"
              onPress={handleImportData}
              loading={importingData}
              disabled={exportingData}
              variant="outline"
              style={styles.flexButton}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>照片存储说明</Text>
          <Text style={styles.hintText}>{PHOTO_STORAGE_HOME_HINT}</Text>
          {photoStorageNoticeLines.map((line, index) => (
            <Text key={`photo-storage-notice-${index}`} style={styles.hintText}>
              {index + 1}. {line}
            </Text>
          ))}
        </View>

        <View style={styles.versionCard}>
          <Text style={styles.versionTitle}>应用版本</Text>
          <Text style={styles.versionLine}>应用版本：{appVersionMeta.appVersion}</Text>
          {isDevelopmentInfoVisible ? (
            <>
              <Text style={styles.versionLine}>原生构建：{appVersionMeta.nativeBuild ?? '未知'}</Text>
              <Text style={styles.versionLine}>运行时版本：{appVersionMeta.runtimeVersion ?? '未知'}</Text>
              <Text style={styles.versionLine}>发布通道：{formatChannel(appVersionMeta.channel)}</Text>
              <Text style={styles.versionLine}>Git Commit：{appVersionMeta.gitCommitShort ?? '未知'}</Text>
            </>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={importConfirmVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          if (importConfirmBusy) return;
          closeImportConfirm();
        }}
      >
        <View style={styles.importConfirmOverlay}>
          <View style={styles.importConfirmCard}>
            <Text style={styles.importConfirmTitle}>确认导入</Text>
            <Text style={styles.importConfirmText}>导入会清空当前所有本地数据，并用备份内容覆盖重建。</Text>
            <Text style={styles.importConfirmHint}>建议先导出备份，以便回退。</Text>

            {importConfirmChecking ? (
              <View style={styles.importConfirmCheckingRow}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.importConfirmCheckingText}>正在检测本地数据...</Text>
              </View>
            ) : null}

            {importConfirmCheckError ? (
              <Text style={styles.importConfirmError}>{importConfirmCheckError}</Text>
            ) : null}

            <View style={styles.importConfirmActionRow}>
              <Button
                title="取消"
                onPress={closeImportConfirm}
                variant="ghost"
                disabled={importConfirmBusy}
                style={styles.importConfirmAction}
              />
              <View style={styles.gap} />
              <Button
                title="先导出备份"
                onPress={() => {
                  void handleExportBeforeImport();
                }}
                variant="outline"
                loading={importConfirmExporting}
                disabled={importConfirmBusy}
                style={styles.importConfirmAction}
              />
            </View>

            <Button
              title={importContinueTitle}
              onPress={handleConfirmImportContinue}
              disabled={importContinueDisabled}
              style={styles.importConfirmContinue}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={importProgressVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.progressOverlay}>
          <View style={styles.progressCard}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.progressTitle}>正在导入与自动回填</Text>
            <Text style={styles.progressLine}>阶段：{progressStageText}</Text>
            {isFingerprintStage ? (
              <>
                <Text style={styles.progressLine}>图库总数：{scanTotalAssetsText}</Text>
                <Text style={styles.progressLine}>已扫描：{scanScannedDisplayText}</Text>
                <Text style={styles.progressLine}>扫描阶段新增匹配：{scanStageMatchedText}</Text>
                <Text style={styles.progressLine}>{progressMatchedText}</Text>
                <Text style={styles.progressLine}>{progressPendingText}</Text>
                <Text style={styles.progressLine}>完成比例：{progressPercentText}</Text>
                <Text style={styles.progressLine}>预计剩余：{progressEtaText}</Text>
              </>
            ) : (
              <>
                <Text style={styles.progressLine}>{progressCountText}</Text>
                <Text style={styles.progressLine}>完成比例：{progressPercentText}</Text>
                <Text style={styles.progressLine}>预计剩余：{progressEtaText}</Text>
                <Text style={styles.progressLine}>{progressMatchedText}</Text>
                <Text style={styles.progressLine}>{progressPendingText}</Text>
              </>
            )}
            <Text style={styles.progressHint}>请勿离开当前页面。</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  hintText: {
    color: '#475569',
    fontSize: 13,
    marginBottom: 6,
  },
  editorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  flexButton: {
    flex: 1,
  },
  gap: {
    width: 10,
  },
  versionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginTop: 8,
  },
  versionTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  versionLine: {
    color: '#475569',
    fontSize: 12,
    marginBottom: 2,
  },
  importConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  importConfirmCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  importConfirmTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  importConfirmText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
  },
  importConfirmHint: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  importConfirmCheckingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  importConfirmCheckingText: {
    marginLeft: 8,
    color: '#334155',
    fontSize: 13,
  },
  importConfirmError: {
    marginTop: 8,
    color: '#dc2626',
    fontSize: 12,
    lineHeight: 18,
  },
  importConfirmActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  importConfirmAction: {
    flex: 1,
  },
  importConfirmContinue: {
    marginTop: 10,
  },
  progressOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  progressCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  progressTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 10,
  },
  progressLine: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 2,
    alignSelf: 'stretch',
  },
  progressHint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 10,
  },
});
