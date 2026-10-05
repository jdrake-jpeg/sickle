import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, Card, Field, Heading, ListRow, Screen, SectionHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { courtMeta, fetchPendingCourts, findGoogleCourts, GoogleCourt, openDirections, PendingCourt, useCourts } from '@/lib/courts';
import { getLocationIfAllowed } from '@/lib/location';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Admins check each submitted court is real, then approve or reject it.
export default function ReviewCourtsScreen() {
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const [pending, setPending] = useState<PendingCourt[] | null>(null);
  const { courts, reload } = useCourts();
  const [google, setGoogle] = useState<GoogleCourt[] | null>(null);

  const load = useCallback(() => {
    fetchPendingCourts(demoMode).then(setPending);
  }, [demoMode]);

  useEffect(load, [load]);

  // Courts Google knows about near you that aren't on Sickle yet.
  useEffect(() => {
    if (demoMode || !courts || google) return;
    getLocationIfAllowed()
      .then((spot) => (spot ? findGoogleCourts(spot, courts) : []))
      .then(setGoogle);
  }, [demoMode, courts, google]);

  const addFromGoogle = async (g: GoogleCourt) => {
    if (!supabase) return;
    const { error } = await supabase.rpc('submit_court', {
      p_name: g.name,
      p_lat: g.lat,
      p_lng: g.lng,
      p_address: g.address,
      p_google_place_id: g.place_id,
    });
    if (error) {
      Alert.alert("Couldn't add it", error.message);
      return;
    }
    setGoogle((list) => (list ?? []).filter((x) => x.place_id !== g.place_id));
    reload();
  };

  if (!profile?.is_admin) {
    return (
      <Screen>
        <Body tone="muted">Only admins can review courts.</Body>
      </Screen>
    );
  }

  const done = (id: string) => setPending((list) => (list ?? []).filter((c) => c.id !== id));

  return (
    <Screen>
      <Body tone="muted">
        Check each spot on the map before approving it. Approved courts show for everyone and can host ranked matches. Courts you add
        from the map list go straight on the map.
      </Body>
      {pending && pending.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">Nothing to review. You&apos;re all caught up.</Body>
        </Card>
      ) : null}
      {(pending ?? []).map((court) => (
        <PendingCourtCard key={court.id} court={court} demoMode={demoMode} onDone={() => done(court.id)} />
      ))}

      {!demoMode ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Found on the map" detail="Not on Sickle yet" />
          {google === null ? <Body tone="muted">Looking…</Body> : null}
          {google && google.length === 0 ? (
            <Card style={{ padding: 16 }}>
              <Body tone="muted">
                No mapped pickleball courts nearby that aren&apos;t on Sickle already. You can still add one by hand from the Courts
                tab.
              </Body>
            </Card>
          ) : null}
          {(google ?? []).map((g) => (
            <ListRow
              key={g.place_id}
              title={g.name}
              subtitle={g.address ?? undefined}
              right={
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Button label="Check" variant="ghost" size="sm" onPress={() => openDirections(g)} />
                  <Button label="Add" size="sm" onPress={() => addFromGoogle(g)} />
                </View>
              }
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function PendingCourtCard({ court, demoMode, onDone }: { court: PendingCourt; demoMode: boolean; onDone: () => void }) {
  const [name, setName] = useState(court.name);
  const [busy, setBusy] = useState(false);

  const review = async (approve: boolean, note?: string) => {
    if (demoMode || !supabase) {
      onDone();
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('review_court', {
      p_court: court.id,
      p_approve: approve,
      p_note: note ?? null,
      p_name: name.trim() !== court.name ? name.trim() : null,
    });
    setBusy(false);
    if (error) Alert.alert('Something went wrong', error.message);
    else onDone();
  };

  const reject = () => {
    const reasons = ['Not a real court', 'Already listed', 'Private or closed'];
    Alert.alert(`Reject ${court.name}?`, 'It stays hidden from everyone.', [
      ...reasons.map((reason) => ({ text: reason, onPress: () => review(false, reason) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <Card style={{ padding: 16, gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Heading size={18}>{court.name.toUpperCase()}</Heading>
        <Body size={13} tone="muted">
          {[courtMeta(court), court.address, court.submitter ? `from @${court.submitter}` : null].filter(Boolean).join(' · ')}
        </Body>
      </View>
      {court.submission_note ? <Body size={14}>&ldquo;{court.submission_note}&rdquo;</Body> : null}
      <CourtMap height={150} interactive={false} center={court} pin={court} />
      <Button label="Open in Maps to check" variant="outline" size="sm" onPress={() => openDirections(court)} />
      <Field label="Name (fix it if needed)" value={name} onChangeText={setName} maxLength={60} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Reject" variant="dangerOutline" style={{ flex: 1 }} disabled={busy} onPress={reject} />
        <Button label="Approve" style={{ flex: 1 }} disabled={busy || name.trim().length < 2} onPress={() => review(true)} />
      </View>
    </Card>
  );
}
