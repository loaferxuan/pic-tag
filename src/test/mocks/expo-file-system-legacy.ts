export const cacheDirectory = 'file:///tmp/';
export const documentDirectory = 'file:///tmp/';

export const EncodingType = {
  Base64: 'base64',
} as const;

export async function readAsStringAsync(): Promise<string> {
  return '';
}

export async function getInfoAsync(): Promise<{ exists: boolean; size: number }> {
  return { exists: false, size: 0 };
}

export async function writeAsStringAsync(): Promise<void> {}

export async function makeDirectoryAsync(): Promise<void> {}
