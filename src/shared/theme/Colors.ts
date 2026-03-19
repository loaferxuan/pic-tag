const tintColorLight = '#4f46e5'; // Indigo 600
const tintColorDark = '#818cf8'; // Indigo 400

const Colors = {
  light: {
    text: '#0f172a', // Slate 900
    textSecondary: '#64748b', // Slate 500
    background: '#f8fafc', // Slate 50
    tint: tintColorLight,
    tabIconDefault: '#94a3b8', // Slate 400
    tabIconSelected: tintColorLight,
    border: '#e2e8f0', // Slate 200
    card: '#ffffff',
    surface: '#ffffff',
    surfaceHighlight: '#f1f5f9', // Slate 100
  },
  dark: {
    text: '#f8fafc', // Slate 50
    textSecondary: '#94a3b8', // Slate 400
    background: '#0f172a', // Slate 900
    tint: tintColorDark,
    tabIconDefault: '#475569', // Slate 600
    tabIconSelected: tintColorDark,
    border: '#1e293b', // Slate 800
    card: '#1e293b', // Slate 800
    surface: '#1e293b',
    surfaceHighlight: '#334155', // Slate 700
  },
};

export type Theme = typeof Colors.light;
export type ColorScheme = keyof typeof Colors;

export default Colors as Record<ColorScheme, Theme>;
