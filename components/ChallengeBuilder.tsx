import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { TeamPick } from '@/components/TeamPick';
import { Body, Button, Card, Heading, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchMyTeams, fetchPlayerTeams, TeamRow, useTeamPlayers } from '@/lib/matches';
import { BestOf } from '@/lib/scores';

type Kind = 'singles' | 'doubles';

// "Challenge Jake": pick singles or doubles, one game or best of 3, and for
// doubles which of your teams plays. Jake picks his team when he accepts. Then
// it opens the screen where you choose the court and time.
export function ChallengeBuilder({ playerId, firstName, blocked, blockedNote }: { playerId: string; firstName: string; blocked: boolean; blockedNote?: string | null }) {
  const { demoMode } = useAuth();
  const [kind, setKind] = useState<Kind>('singles');
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [mine, setMine] = useState<TeamRow[] | null>(null);
  const [theirs, setTheirs] = useState<TeamRow[] | null>(null);
  const [myPick, setMyPick] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMyTeams(demoMode), fetchPlayerTeams(demoMode, playerId)]).then(([m, t]) => {
      setMine(m);
      // Never one of your own teams (you can't challenge yourself).
      const myIds = new Set(m.map((x) => x.team_id));
      setTheirs(t.filter((x) => !myIds.has(x.team_id)));
    });
  }, [demoMode, playerId]);

  const myDoubles = (mine ?? []).filter((t) => !t.is_singles);
  const theirDoubles = (theirs ?? []).filter((t) => !t.is_singles);
  const theirSingles = (theirs ?? []).find((t) => t.is_singles);
  const players = useTeamPlayers(demoMode, myDoubles);

  useEffect(() => {
    if (myDoubles.length === 1) setMyPick(myDoubles[0].team_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine]);

  const myTeam = myDoubles.find((t) => t.team_id === myPick);
  // The challenge goes to one of their teams. They can switch to another when they accept.
  const theirTeam = theirDoubles[0];

  const go = () => {
    if (kind === 'singles') {
      if (!theirSingles) return;
      router.push({ pathname: '/challenge/new', params: { team: theirSingles.team_id, teamName: firstName, bestOf: String(bestOf) } });
    } else if (myTeam && theirTeam) {
      router.push({ pathname: '/challenge/new', params: { team: theirTeam.team_id, teamName: firstName, myTeam: myTeam.team_id, bestOf: String(bestOf) } });
    }
  };

  const ready = kind === 'singles' ? Boolean(theirSingles) : Boolean(myTeam && theirTeam);

  return (
    <Card style={{ padding: 16, gap: 14 }} highlighted>
      <Heading>CHALLENGE {firstName.toUpperCase()}</Heading>
      {blocked ? (
        <Body tone="muted">{blockedNote ?? `${firstName} isn't taking challenges right now.`}</Body>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Body size={13} weight="semibold" tone="muted">
              What kind of game?
            </Body>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'singles', label: 'Singles 1v1' },
                { value: 'doubles', label: 'Doubles 2v2' },
              ]}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Body size={13} weight="semibold" tone="muted">
              How long?
            </Body>
            <Segmented
              value={String(bestOf) as '1' | '3'}
              onChange={(v) => setBestOf(v === '1' ? 1 : 3)}
              options={[
                { value: '1', label: '1 game to win' },
                { value: '3', label: 'Best of 3' },
              ]}
            />
          </View>

          {kind === 'singles' ? null : mine === null || theirs === null ? null : myDoubles.length === 0 ? (
            <View style={{ gap: 8 }}>
              <Body tone="muted">Doubles needs a team. Make one with a friend first.</Body>
              <Button label="Make a team" variant="outline" onPress={() => router.push('/team/new')} />
            </View>
          ) : theirDoubles.length === 0 ? (
            <Body tone="muted">{firstName} has no doubles team yet. Try singles.</Body>
          ) : (
            <View style={{ gap: 8 }}>
              <Body size={13} weight="semibold" tone="muted">
                {myDoubles.length > 1 ? 'Pick your team' : 'Your team'}
              </Body>
              {myDoubles.map((t) => (
                <TeamPick key={t.team_id} name={t.team_name} players={players[t.team_id]} selected={myPick === t.team_id} onPress={() => setMyPick(t.team_id)} />
              ))}
              <Body size={13} tone="muted">
                {firstName} picks their team when they accept.
              </Body>
            </View>
          )}

          {kind === 'singles' && !theirSingles && theirs !== null ? (
            <Body size={13} tone="muted">
              {firstName} can&apos;t play singles right now.
            </Body>
          ) : null}
          <Button label="Next: pick court and time" size="lg" disabled={!ready} onPress={go} />
        </>
      )}
    </Card>
  );
}
