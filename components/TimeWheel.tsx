import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Body } from '@/components/ui';
import { useTheme } from '@/lib/theme';

const ITEM = 40;
const ROWS = 5;

// The soonest time that can be picked: the next whole minute.
export function soonest() {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  return d;
}

// A start time, rounded up to the next half hour. A good place to begin.
export function nextHalfHour() {
  const d = soonest();
  d.setMinutes(d.getMinutes() <= 30 ? 30 : 60, 0, 0);
  if (d.getTime() < soonest().getTime()) d.setMinutes(d.getMinutes() + 30);
  return d;
}

function Column({
  items,
  index,
  onSelect,
  flex,
  isPast,
}: {
  items: string[];
  index: number;
  onSelect: (i: number) => void;
  flex: number;
  isPast?: (i: number) => boolean;
}) {
  const ref = useRef<ScrollView>(null);
  const settled = useRef(-1);

  // Move the wheel when the time changes from outside (a preferred time, or a
  // time that was in the past).
  useEffect(() => {
    if (settled.current !== index) {
      settled.current = index;
      ref.current?.scrollTo({ y: index * ITEM, animated: false });
    }
  }, [index]);

  const landed = (y: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM)));
    settled.current = i;
    onSelect(i);
    // The wheel may have been set back (a time in the past), so sit on the real value.
    ref.current?.scrollTo({ y: i * ITEM, animated: true });
  };

  return (
    <ScrollView
      ref={ref}
      style={{ flex, height: ITEM * ROWS }}
      contentContainerStyle={{ paddingVertical: ITEM * Math.floor(ROWS / 2) }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM}
      decelerationRate="fast"
      nestedScrollEnabled
      scrollEventThrottle={32}
      contentOffset={{ x: 0, y: index * ITEM }}
      onMomentumScrollEnd={(e) => landed(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => {
        // A slow drag can stop with no momentum.
        const v = e.nativeEvent.velocity?.y ?? 0;
        if (Math.abs(v) < 0.05) landed(e.nativeEvent.contentOffset.y);
      }}>
      {items.map((label, i) => (
        <Pressable key={label + i} accessibilityRole="button" onPress={() => landed(i * ITEM)} style={{ height: ITEM, alignItems: 'center', justifyContent: 'center' }}>
          <Body size={19} weight={i === index ? 'bold' : 'regular'} style={{ opacity: isPast?.(i) ? 0.25 : i === index ? 1 : 0.55 }}>
            {label}
          </Body>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// Like the alarm picker on an iPhone: spin the day, hour, minute and AM or PM
// to any minute. Times that have already passed can't be picked.
export function TimeWheel({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const { colors } = useTheme();
  const days = useMemo(() => {
    const first = new Date();
    first.setHours(0, 0, 0, 0);
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      return { label, date: d };
    });
  }, []);

  const day0 = days[0].date.getTime();
  const dayIndex = Math.max(0, Math.min(days.length - 1, Math.round((new Date(value).setHours(0, 0, 0, 0) - day0) / 86_400_000)));
  const h24 = value.getHours();
  const hour12 = h24 % 12 || 12;
  const pm = h24 >= 12 ? 1 : 0;
  const minute = value.getMinutes();

  const build = (d: number, h: number, m: number, p: number) => {
    const next = new Date(days[d].date);
    next.setHours((h % 12) + p * 12, m, 0, 0);
    return next;
  };
  const pick = (d: number, h: number, m: number, p: number) => {
    const next = build(d, h, m, p);
    onChange(next.getTime() < soonest().getTime() ? soonest() : next);
  };
  const past = (d: number, h: number, m: number, p: number) => build(d, h, m, p).getTime() < Date.now();

  return (
    <View style={{ height: ITEM * ROWS, flexDirection: 'row', alignItems: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: ITEM * Math.floor(ROWS / 2),
          height: ITEM,
          borderRadius: 10,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      />
      <Column flex={2.2} items={days.map((d) => d.label)} index={dayIndex} onSelect={(i) => pick(i, hour12, minute, pm)} isPast={(i) => past(i, 11, 59, 1)} />
      <Column flex={1} items={Array.from({ length: 12 }, (_, i) => String(i + 1))} index={hour12 - 1} onSelect={(i) => pick(dayIndex, i + 1, minute, pm)} isPast={(i) => past(dayIndex, i + 1, 59, pm)} />
      <Column flex={1} items={Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))} index={minute} onSelect={(i) => pick(dayIndex, hour12, i, pm)} isPast={(i) => past(dayIndex, hour12, i, pm)} />
      <Column flex={1} items={['AM', 'PM']} index={pm} onSelect={(i) => pick(dayIndex, hour12, minute, i)} isPast={(i) => past(dayIndex, hour12, 59, i)} />
    </View>
  );
}
