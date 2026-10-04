import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { HistoryList } from '@/components/HistoryList';
import { Avatar, Body, Button, Card, Display, Field, ListRow, Screen, SectionHeader, Stat } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { deleteTeam, fetchTeamDetail, fetchTeamHistory, HistoryRow, renameTeam, TeamDetail } from '@/lib/matches';

// One team: record, who is on it, every confirmed match (where, against
// whom, the score). Either player on the team can rename or delete it.
export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { demoMode } = useAuth();
  const [team, setTeam] = useState<TeamDetail | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchTeamDetail(demoMode, id).then((t) => {
      setTeam(t);
      if (t) setName(t.custom_name ?? '');
    });
    fetchTeamHistory(demoMode, id).then(setHistory);
  }, [demoMode, id]);

  useFocusEffect(load);

  if (team === undefined) return <Screen>{null}</Screen>;
  if (!team) {
    return (
      <Screen>
        <Body tone="muted">This team isn&apos;t available.</Body>
      </Screen>
    );
  }

  const played = team.wins + team.losses;

  const save = async () => {
    setBusy(true);
    try {
      await renameTeam(demoMode, team.team_id, name);
      setEditing(false);
      load();
    } catch (e) {
      Alert.alert("Couldn't rename it", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(
      `Delete ${team.team_name}?`,
      'It disappears from your teams and its pending challenges are cancelled. Past matches stay in everyone\'s history. You can make the same team again later.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete team',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteTeam(demoMode, team.team_id);
              router.back();
            } catch (e) {
              Alert.alert("Couldn't delete it", e instanceof Error ? e.message : 'Try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Team' }} />
      <Display size={26}>{(team.is_singles ? `${team.team_name} · SINGLES` : team.team_name).toUpperCase()}</Display>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat value={`${team.wins}–${team.losses}`} label="Record" />
        <Stat value={played ? `${Math.round((team.wins / played) * 100)}%` : '–'} label="Win rate" tone="accent" />
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title={team.is_singles ? 'Player' : 'Players'} />
        {team.members.map((m) => (
          <Link key={m.id} href={{ pathname: '/player/[id]', params: { id: m.id } }} asChild>
            <Pressable accessibilityRole="link">
              <ListRow left={<Avatar initials={initialsOf(m.name)} size={40} />} title={m.name} subtitle={`@${m.username}`} />
            </Pressable>
          </Link>
        ))}
      </View>

      {team.is_member && team.is_singles ? null : team.is_member ? (
        editing ? (
          <Card style={{ padding: 16, gap: 12 }}>
            <Field label="Team name (leave blank to use both names)" value={name} onChangeText={setName} maxLength={40} />
            <Button label={busy ? 'Saving…' : 'Save name'} disabled={busy} onPress={save} />
            <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} />
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Rename" variant="outline" style={{ flex: 1 }} onPress={() => setEditing(true)} />
            <Button label="Delete team" variant="dangerOutline" style={{ flex: 1 }} disabled={busy} onPress={remove} />
          </View>
        )
      ) : (
        <Link href={{ pathname: '/challenge/new', params: { team: team.team_id, teamName: team.team_name } }} asChild>
          <Button label="Challenge this team" variant="dangerOutline" />
        </Link>
      )}

      <View style={{ gap: 8 }}>
        <SectionHeader title="Match history" />
        <HistoryList rows={history} empty="No confirmed matches yet." />
      </View>
    </Screen>
  );
}
