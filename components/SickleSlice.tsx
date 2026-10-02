import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { LogoBar } from '@/components/Logo';
import { Body, Display } from '@/components/ui';
import { useTheme } from '@/lib/theme';

const native = Platform.OS !== 'web';

// The sickle, drawn like Drake's logo concepts: a cream blade with a red
// stripe along its inner edge, on a black grip with red bands.
function Sickle({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M62 142 C30 70 92 4 188 34 C120 26 78 72 84 142 Z" fill="#F1EADB" stroke="#0B0B0B" strokeWidth={3} />
      <Path d="M80 138 C76 80 112 38 170 34 C122 34 88 72 86 138 Z" fill="#E0262B" />
      <Rect x={56} y={136} width={32} height={10} rx={3} fill="#C9C2B4" stroke="#0B0B0B" strokeWidth={2} />
      <Rect x={61} y={144} width={22} height={52} rx={8} fill="#141414" />
      <Rect x={61} y={156} width={22} height={4} fill="#E0262B" />
      <Rect x={61} y={170} width={22} height={4} fill="#E0262B" />
      <Rect x={61} y={184} width={22} height={4} fill="#E0262B" />
    </Svg>
  );
}

// Full-screen "Challenge accepted" moment: a sickle swings across, slices the
// screen in half, the halves part to show the card, then it all fades away.
// Tap anywhere to skip. With Reduce Motion on, the card just fades in and out.
export function SickleSlice({ title, detail, onDone }: { title: string; detail: string; onDone: () => void }) {
  const { colors } = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const swing = useRef(new Animated.Value(0)).current;
  const slash = useRef(new Animated.Value(0)).current;
  const split = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (cancelled) return;
      if (reduce) {
        split.setValue(1);
        Animated.sequence([
          Animated.timing(card, { toValue: 1, duration: 250, useNativeDriver: native }),
          Animated.delay(1400),
          Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: native }),
        ]).start(finish);
        return;
      }
      Animated.sequence([
        Animated.timing(swing, { toValue: 1, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
        Animated.parallel([
          Animated.timing(slash, { toValue: 1, duration: 140, useNativeDriver: native }),
          Animated.timing(split, { toValue: 1, duration: 420, delay: 90, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
          Animated.spring(card, { toValue: 1, delay: 120, friction: 6, tension: 80, useNativeDriver: native }),
        ]),
        Animated.delay(1300),
        Animated.timing(fade, { toValue: 0, duration: 450, useNativeDriver: native }),
      ]).start(finish);
      // The thunk lands as the blade crosses the middle.
      setTimeout(() => {
        if (!cancelled && native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }, 470);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once when it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const size = Math.min(W, 420) * 0.62;
  const half = H / 2;
  const dark = '#0B0B0B';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={finish}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}. Tap to close.`} style={{ flex: 1 }} onPress={finish}>
        <Animated.View style={{ flex: 1, opacity: fade }}>
          {/* What the halves reveal. */}
          <View style={{ position: 'absolute', inset: 0, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Animated.View
              style={{
                alignItems: 'center',
                gap: 10,
                opacity: card,
                transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
              }}>
              <LogoBar width={180} onDark={false} />
              <Display size={46} tone="onAccent" style={{ textAlign: 'center', lineHeight: 56, paddingTop: 4 }}>
                {title}
              </Display>
              <Body size={16} weight="semibold" tone="onAccent" style={{ textAlign: 'center' }}>
                {detail}
              </Body>
            </Animated.View>
          </View>

          {/* The two halves of the screen, pulled apart after the cut. */}
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: half,
              backgroundColor: dark,
              transform: [{ translateY: split.interpolate({ inputRange: [0, 1], outputRange: [0, -half - 20] }) }],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: half,
              height: H - half,
              backgroundColor: dark,
              transform: [{ translateY: split.interpolate({ inputRange: [0, 1], outputRange: [0, H - half + 20] }) }],
            }}
          />

          {/* The cut. */}
          <Animated.View
            style={{
              position: 'absolute',
              left: -W * 0.1,
              width: W * 1.2,
              top: half - 2,
              height: 4,
              backgroundColor: colors.accentFill,
              opacity: slash.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0.9] }),
              transform: [{ scaleX: slash }],
            }}
          />

          {/* The sickle swinging through. */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: half - size * 0.55,
              left: 0,
              opacity: swing.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: swing.interpolate({ inputRange: [0, 1], outputRange: [-size, W] }) },
                { rotate: swing.interpolate({ inputRange: [0, 1], outputRange: ['-70deg', '80deg'] }) },
              ],
            }}>
            <Sickle size={size} />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
