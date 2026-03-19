/**
 * 图片相关工具（尺寸、文件名等）。
 * 实际尺寸获取在 RN 可用 Image.getSize 或 expo-image 等，此处仅占位。
 */

export function getFileNameFromUri(uri: string): string {
  try {
    const parts = uri.split('/');
    return parts[parts.length - 1] ?? 'image.jpg';
  } catch {
    return 'image.jpg';
  }
}
