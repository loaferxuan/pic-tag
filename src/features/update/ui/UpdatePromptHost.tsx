import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import type { NativeUpdateCheckResult, NativeUpdateInfo } from '@/shared/types/native-update';
import { useNativeUpdateCheck } from '@/features/update/hooks/useNativeUpdateCheck';
import { checkNativeUpdateManually } from '@/features/update/services/native-update.service';
import { getAppVersionMeta } from '@/features/settings/services/version.service';
import { UpdateDialog } from '@/features/update/ui/UpdateDialog';

interface UpdatePromptContextValue {
  triggerManualCheck: () => Promise<NativeUpdateCheckResult>;
}

const UpdatePromptContext = createContext<UpdatePromptContextValue | null>(null);

const FORCE_UPDATE_COOLDOWN_MS = 5000;

export function UpdatePromptHost({ children }: { children: React.ReactNode }) {
  const appVersionMeta = useMemo(() => getAppVersionMeta(), []);
  const [pendingInfo, setPendingInfo] = useState<NativeUpdateInfo | null>(null);
  const [openingDownload, setOpeningDownload] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCooldownTimer = useCallback(() => {
    if (cooldownTimerRef.current != null) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearCooldownTimer();
    };
  }, [clearCooldownTimer]);

  const closeDialog = useCallback(() => {
    if (pendingInfo?.forceUpdate) return;
    setPendingInfo(null);
  }, [pendingInfo]);

  const openDownload = useCallback(async () => {
    if (!pendingInfo?.downloadURL) return;
    clearCooldownTimer();
    const isForceUpdate = pendingInfo.forceUpdate === true;
    setOpeningDownload(true);
    try {
      await Linking.openURL(pendingInfo.downloadURL);
    } catch (error) {
      Alert.alert('打开下载链接失败', error instanceof Error ? error.message : '请稍后重试');
      setOpeningDownload(false);
      return;
    }
    if (isForceUpdate) {
      cooldownTimerRef.current = setTimeout(() => {
        cooldownTimerRef.current = null;
        setOpeningDownload(false);
      }, FORCE_UPDATE_COOLDOWN_MS);
    } else {
      setOpeningDownload(false);
    }
  }, [pendingInfo, clearCooldownTimer]);

  useNativeUpdateCheck(
    useCallback((info: NativeUpdateInfo) => {
      setPendingInfo(info);
    }, [])
  );

  const triggerManualCheck = useCallback(async () => {
    const result = await checkNativeUpdateManually();
    if (result.kind === 'has_update') {
      setPendingInfo(result.info);
    }
    return result;
  }, []);

  const contextValue = useMemo<UpdatePromptContextValue>(
    () => ({
      triggerManualCheck,
    }),
    [triggerManualCheck]
  );

  return (
    <UpdatePromptContext.Provider value={contextValue}>
      {children}
      <UpdateDialog
        visible={pendingInfo != null}
        info={pendingInfo}
        currentAppVersion={appVersionMeta.appVersion}
        currentNativeBuild={appVersionMeta.nativeBuild ?? '未知'}
        openingDownload={openingDownload}
        onConfirm={() => {
          void openDownload();
        }}
        onDismiss={closeDialog}
      />
    </UpdatePromptContext.Provider>
  );
}

export function useManualUpdateCheck(): () => Promise<NativeUpdateCheckResult> {
  const context = useContext(UpdatePromptContext);
  if (!context) {
    throw new Error('useManualUpdateCheck 必须在 <UpdatePromptHost> 内使用');
  }
  return context.triggerManualCheck;
}
