import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle } from 'react-native';
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

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const content = <View style={styles.screenContent}>{children}</View>;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>{content}</ScrollView> : content}
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

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
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

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.md, borderRadius: 16 },
});
