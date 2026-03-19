const HEX_COLOR_PATTERN = /^#([0-9A-Fa-f]{6})$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseHexColor(color: string): [number, number, number] | null {
  const normalized = normalizeHexColor(color, '');
  if (!normalized) return null;
  const match = HEX_COLOR_PATTERN.exec(normalized);
  if (!match) return null;
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

export function isValidHexColor(value: string | null | undefined): value is string {
  if (!value) return false;
  return HEX_COLOR_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: string | null | undefined, fallback = '#6B7280'): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (HEX_COLOR_PATTERN.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (/^[0-9A-Fa-f]{6}$/.test(withoutHash)) {
    return `#${withoutHash.toUpperCase()}`;
  }
  return fallback;
}

export function hexToRgba(value: string, alpha: number): string {
  const rgb = parseHexColor(value);
  if (!rgb) return `rgba(107, 114, 128, ${clamp(alpha, 0, 1)})`;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

export function getContrastTextColor(value: string): '#111827' | '#FFFFFF' {
  const rgb = parseHexColor(value);
  if (!rgb) return '#FFFFFF';
  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#FFFFFF';
}

export function sanitizeColorInput(input: string): string {
  const stripped = input.replace(/#/g, '').replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
  if (!stripped) return '';
  return `#${stripped.toUpperCase()}`;
}
