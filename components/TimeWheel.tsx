import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Button, Card } from '@/components/ui';
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

// "Wed, Oct 7 at 7:05 PM"
export const whenText = (d: Date) =>
  `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

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
  // Where the wheel is sitting, so it only moves when the time changed from outside.
  const at = useRef(index * ITEM);

  useEffect(() => {
    if (Math.abs(at.current - index * ITEM) > 1) {
      at.current = index * ITEM;
      ref.current?.scrollTo({ y: index * ITEM, animated: false });
    }
  }, [index]);

  const landed = (y: number) => {
    at.current = y;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM)));
    if (i !== index) onSelect(i);
  };

  return (
    <ScrollView
      ref={ref}
      style={{ flex, height: ITEM * ROWS }}
      contentContainerStyle={{ paddingVertical: ITEM * Math.floor(ROWS / 2) }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM}
      decelerationRate="fast"
      bounces={false}
      overScrollMode="never"
      contentOffset={{ x: 0, y: index * ITEM }}
      onMomentumScrollEnd={(e) => landed(e.nativeEvent.contentOffset.y)}>
      {items.map((label, i) => (
        <Pressable
          key={label + i}
          accessibilityRole="button"
          onPress={() => {
            at.current = i * ITEM;
            ref.current?.scrollTo({ y: i * ITEM, animated: true });
            if (i !== index) onSelect(i);
          }}
          style={{ height: ITEM, alignItems: 'center', justifyContent: 'center' }}>
          <Body size={19} weight={i === index ? 'bold' : 'regular'} style={{ opacity: isPast?.(i) ? 0.25 : i === index ? 1 : 0.55 }}>
            {label}
          </Body>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// Like the alarm picker on an iPhone: spin the day, hour, minute and AM or PM
// to any minute. mode "time" leaves out the day. Times that have already
// passed can't be picked unless allowPast is on.
export function TimeWheel({
  value,
  onChange,
  mode = 'datetime',
  maxDays = 30,
  allowPast = false,
}: {
  value: Date;
  onChange: (d: Date) => void;
  mode?: 'datetime' | 'time';
  maxDays?: number;
  allowPast?: boolean;
}) {
  const { colors } = useTheme();
  const withDay = mode === 'datetime';
  const days = useMemo(() => {
    const first = new Date();
    first.setHours(0, 0, 0, 0);
    return Array.from({ length: maxDays }, (_, i) => {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      return { label, date: d };
    });
  }, [maxDays]);

  const dayIndex = withDay ? Math.max(0, Math.min(days.length - 1, Math.round((new Date(value).setHours(0, 0, 0, 0) - days[0].date.getTime()) / 86_400_000))) : 0;
  const h24 = value.getHours();
  const hour12 = h24 % 12 || 12;
  const pm = h24 >= 12 ? 1 : 0;
  const minute = value.getMinutes();

  const build = (d: number, h: number, m: number, p: number) => {
    const next = withDay ? new Date(days[d].date) : new Date(value);
    next.setHours((h % 12) + p * 12, m, 0, 0);
    return next;
  };
  const pick = (d: number, h: number, m: number, p: number) => {
    const next = build(d, h, m, p);
    onChange(!allowPast && next.getTime() < soonest().getTime() ? soonest() : next);
  };
  const past = (d: number, h: number, m: number, p: number) => !allowPast && build(d, h, m, p).getTime() < Date.now();

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
      {withDay ? (
        <Column flex={2.2} items={days.map((d) => d.label)} index={dayIndex} onSelect={(i) => pick(i, hour12, minute, pm)} isPast={(i) => past(i, 11, 59, 1)} />
      ) : null}
      <Column flex={1} items={Array.from({ length: 12 }, (_, i) => String(i + 1))} index={hour12 - 1} onSelect={(i) => pick(dayIndex, i + 1, minute, pm)} isPast={(i) => past(dayIndex, i + 1, 59, pm)} />
      <Column flex={1} items={Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))} index={minute} onSelect={(i) => pick(dayIndex, hour12, i, pm)} isPast={(i) => past(dayIndex, hour12, i, pm)} />
      <Column flex={1} items={['AM', 'PM']} index={pm} onSelect={(i) => pick(dayIndex, hour12, minute, i)} isPast={(i) => past(dayIndex, hour12, 59, i)} />
    </View>
  );
}

// A row that shows a time. Tap it and a sheet slides up with the wheel and a
// Done button. The wheel lives in the sheet, not on the page, so it can never
// get tangled up with scrolling the page.
export function TimeField({
  title,
  value,
  display,
  onChange,
  mode = 'datetime',
  maxDays,
  allowPast,
  action = 'Change',
  onClear,
}: {
  title: string;
  value: Date;
  display: string;
  onChange: (d: Date) => void;
  mode?: 'datetime' | 'time';
  maxDays?: number;
  allowPast?: boolean;
  action?: string;
  // Adds a Remove button to the sheet, for a time that can be taken away.
  onClear?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const show = () => {
    setDraft(value);
    setOpen(true);
  };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={show}>
        <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Body weight="bold" size={16} style={{ flex: 1 }}>
            {display}
          </Body>
          <Body weight="bold" tone="accent">
            {action}
          </Body>
        </Card>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 16,
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              gap: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}>
            <Body weight="bold" size={17} style={{ textAlign: 'center' }}>
              {title}
            </Body>
            <TimeWheel value={draft} onChange={setDraft} mode={mode} maxDays={maxDays} allowPast={allowPast} />
            {onClear ? (
              <Button
                label="Remove"
                variant="ghost"
                size="sm"
                onPress={() => {
                  onClear();
                  setOpen(false);
                }}
              />
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setOpen(false)} />
              <Button
                label="Done"
                style={{ flex: 1 }}
                onPress={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
