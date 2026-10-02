import { Image } from 'react-native';

import { useTheme } from '@/lib/theme';

// Drake's own logo files. Each keeps its real shape, so pass a width and the
// height follows. The full lockup and the outlined wordmark have black
// outlines and work on dark and light. The red-bar wordmark has none, so
// light mode gets a dark copy of it.

const full = require('@/assets/images/logo-full.png');
const wordmark = require('@/assets/images/logo-wordmark.png');
const bar = require('@/assets/images/logo-bar.png');
const barDark = require('@/assets/images/logo-bar-dark.png');

// Paddle, sickle and ball over SICKLE / PICKLE. For sign-in.
export function Logo({ width = 260 }: { width?: number }) {
  return <Image source={full} accessibilityLabel="Sickle Pickle" style={{ width, height: width * (604 / 900) }} resizeMode="contain" />;
}

// Outlined SICKLE / PICKLE. For screen headers.
export function LogoWordmark({ width = 150 }: { width?: number }) {
  return <Image source={wordmark} accessibilityLabel="Sickle Pickle" style={{ width, height: width * (257 / 900) }} resizeMode="contain" />;
}

// SICKLE with the red slash under it.
export function LogoBar({ width = 200, onDark }: { width?: number; onDark?: boolean }) {
  const { name } = useTheme();
  const light = onDark === undefined ? name === 'light' : !onDark;
  return <Image source={light ? barDark : bar} accessibilityLabel="Sickle" style={{ width, height: width * (185 / 900) }} resizeMode="contain" />;
}
