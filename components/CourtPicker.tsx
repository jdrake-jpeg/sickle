import { Link, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Chip } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { waitForCourtPick } from '@/lib/court-pick';
import { Court, courtsNear, useCourts } from '@/lib/courts';
import { formatMiles } from '@/lib/format';
import { getLocationIfAllowed, LatLng } from '@/lib/location';
import { useChallenges } from '@/lib/matches';

// Picking a court without a wall of 200 chips: the 5 closest to you, courts you
// have played at before, and a button to find any other court on the map.
export function CourtPicker({ value, onChange, title = 'Court' }: { value: string | null; onChange: (id: string) => void; title?: string }) {
  const { demoMode } = useAuth();
  const { courts } = useCourts();
  const rows = useChallenges(demoMode);
  const [here, setHere] = useState<LatLng | null>(null);

  useEffect(() => {
    getLocationIfAllowed().then(setHere);
  }, []);

  const all = useMemo(() => courtsNear(here, courts ?? []), [here, courts]);
  const nearby = all.slice(0, here ? 5 : 0);
  const nearbyIds = new Set(nearby.map((c) => c.id));

  // Courts from your games, newest first.
  const before = useMemo(() => {
    const seen = new Set<string>();
    const out: (Court & { miles: number | null })[] = [];
    for (const r of rows ?? []) {
      if (!r.match_id && r.status !== 'completed') continue;
      if (seen.has(r.court_id)) continue;
      seen.add(r.court_id);
      const c = all.find((x) => x.id === r.court_id);
      if (c) out.push(c);
    }
    return out.slice(0, 5);
  }, [rows, all]);

  // The one you picked stays on screen, even if it came from the map.
  const picked = value ? all.find((c) => c.id === value) : undefined;
  const hidden = picked && !nearbyIds.has(picked.id) && !before.some((c) => c.id === picked.id) ? picked : null;

  const label = (c: Court & { miles: number | null }) => (c.miles !== null ? `${c.name} · ${formatMiles(Math.round(c.miles * 10) / 10)}` : c.name);

  const chips = (list: (Court & { miles: number | null })[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {list.map((c) => (
        <Chip key={c.id} label={label(c)} selected={value === c.id} onPress={() => onChange(c.id)} />
      ))}
    </View>
  );

  const openMap = () => {
    waitForCourtPick(onChange);
    router.push({ pathname: '/court/map', params: { pick: '1' } });
  };

  return (
    <View style={{ gap: 8 }}>
      <Body weight="semibold">{title}</Body>
      {hidden ? chips([hidden]) : null}
      {nearby.length ? (
        <View style={{ gap: 6 }}>
          <Body size={12} weight="bold" tone="muted">
            NEAR YOU
          </Body>
          {chips(nearby)}
        </View>
      ) : null}
      {before.length ? (
        <View style={{ gap: 6 }}>
          <Body size={12} weight="bold" tone="muted">
            PLAYED BEFORE
          </Body>
          {chips(before)}
        </View>
      ) : null}
      {!nearby.length && !before.length && !hidden ? (
        <Body size={13} tone="muted">
          Allow your location to see courts near you, or search the map.
        </Body>
      ) : null}
      <Button label="Search on the map" variant="outline" size="sm" style={{ alignSelf: 'flex-start' }} onPress={openMap} />
      <Link href="/court/new" asChild>
        <Button label="Court not listed? Add it" variant="ghost" size="sm" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      </Link>
    </View>
  );
}
