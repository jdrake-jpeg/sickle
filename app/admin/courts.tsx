import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, Card, Field, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { courtMeta, fetchPendingCourts, openDirections, PendingCourt } from '@/lib/courts';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Admins check each submitted court is real, then approve or reject it.
export default function ReviewCourtsScreen() {
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const [pending, setPending] = useState<PendingCourt[] | null>(null);

  const load = useCallback(() => {
    fetchPendingCourts(demoMode).then(setPending);
  }, [demoMode]);

  useEffect(load, [load]);

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
        Check each spot on the map before approving it. Approved courts show for everyone and can host ranked matches.
      </Body>
      {pending && pending.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">Nothing to review. You&apos;re all caught up.</Body>
        </Card>
      ) : null}
      {(pending ?? []).map((court) => (
        <PendingCourtCard key={court.id} court={court} demoMode={demoMode} onDone={() => done(court.id)} />
      ))}
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
