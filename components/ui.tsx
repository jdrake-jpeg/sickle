import { router } from 'expo-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fonts, radius, space } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

type Tone = 'default' | 'muted' | 'subtle' | 'accent' | 'danger' | 'onAccent';

function useToneColor(tone: Tone) {
  const { colors } = useTheme();
  return {
    default: colors.text,
    muted: colors.textMuted,
    subtle: colors.textSubtle,
    accent: colors.accentText,
    danger: colors.dangerText,
    onAccent: colors.onAccent,
  }[tone];
}

type SickleTextProps = TextProps & { tone?: Tone; size?: number };

// Big italic headings, e.g. "CHALLENGES".
export function Display({ tone = 'default', size = 30, style, ...props }: SickleTextProps) {
  const color = useToneColor(tone);
  return <Text {...props} style={[{ fontFamily: fonts.display, fontSize: size, color, letterSpacing: -0.5 }, style]} />;
}

// Section headings, e.g. "NEED A PARTNER".
export function Heading({ tone = 'default', size = 17, style, ...props }: SickleTextProps) {
  const color = useToneColor(tone);
  return <Text {...props} style={[{ fontFamily: fonts.heading, fontSize: size, color }, style]} />;
}

export function Body({
  tone = 'default',
  size = 15,
  weight = 'regular',
  style,
  ...props
}: SickleTextProps & { weight?: 'regular' | 'medium' | 'semibold' | 'bold' }) {
  const color = useToneColor(tone);
  const fontFamily = { regular: fonts.body, medium: fonts.bodyMedium, semibold: fonts.bodySemibold, bold: fonts.bodyBold }[weight];
  return <Text {...props} style={[{ fontFamily, fontSize: size, color }, style]} />;
}

// The help bar stays out of the way until someone scrolls to the bottom of a
// page, then slides up from the bottom edge.
function HelpSlideUp({ show }: { show: boolean }) {
  const y = useRef(new Animated.Value(180)).current;
  useEffect(() => {
    Animated.timing(y, { toValue: show ? 0 : 180, duration: 240, useNativeDriver: true }).start();
  }, [show, y]);
  return (
    <Animated.View
      pointerEvents={show ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 12,
        transform: [{ translateY: y }],
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      }}>
      <Card style={{ padding: 14, gap: 8, alignItems: 'center' }}>
        <Body size={13} tone="muted" style={{ textAlign: 'center' }}>
          Trouble finding something or have questions?
        </Body>
        <Button label="How Sickle works" variant="outline" size="sm" onPress={() => router.push('/help')} />
      </Card>
    </Animated.View>
  );
}

export function Screen({ children, scroll = true, help = true }: { children: ReactNode; scroll?: boolean; help?: boolean }) {
  const { colors } = useTheme();
  const [showHelp, setShowHelp] = useState(false);
  const content = <View style={styles.screenContent}>{children}</View>;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!help) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const scrollable = contentSize.height > layoutMeasurement.height + 80;
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
    setShowHelp(scrollable && atBottom);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        // Keeps the box you're typing in above the keyboard. iPhone scrolls it
        // into view; Android shrinks the screen above the keyboard.
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" enabled={Platform.OS === 'android'}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: space.xxl }}
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            scrollEventThrottle={64}
            onScroll={onScroll}>
            {content}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        content
      )}
      {scroll && help ? <HelpSlideUp show={showHelp} /> : null}
    </SafeAreaView>
  );
}

export function Card({ children, style, highlighted }: { children: ReactNode; style?: StyleProp<ViewStyle>; highlighted?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: highlighted ? colors.accentText : colors.border },
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'outline' | 'danger' | 'dangerOutline' | 'ghost' | 'inverse';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  style,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const look: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.accentFill, fg: colors.onAccent, border: colors.accentFill },
    outline: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
    danger: { bg: colors.danger, fg: colors.onDanger, border: colors.danger },
    dangerOutline: { bg: 'transparent', fg: colors.text, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
    inverse: { bg: colors.inverse, fg: colors.onInverse, border: colors.inverse },
  };
  const { bg, fg, border } = look[variant];
  const height = { sm: 36, md: 46, lg: 56 }[size];
  const loud = variant === 'primary' && size !== 'sm';
  const textStyle: TextStyle = loud
    ? { fontFamily: fonts.heading, fontSize: size === 'lg' ? 18 : 16, color: fg }
    : { fontFamily: fonts.bodyBold, fontSize: size === 'sm' ? 14 : 15, color: fg };
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          height,
          minWidth: 44,
          paddingHorizontal: size === 'sm' ? 12 : 16,
          borderRadius: size === 'sm' ? radius.sm : radius.md,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}>
      <Text style={textStyle}>{loud ? label.toUpperCase() : label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={{
        opacity: disabled ? 0.35 : 1,
        height: 34,
        paddingHorizontal: 14,
        borderRadius: 17,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: selected ? colors.inverse : colors.borderStrong,
        backgroundColor: selected ? colors.inverse : 'transparent',
      }}>
      <Body size={13} weight={selected ? 'bold' : 'medium'} style={{ color: selected ? colors.onInverse : colors.text }}>
        {label}
      </Body>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accent,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accent?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: accent ? colors.background : colors.surface }}>
      {options.map((option) => {
        const active = option.value === value;
        const activeBg = accent ? colors.accentFill : colors.inverse;
        const activeFg = accent ? colors.onAccent : colors.onInverse;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={{ flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? activeBg : 'transparent' }}>
            <Body size={13} weight={active ? 'bold' : 'semibold'} style={{ color: active ? activeFg : colors.textMuted }}>
              {option.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ initials, size = 42 }: { initials: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surfaceRaised,
        borderWidth: 2,
        borderColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Body weight="bold" size={size * 0.34}>
        {initials}
      </Body>
    </View>
  );
}

export function TeamAvatars({ initials }: { initials: [string, string] }) {
  return (
    <View style={{ flexDirection: 'row', width: 64 }}>
      <Avatar initials={initials[0]} size={38} />
      <View style={{ marginLeft: -12 }}>
        <Avatar initials={initials[1]} size={38} />
      </View>
    </View>
  );
}

export function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <Heading>{title.toUpperCase()}</Heading>
      {detail ? (
        <Body size={13} tone="muted">
          {detail}
        </Body>
      ) : null}
    </View>
  );
}

export function ListRow({ left, title, subtitle, right }: { left?: ReactNode; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <Card style={styles.row}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="semibold">{title}</Body>
        {subtitle ? (
          <Body size={13} tone="muted">
            {subtitle}
          </Body>
        ) : null}
      </View>
      {right}
    </Card>
  );
}

export function Stat({ value, label, tone }: { value: string; label: string; tone?: Tone }) {
  return (
    <Card style={{ flex: 1, padding: 10, gap: 2, borderRadius: radius.md }}>
      <Text style={{ fontFamily: fonts.numeric, fontSize: 20, color: useToneColor(tone ?? 'default') }}>{value}</Text>
      <Body size={12} tone="muted">
        {label}
      </Body>
    </Card>
  );
}

export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label: string; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Body size={13} weight="semibold" tone="muted">
        {label}
      </Body>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        {...props}
        style={[
          {
            height: 48,
            paddingHorizontal: 14,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
            color: colors.text,
            fontFamily: fonts.bodyMedium,
            fontSize: 16,
          },
          style,
        ]}
      />
    </View>
  );
}

// A search box with an X that clears it in one tap.
export function SearchField({
  label,
  value,
  onChangeText,
  style,
  ...props
}: TextInputProps & { label: string; value: string; onChangeText: (text: string) => void; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Body size={13} weight="semibold" tone="muted">
        {label}
      </Body>
      <View>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          {...props}
          value={value}
          onChangeText={onChangeText}
          style={[
            {
              height: 48,
              paddingLeft: 14,
              paddingRight: 44,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surface,
              color: colors.text,
              fontFamily: fonts.bodyMedium,
              fontSize: 16,
            },
            style,
          ]}
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            onPress={() => onChangeText('')}
            style={{ position: 'absolute', right: 6, top: 0, bottom: 0, width: 36, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Body size={13} weight="bold" style={{ color: colors.background, lineHeight: 16 }}>
                ✕
              </Body>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// A small "what is this?" row that opens to a short explanation.
export function InfoDrop({ title, children, startOpen = false }: { title: string; children: ReactNode; startOpen?: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(startOpen);
  return (
    <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Body size={13} weight="bold" tone="accent">
          {open ? '▾' : '▸'}
        </Body>
        <Body size={13} weight="semibold" style={{ flex: 1 }}>
          {title}
        </Body>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 6 }}>
          {typeof children === 'string' ? (
            <Body size={13} tone="muted">
              {children}
            </Body>
          ) : (
            children
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.md, borderRadius: 16 },
});
