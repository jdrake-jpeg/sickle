import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { Body, Display } from '@/components/ui';
import { brand, fonts } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

// Sickle logo, redrawn from Drake's concept 3: a paddle and a sickle crossed,
// a pickleball above, bold italic SICKLE and spaced green PICKLE.
// Drawn in the theme's text color so it works in light and dark mode.

const holes: [number, number][] = [
  [-7, -7],
  [6, -9],
  [-10, 4],
  [3, 2],
  [11, 6],
  [-2, 12],
];

export function LogoMark({ size = 96 }: { size?: number }) {
  const { colors, name } = useTheme();
  const ink = colors.text;
  const paper = colors.background;
  const grip = (x: number) => [136, 148, 160, 172].map((y) => <Rect key={`${x}-${y}`} x={x} y={y} width={24} height={4} fill={paper} />);

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessibilityLabel="Sickle logo">
      {/* Paddle, leaning left. */}
      <G transform="rotate(-38 100 128)">
        <Rect x={64} y={22} width={72} height={98} rx={22} fill="none" stroke={ink} strokeWidth={9} />
        <Rect x={88} y={118} width={24} height={66} rx={6} fill={ink} />
        {grip(88)}
      </G>
      {/* Sickle, leaning right. */}
      <G transform="rotate(34 100 128)">
        <Path d="M88 124 C164 112 182 30 110 0 C142 40 138 98 112 122 Z" fill={ink} />
        <Path d="M114 114 C138 92 144 50 120 16" stroke={brand.sickleRed} strokeWidth={6} fill="none" strokeLinecap="round" />
        <Rect x={88} y={118} width={24} height={66} rx={6} fill={ink} />
        {grip(88)}
      </G>
      {/* The ball. */}
      <Circle cx={98} cy={40} r={20} fill={brand.pickleGreen} stroke={name === 'light' ? brand.black : 'none'} strokeWidth={3} />
      {holes.map(([dx, dy], i) => (
        <Circle key={i} cx={98 + dx} cy={40 + dy} r={2.8} fill={brand.black} />
      ))}
    </Svg>
  );
}

// The full lockup for the sign-in screen.
export function Logo({ size = 120 }: { size?: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <LogoMark size={size} />
      <Display size={size * 0.52} style={{ marginTop: -size * 0.02 }}>
        SICKLE
      </Display>
      <Body tone="accent" style={{ fontFamily: fonts.bodyBold, fontSize: size * 0.13, letterSpacing: size * 0.07, marginTop: -size * 0.03 }}>
        PICKLE
      </Body>
    </View>
  );
}

// Small mark + SICKLE for screen headers.
export function LogoInline({ size = 28 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <LogoMark size={size * 1.4} />
      <Display size={size}>SICKLE</Display>
    </View>
  );
}
