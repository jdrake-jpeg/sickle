import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { addNearbyMapCourts, autoAddMiles, Court, findMappedCourts, GoogleCourt, milesBetween, unlistedCourts, widerMiles } from '@/lib/courts';
import { kv } from '@/lib/kv';
import { LatLng } from '@/lib/location';

// Mapped pickleball courts around you. The ones within 5 miles are added to
// Sickle for you (once a day per area, so the free map servers aren't hammered).
// The rest show as pins you can add yourself.

const found = new Map<string, GoogleCourt[]>();
const tried = new Set<string>();
const dayMs = 24 * 60 * 60 * 1000;

function triedRecently(cell: string) {
  try {
    const at = Number(kv.getItemSync(`sickle.autoCourts.${cell}`) ?? 0);
    return Date.now() - at < dayMs;
  } catch {
    return false;
  }
}

function markTried(cell: string) {
  tried.add(cell);
  try {
    kv.setItemSync(`sickle.autoCourts.${cell}`, String(Date.now()));
  } catch {
    // Not saved. It just runs again next time.
  }
}

export function useMappedCourts(here: LatLng | null, courts: Court[] | null, reload: () => void, miles: number) {
  const { demoMode } = useAuth();
  const [spots, setSpots] = useState<GoogleCourt[]>([]);
  const cell = here ? `${here.lat.toFixed(2)},${here.lng.toFixed(2)}` : null;

  useEffect(() => {
    if (demoMode || !here || !cell) {
      setSpots([]);
      return;
    }
    let alive = true;
    (async () => {
      let all = found.get(cell);
      if (!all) {
        all = await findMappedCourts(here, widerMiles);
        if (all.length > 0) found.set(cell, all);
      }
      if (alive) setSpots(all);
    })();
    return () => {
      alive = false;
    };
    // The area (cell) is what matters, not the exact coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, cell]);

  // Add the close ones to Sickle.
  useEffect(() => {
    if (demoMode || !here || !cell || !courts || spots.length === 0 || tried.has(cell) || triedRecently(cell)) return;
    markTried(cell);
    const close = unlistedCourts(
      spots.filter((g) => milesBetween(here, g) <= autoAddMiles),
      courts,
    );
    if (close.length === 0) return;
    addNearbyMapCourts(demoMode, close).then((added) => {
      if (added > 0) reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, cell, courts, spots]);

  const suggestions = here && courts ? unlistedCourts(spots.filter((g) => milesBetween(here, g) <= miles), courts) : [];
  return { suggestions, remove: (placeId: string) => setSpots((list) => list.filter((g) => g.place_id !== placeId)) };
}
