import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, Card, Field, SectionHeader, Segmented } from '@/components/ui';
import { adminRemoveCourt, adminSetCourtNote, adminUpdateCourt, Court } from '@/lib/courts';
import { LatLng } from '@/lib/location';

type Setting = 'outdoor' | 'indoor';

// The edit, remove and note functions come from database updates 20261006 and
// 20261009. Until they're run in Supabase, say so instead of showing a raw
// database error.
function problem(e: unknown) {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === 'PGRST202' || /could not find the function/i.test(err?.message ?? '')) {
    return "A database update for editing courts isn't in Supabase yet. Run the newest files from supabase/migrations in the SQL Editor (oldest first), then try again.";
  }
  return err?.message || 'Try again.';
}

// Shown on a court's page in admin mode: fix its details or take it off Sickle.
export function CourtAdminPanel({ court, demoMode, onSaved }: { court: Court; demoMode: boolean; onSaved: (court: Court) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(court.name);
  const [address, setAddress] = useState(court.address ?? '');
  const [count, setCount] = useState(court.court_count ? String(court.court_count) : '');
  const [setting, setSetting] = useState<Setting>(court.indoor ? 'indoor' : 'outdoor');
  const [pin, setPin] = useState<LatLng>({ lat: court.lat, lng: court.lng });
  const [adminNote, setAdminNote] = useState(court.admin_note ?? '');
  const [busy, setBusy] = useState(false);

  const startEditing = () => {
    setName(court.name);
    setAddress(court.address ?? '');
    setAdminNote(court.admin_note ?? '');
    setCount(court.court_count ? String(court.court_count) : '');
    setSetting(court.indoor ? 'indoor' : 'outdoor');
    setPin({ lat: court.lat, lng: court.lng });
    setEditing(true);
  };

  const save = async () => {
    const courtCount = count.trim() ? Number(count) : undefined;
    if (courtCount !== undefined && (!Number.isInteger(courtCount) || courtCount < 1)) {
      Alert.alert('Number of courts', 'Use a whole number, like 4.');
      return;
    }
    setBusy(true);
    try {
      await adminUpdateCourt(demoMode, court.id, {
        name: name.trim(),
        address: address.trim(),
        court_count: courtCount,
        indoor: setting === 'indoor',
        lat: pin.lat,
        lng: pin.lng,
      });
      // Only touch the note when it changed, so editing other details works
      // even before the notes update is in the database.
      const noteChanged = adminNote.trim() !== (court.admin_note ?? '');
      if (noteChanged) await adminSetCourtNote(demoMode, court.id, adminNote);
      onSaved({
        ...court,
        name: name.trim(),
        address: address.trim() || null,
        court_count: courtCount ?? court.court_count,
        indoor: setting === 'indoor',
        lat: pin.lat,
        lng: pin.lng,
        admin_note: adminNote.trim() || null,
      });
      setEditing(false);
    } catch (e) {
      Alert.alert("Couldn't save that", problem(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert(`Remove ${court.name}?`, 'It comes off the map and the court list for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const result = await adminRemoveCourt(demoMode, court.id);
            Alert.alert(
              'Removed',
              result === 'hidden'
                ? "Games were played or challenged here, so it's hidden instead of deleted. Old match history still shows."
                : "It's gone.",
            );
            router.back();
          } catch (e) {
            Alert.alert("Couldn't remove it", problem(e));
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Card style={{ padding: 16, gap: 10 }}>
      <SectionHeader title="Admin" detail="Only admins see this" />
      {editing ? (
        <>
          <Field label="Name" value={name} onChangeText={setName} maxLength={60} />
          <Field label="Address (optional)" value={address} onChangeText={setAddress} maxLength={120} />
          <Field label="Number of courts" placeholder="4" keyboardType="number-pad" value={count} onChangeText={setCount} maxLength={2} />
          <Field
            label="Permanent note (everyone sees it)"
            placeholder="Park on the north side. Courts close at 10."
            value={adminNote}
            onChangeText={setAdminNote}
            maxLength={300}
            multiline
            style={{ height: 88, paddingTop: 12, textAlignVertical: 'top' }}
          />
          <Segmented<Setting>
            value={setting}
            onChange={setSetting}
            options={[
              { value: 'outdoor', label: 'Outdoor' },
              { value: 'indoor', label: 'Indoor' },
            ]}
          />
          <Body size={13} tone="muted">
            Wrong spot? Tap the map or drag the pin.
          </Body>
          <CourtMap height={180} center={pin} pin={pin} onPinChange={setPin} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Cancel" variant="ghost" style={{ flex: 1 }} disabled={busy} onPress={() => setEditing(false)} />
            <Button label={busy ? 'Saving…' : 'Save'} style={{ flex: 1 }} disabled={busy || name.trim().length < 2} onPress={save} />
          </View>
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Edit court" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={startEditing} />
          <Button label="Remove" variant="dangerOutline" style={{ flex: 1 }} disabled={busy} onPress={remove} />
        </View>
      )}
    </Card>
  );
}
