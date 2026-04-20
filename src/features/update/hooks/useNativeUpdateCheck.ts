import { useEffect } from 'react';
import type { NativeUpdateInfo } from '@/shared/types/native-update';
import { checkNativeUpdateOnStartup } from '@/features/update/services/native-update.service';

const STARTUP_CHECK_DELAY_MS = 2000;

export function useNativeUpdateCheck(onUpdate: (info: NativeUpdateInfo) => void): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const result = await checkNativeUpdateOnStartup();
        if (result.kind === 'has_update') {
          onUpdate(result.info);
        }
      })();
    }, STARTUP_CHECK_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [onUpdate]);
}
