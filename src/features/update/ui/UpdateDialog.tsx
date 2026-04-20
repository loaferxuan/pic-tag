import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import type { NativeUpdateInfo } from '@/shared/types/native-update';
import { Button } from '@/shared/ui/Button';

interface UpdateDialogProps {
  visible: boolean;
  info: NativeUpdateInfo | null;
  currentAppVersion: string;
  currentNativeBuild: string;
  openingDownload: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function UpdateDialog({
  visible,
  info,
  currentAppVersion,
  currentNativeBuild,
  openingDownload,
  onConfirm,
  onDismiss,
}: UpdateDialogProps) {
  const isForceUpdate = info?.forceUpdate === true;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (!isForceUpdate) {
          onDismiss();
        }
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>发现新版本 {info?.latestVersion ?? ''}</Text>
          {info?.latestVersionNo ? <Text style={styles.subtitle}>Build {info.latestVersionNo}</Text> : null}
          <Text style={styles.description}>{info?.releaseNotes ?? '已发布新版本，建议立即更新。'}</Text>
          <Text style={styles.meta}>
            当前版本 {currentAppVersion}（build {currentNativeBuild}）
          </Text>

          {isForceUpdate ? null : (
            <Button title="稍后再说" variant="ghost" onPress={onDismiss} disabled={openingDownload} style={styles.action} />
          )}
          <Button
            title="立即更新"
            onPress={onConfirm}
            loading={openingDownload}
            disabled={openingDownload}
            style={[styles.action, !isForceUpdate ? styles.primaryAction : undefined]}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  title: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    color: '#475569',
    fontSize: 12,
  },
  description: {
    marginTop: 10,
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
  },
  meta: {
    marginTop: 10,
    color: '#64748b',
    fontSize: 12,
  },
  action: {
    marginTop: 10,
  },
  primaryAction: {
    marginTop: 8,
  },
});
