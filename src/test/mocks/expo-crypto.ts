export const CryptoDigestAlgorithm = {
  SHA256: 'SHA256',
} as const;

export const CryptoEncoding = {
  HEX: 'hex',
} as const;

export async function digestStringAsync(): Promise<string> {
  return 'a'.repeat(64);
}
