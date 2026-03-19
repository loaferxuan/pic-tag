export type ReleaseChannel = string;

export interface AppVersionMeta {
  appVersion: string;
  nativeBuild: string | null;
  runtimeVersion: string | null;
  channel: ReleaseChannel | null;
  gitCommitShort: string | null;
}
