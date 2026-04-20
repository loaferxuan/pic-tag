export interface NativeUpdateInfo {
  latestVersion: string;
  latestVersionNo: string | null;
  buildKey: string;
  downloadURL: string;
  releaseNotes: string | null;
  forceUpdate: boolean;
}

export type NativeUpdateCheckResult =
  | { kind: 'up_to_date' }
  | { kind: 'has_update'; info: NativeUpdateInfo }
  | { kind: 'misconfigured' }
  | { kind: 'network_error'; message: string };
