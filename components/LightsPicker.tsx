import { View } from 'react-native';

import { Body, Chip } from '@/components/ui';
import { supabase } from '@/lib/supabase';

// has: true (lights), false (no lights), null (not sure).
// until: the hour they go off, 24 = midnight, null = not sure.
export type LightsValue = { has: boolean | null; until: number | null };

const offTimes = [20, 21, 22, 23, 24];

export function hourLabel(hour: number) {
  if (hour === 24 || hour === 0) return 'midnight';
  if (hour === 12) return 'noon';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

export function lightsText(has: boolean | null | undefined, until: number | null | undefined) {
  if (has === false) return 'No lights. Play before dark.';
  if (has) return until != null ? `Lights on until ${hourLabel(until)}` : 'Has lights';
  return null;
}

export function LightsPicker({ value, onChange }: { value: LightsValue; onChange: (next: LightsValue) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Body size={13} weight="semibold" tone="muted">
        Lights for night games?
      </Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="Yes" selected={value.has === true} onPress={() => onChange({ has: true, until: value.until })} />
        <Chip label="No lights" selected={value.has === false} onPress={() => onChange({ has: false, until: null })} />
        <Chip label="Not sure" selected={value.has === null} onPress={() => onChange({ has: null, until: null })} />
      </View>
      {value.has ? (
        <>
          <Body size={13} weight="semibold" tone="muted">
            When do they go off?
          </Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {offTimes.map((h) => (
              <Chip key={h} label={hourLabel(h)} selected={value.until === h} onPress={() => onChange({ has: true, until: value.until === h ? null : h })} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export async function saveLights(demoMode: boolean, courtId: string, value: LightsValue) {
  if (demoMode || !supabase || value.has === null) return;
  const { error } = await supabase.rpc('set_court_lights', { p_court: courtId, p_has_lights: value.has, p_until: value.until });
  if (error) throw new Error(error.message);
}
