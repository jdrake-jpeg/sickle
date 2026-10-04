import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ShowMore, usePaged } from '@/components/ShowMore';
import { Avatar, Body, Button, Card, Display, ListRow, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { fetchMyTeams, TeamRow, useTeamPlayers } from '@/lib/matches';

// Your doubles teams. Singles is separate and shows on your profile.
export default function MyTeamsScreen() {
  const { demoMode } = useAuth();
  const [teams, setTeams] = useState<TeamRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchMyTeams(demoMode).then((t) => setTeams(t.filter((x) => !x.is_singles)));
    }, [demoMode]),
  );

  const list = teams ?? [];
  const players = useTeamPlayers(demoMode, list);
  const paged = usePaged(list, 8);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Display size={28}>MY TEAMS</Display>
        <Link href="/team/new" asChild>
          <Button label="+ New team" size="sm" />
        </Link>
      </View>
      {teams === null ? <Body tone="muted">Loading…</Body> : null}
      {teams && list.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">No doubles teams yet. Tap + New team and pick a friend as your partner.</Body>
        </Card>
      ) : null}
      {paged.shown.map((team) => (
        <Link key={team.team_id} href={{ pathname: '/team/[id]', params: { id: team.team_id } }} asChild>
          <Pressable accessibilityRole="link">
            <ListRow
              left={<Avatar initials={initialsOf(team.partner_name ?? team.team_name)} size={40} />}
              title={team.team_name}
              subtitle={`${players[team.team_id] ?? `You and ${team.partner_name}`}\n${team.wins}–${team.losses}`}
              right={
                <Body size={13} weight="semibold" tone="accent">
                  Open
                </Body>
              }
            />
          </Pressable>
        </Link>
      ))}
      <ShowMore hasMore={paged.hasMore} remaining={paged.remaining} onPress={paged.more} />
    </Screen>
  );
}
