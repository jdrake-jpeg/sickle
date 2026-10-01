// Sickle brand palette. Black and cream dominate; Pickle Green is the
// signature highlight; Sickle Red is a sparing secondary accent.
export const brand = {
  pickleGreen: '#D7FF3F',
  sickleRed: '#E11D2E',
  cream: '#F6F1E4',
  black: '#0B0B0B',
} as const;

export type ThemeName = 'dark' | 'light';

export type Palette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  // Green used for text, icons and outlines. Bright on dark, olive on light
  // so it stays readable on cream.
  accentText: string;
  accentFill: string;
  onAccent: string;
  danger: string;
  dangerText: string;
  onDanger: string;
  inverse: string;
  onInverse: string;
};

export const palettes: Record<ThemeName, Palette> = {
  dark: {
    background: brand.black,
    surface: '#161616',
    surfaceRaised: '#1F1F1F',
    border: '#262626',
    borderStrong: '#3A3A3A',
    text: brand.cream,
    textMuted: '#A29E94',
    textSubtle: '#C9C4B8',
    accentText: brand.pickleGreen,
    accentFill: brand.pickleGreen,
    onAccent: brand.black,
    danger: brand.sickleRed,
    dangerText: '#FF5A67',
    onDanger: brand.cream,
    inverse: brand.cream,
    onInverse: brand.black,
  },
  light: {
    background: brand.cream,
    surface: '#FFFFFF',
    surfaceRaised: '#EFE9DA',
    border: '#E0D9C6',
    borderStrong: '#CBC3AE',
    text: brand.black,
    textMuted: '#666157',
    textSubtle: '#45413A',
    accentText: '#4A6500',
    accentFill: brand.pickleGreen,
    onAccent: brand.black,
    danger: brand.sickleRed,
    dangerText: '#B81424',
    onDanger: brand.cream,
    inverse: brand.black,
    onInverse: brand.cream,
  },
};

export const fonts = {
  display: 'Saira_900Black_Italic',
  heading: 'Saira_800ExtraBold_Italic',
  numeric: 'Saira_800ExtraBold',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemibold: 'Barlow_600SemiBold',
  bodyBold: 'Barlow_700Bold',
} as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 22 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
