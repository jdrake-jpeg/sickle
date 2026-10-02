import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar, Body, Button, Card, Display, Field, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { nearbyPlayers } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';

type Player = { id: string; name: string; username: string; skill: number | null };

// Another player's page: team up with them, or block or report them.
export default function PlayerScreen() {
  const { id, distance } = useLocalSearchParams<{ id: string; distance?: string }>();
  const { demoMode, session } = useAuth();
  const [player, setPlayer] = useState<Player | null | undefined>(() => {
    if (!demoMode) return undefined;
    const p = nearbyPlayers.find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, username: p.username, skill: p.skill } : null;
  });
  const [teamName, setTeamName] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demoMode || !supabase) return;
    supabase
      .from('profiles')
      .select('id, username, display_name, skill_level')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) =>
        setPlayer(data ? { id: data.id, name: data.display_name, username: data.username, skill: data.skill_level } : null),
      );
  }, [demoMode, id]);

  if (player === undefined) return <Screen>{null}</Screen>;
  if (!player) {
    return (
      <Screen>
        <Body tone="muted">This player isn&apos;t available.</Body>
      </Screen>
    );
  }

  const firstName = player.name.split(' ')[0];
  const me = session?.user.id;

  // Runs a database call, shows its error if any, and returns whether it worked.
  const run = async (action: () => PromiseLike<{ error: { message: string } | null }>) => {
    if (demoMode || !supabase) return true;
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error) Alert.alert('Something went wrong', error.message);
    return !error;
  };

  const createTeam = async () => {
    const name = teamName.trim();
    const ok = await run(() => supabase!.rpc('create_team', { p_partner: player.id, p_name: name || null }));
    if (!ok) return;
    Alert.alert('Team created', `${name || `You + ${firstName}`} is ready to challenge other teams.`);
    router.back();
  };

  const sendReport = async () => {
    const ok = await run(() =>
      supabase!.from('reports').insert({ reporter_id: me, reported_profile_id: player.id, reason: reason.trim() }),
    );
    if (!ok) return;
    Alert.alert('Report sent', 'Thanks. We review every report.');
    setReporting(false);
    setReason('');
  };

  const block = async () => {
    const ok = await run(() => supabase!.from('blocks').insert({ blocker_id: me, blocked_id: player.id }));
    if (ok) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: `@${player.username}` }} />
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
        <Avatar initials={initialsOf(player.name)} size={88} />
        <Display size={26}>{player.name.toUpperCase()}</Display>
        <Body tone="muted">
          {[`@${player.username}`, player.skill ? `Skill ${player.skill.toFixed(1)}` : null, distance ? `${distance} away` : null]
            .filter(Boolean)
            .join(' · ')}
        </Body>
      </View>

      <Card style={{ padding: 16, gap: 12 }}>
        <Heading>TEAM UP WITH {firstName.toUpperCase()}</Heading>
        <Field label="Team name (optional)" placeholder={`You + ${firstName}`} value={teamName} onChangeText={setTeamName} maxLength={40} />
        <Button label="Create team" disabled={busy} onPress={createTeam} />
      </Card>

      {reporting ? (
        <Card style={{ padding: 16, gap: 12 }}>
          <Field label="What happened?" placeholder="Tell us what's wrong" value={reason} onChangeText={setReason} multiline maxLength={1000} style={{ height: 96, paddingTop: 12 }} />
          <Button label="Send report" variant="danger" disabled={busy || !reason.trim()} onPress={sendReport} />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label="Block"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() =>
            Alert.alert(`Block ${firstName}?`, "You won't see each other in Sickle, and neither of you can challenge the other.", [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Block', style: 'destructive', onPress: block },
            ])
          }
        />
        <Button label="Report" variant="outline" style={{ flex: 1 }} onPress={() => setReporting(true)} />
      </View>
    </Screen>
  );
}
