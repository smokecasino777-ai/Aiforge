export const colors = {
  bg: '#020208',
  bgElev: '#0A0A14',
  surface: '#12121C',
  surfaceAlt: '#1A1A28',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.18)',
  text: '#FFFFFF',
  textDim: '#A1A1AA',
  textMuted: '#71717A',
  cyan: '#00F0FF',
  green: '#00FF66',
  purple: '#B026FF',
  pink: '#FF26C9',
  red: '#FF2D55',
  redGlow: '#FF4D6D',
  yellow: '#FFD60A',
  blue: '#0099FF',
  imageTag: '#00FF66',
  videoTag: '#00F0FF',
  model3dTag: '#B026FF',
  chatTag: '#FFD60A',
};

export const radius = { sm: 8, md: 14, lg: 22, xl: 28, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const TYPE_META = {
  image: { label: 'Image', color: colors.green, tagBg: 'rgba(0,255,102,0.18)' },
  video: { label: 'Video', color: colors.cyan, tagBg: 'rgba(0,240,255,0.18)' },
  model3d: { label: '3D Model', color: colors.purple, tagBg: 'rgba(176,38,255,0.18)' },
  chat: { label: 'Assistant', color: colors.yellow, tagBg: 'rgba(255,214,10,0.18)' },
} as const;

export const PLAN_META: Record<string, { color: string; gradient: [string, string]; icon: string; tagline: string }> = {
  free: { color: colors.textDim, gradient: ['#3F3F46', '#27272A'], icon: 'sparkles', tagline: 'Start the spark' },
  spark: { color: colors.green, gradient: [colors.green, '#00B248'], icon: 'zap', tagline: 'Ignite creativity' },
  forge: { color: colors.cyan, gradient: [colors.cyan, '#0077B6'], icon: 'flame', tagline: 'Forge masterpieces' },
  neon: { color: colors.purple, gradient: [colors.purple, '#7B1FA2'], icon: 'crown', tagline: 'Pro-grade power' },
  quantum: { color: colors.red, gradient: [colors.red, colors.purple], icon: 'infinity', tagline: 'Unlimited universe' },
};
