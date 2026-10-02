import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Body, Button, Card, Chip, Field, Heading } from '@/components/ui';
import { fetchMatchPeople, MatchPerson, ratePlayer } from '@/lib/matches';

const levels = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5];

// After a confirmed match: say what level each other player really played at.
// It only goes to that player. Nobody else sees it.
export function RatePlayers({ demoMode, matchId }: { demoMode: boolean; matchId: string }) {
  const [people, setPeople] = useState<MatchPerson[] | null>(null);

  useEffect(() => {
    fetchMatchPeople(demoMode, matchId).then(setPeople);
  }, [demoMode, matchId]);

  if (!people || people.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Heading>RATE HOW THEY PLAYED</Heading>
        <Body size={13} tone="muted">
          Private. Only that player sees it. It helps people know their real level. You have 14 days.
        </Body>
      </View>
      {people.map((p) => (
        <RateOne key={p.profile_id} demoMode={demoMode} matchId={matchId} person={p} />
      ))}
    </View>
  );
}

function RateOne({ demoMode, matchId, person }: { demoMode: boolean; matchId: string; person: MatchPerson }) {
  const [skill, setSkill] = useState<number | null>(person.my_rating === null ? null : Number(person.my_rating));
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(person.my_rating !== null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (skill === null) return;
    setBusy(true);
    try {
      await ratePlayer(demoMode, matchId, person.profile_id, skill, note);
      setSaved(true);
    } catch (e) {
      Alert.alert("Couldn't save that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Body weight="semibold">{person.display_name}</Body>
        <Body size={13} tone="muted">
          {person.teammate ? 'Your partner' : 'Opponent'}
        </Body>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {levels.map((l) => (
          <Chip
            key={l}
            label={l.toFixed(1)}
            selected={skill === l}
            onPress={() => {
              setSkill(l);
              setSaved(false);
            }}
          />
        ))}
      </View>
      {!saved ? (
        <>
          <Field label="A tip for them (optional)" placeholder="Great dinks, work on your serve" value={note} onChangeText={setNote} maxLength={300} />
          <Button label={busy ? 'Saving…' : 'Send privately'} size="sm" disabled={busy || skill === null} onPress={save} />
        </>
      ) : (
        <Body size={13} weight="semibold" tone="accent">
          Sent. Only {person.display_name.split(' ')[0]} sees it.
        </Body>
      )}
    </Card>
  );
}
