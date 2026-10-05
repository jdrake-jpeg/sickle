import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { SickleSlice } from '@/components/SickleSlice';
import { ShowMore, usePaged } from '@/components/ShowMore';
import { TeamPick } from '@/components/TeamPick';
import { VsLine } from '@/components/VsLine';
import { Body, Button, Card, Display, Heading, Screen, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  bestOfOf,
  cancelChallenge,
  ChallengeRow,
  fetchMyTeams,
  formatWhen,
  matchStatusText,
  refreshChallenges,
  respondToChallenge,
  TeamRow,
  useChallenges,
  useTeamPlayers,
} from '@/lib/matches';
import { formatScores, matchLengthLabel } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

type Tab = 'incoming' | 'sent' | 'upcoming' | 'played';

export default function ChallengesScreen() {
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const rows = useChallenges(demoMode);
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>('incoming');
  const [busy, setBusy] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<ChallengeRow | null>(null);
  const [myTeams, setMyTeams] = useState<TeamRow[]>([]);
  // For doubles: which of your teams plays, picked per challenge.
  const [picks, setPicks] = useState<Record<string, string>>({});

  // Opened from a player's page with a tab to show.
  useEffect(() => {
    if (params.tab === 'incoming' || params.tab === 'sent' || params.tab === 'upcoming' || params.tab === 'played') setTab(params.tab);
  }, [params.tab]);

  useFocusEffect(
    useCallback(() => {
      refreshChallenges(demoMode);
      fetchMyTeams(demoMode).then(setMyTeams);
    }, [demoMode]),
  );

  const all = rows ?? [];
  const teamPlayers = useTeamPlayers(
    demoMode,
    all.flatMap((r) => [{ team_id: r.my_team_id }, { team_id: r.their_team_id }]),
  );
  const toConfirm = all.filter((r) => r.match_status === 'awaiting_confirmation' && r.awaiting_me);
  const incoming = all.filter((r) => r.status === 'pending' && !r.i_challenged);
  // Waiting for an answer, or declined and still in the future.
  const sent = all.filter((r) => r.i_challenged && (r.status === 'pending' || (r.status === 'declined' && new Date(r.proposed_time).getTime() > Date.now())));
  const myDoubles = myTeams.filter((t) => !t.is_singles);
  const isDoubles = (r: ChallengeRow) => myDoubles.some((t) => t.team_id === r.my_team_id);
  const myTeamPlayers = useTeamPlayers(demoMode, myDoubles);
  const upcoming = all.filter((r) => r.status === 'accepted' && !(r.match_status === 'awaiting_confirmation' && r.awaiting_me));
  const played = all.filter((r) => r.status === 'completed' || (r.match_status && r.match_status !== 'awaiting_confirmation'));

  const playedPaged = usePaged(played, 8);

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await action();
      return true;
    } catch (error) {
      Alert.alert("Couldn't do that", error instanceof Error ? error.message : 'Try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const accept = async (r: ChallengeRow) => {
    const team = isDoubles(r) ? (picks[r.challenge_id] ?? r.my_team_id) : null;
    if (await act(r.challenge_id, () => respondToChallenge(demoMode, r.challenge_id, true, team))) {
      const chosen = myTeams.find((t) => t.team_id === team);
      setAccepted(chosen ? { ...r, my_team_id: chosen.team_id, my_team_name: chosen.team_name } : r);
    }
  };

  const askCancel = (r: ChallengeRow) =>
    Alert.alert('Call off this challenge?', `${r.their_team_name} will see it.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Call it off', style: 'destructive', onPress: () => act(r.challenge_id, () => cancelChallenge(demoMode, r.challenge_id)) },
    ]);

  const empty = (text: string) => (
    <Card style={{ padding: 16 }}>
      <Body tone="muted">{text}</Body>
    </Card>
  );

  return (
    <Screen>
      {accepted ? (
        <SickleSlice
          title={'CHALLENGE\nACCEPTED'}
          detail={`${accepted.my_team_name} vs ${accepted.their_team_name}\n${accepted.court_name} · ${formatWhen(accepted.proposed_time)}${isDoubles(accepted) ? '\nYour game chat is under Chats on your Profile.' : ''}`}
          onDone={() => {
            setAccepted(null);
            setTab('upcoming');
          }}
        />
      ) : null}
      <View style={{ height: 44, justifyContent: 'center' }}>
        <Display>CHALLENGES</Display>
      </View>

      {toConfirm.map((r) => (
        <Link key={r.challenge_id} href={{ pathname: '/match/[id]', params: { id: r.challenge_id } }} asChild>
          <Pressable
            accessibilityRole="link"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.accentText, backgroundColor: colors.surface }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Body weight="semibold">Confirm the score vs {r.their_team_name}</Body>
              <Body size={13} tone="muted">
                {formatScores(r.games ?? [])} at {r.court_name}
              </Body>
            </View>
            <Body weight="bold" size={14} tone="accent">
              Review
            </Body>
          </Pressable>
        </Link>
      ))}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'incoming', label: incoming.length ? `New ${incoming.length}` : 'New' },
          { value: 'sent', label: 'Sent' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'played', label: 'Played' },
        ]}
      />

      {rows === null ? <Body tone="muted">Loading…</Body> : null}

      {tab === 'incoming' && rows ? (
        <>
          {incoming.length === 0 ? empty('No new challenges.') : null}
          {incoming.map((r) => (
            <Card key={r.challenge_id} style={{ overflow: 'hidden', borderRadius: 20 }}>
              <View style={{ height: 5, backgroundColor: colors.danger }} />
              <View style={{ padding: 16, gap: 14 }}>
                <Heading size={14} style={{ letterSpacing: 1 }}>
                  YOU&apos;VE BEEN CHALLENGED
                </Heading>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Heading size={18}>{r.their_team_name}</Heading>
                    {teamPlayers[r.their_team_id] ? (
                      <Body size={12} tone="muted">
                        {teamPlayers[r.their_team_id]}
                      </Body>
                    ) : null}
                  </View>
                  <Heading size={18} style={{ color: colors.danger }}>
                    VS
                  </Heading>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Heading size={18} style={{ textAlign: 'right' }}>
                      {r.my_team_name}
                    </Heading>
                    {teamPlayers[r.my_team_id] ? (
                      <Body size={12} tone="muted" style={{ textAlign: 'right' }}>
                        {teamPlayers[r.my_team_id]}
                      </Body>
                    ) : null}
                  </View>
                </View>
                <Body size={14} tone="subtle">
                  {r.court_name} · {formatWhen(r.proposed_time)} · Ranked, {matchLengthLabel(bestOfOf(r)).toLowerCase()}
                </Body>
                {isDoubles(r) && myDoubles.length > 1 ? (
                  <View style={{ gap: 8 }}>
                    <Body size={13} weight="semibold" tone="muted">
                      Which team plays?
                    </Body>
                    {myDoubles.map((t) => (
                      <TeamPick
                        key={t.team_id}
                        name={t.team_name}
                        players={myTeamPlayers[t.team_id]}
                        selected={(picks[r.challenge_id] ?? r.my_team_id) === t.team_id}
                        onPress={() => setPicks((p) => ({ ...p, [r.challenge_id]: t.team_id }))}
                      />
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    label="Accept"
                    style={{ flex: 1 }}
                    disabled={busy === r.challenge_id}
                    onPress={() => accept(r)}
                  />
                  <Button
                    label="Decline"
                    variant="outline"
                    style={{ flex: 1 }}
                    disabled={busy === r.challenge_id}
                    onPress={() => act(r.challenge_id, () => respondToChallenge(demoMode, r.challenge_id, false))}
                  />
                </View>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {tab === 'sent' && rows ? (
        <>
          {sent.length === 0 ? empty('Nothing sent. Challenge someone from their profile.') : null}
          {sent.map((r) => (
            <Card key={r.challenge_id} style={{ padding: 16, gap: 8 }}>
              <VsLine you={r.my_team_name} them={r.their_team_name} />
              <Body size={13} tone="muted">
                {r.court_name} · {formatWhen(r.proposed_time)}
              </Body>
              <Body size={13} weight="bold" tone={r.status === 'declined' ? 'danger' : 'accent'}>
                {r.status === 'declined' ? 'Declined' : 'Waiting for an answer'}
              </Body>
              {r.status === 'pending' ? (
                <Button
                  label="Cancel challenge"
                  variant="ghost"
                  size="sm"
                  disabled={busy === r.challenge_id}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                  onPress={() => askCancel(r)}
                />
              ) : null}
            </Card>
          ))}
        </>
      ) : null}

      {tab === 'upcoming' && rows ? (
        <>
          {upcoming.length === 0 ? empty('No games lined up.') : null}
          {upcoming.map((r) => (
            <Card key={r.challenge_id} style={{ padding: 16, gap: 10 }}>
              <View style={{ gap: 4 }}>
                <Heading size={18}>
                  {r.my_team_name} vs {r.their_team_name}
                </Heading>
                <Body size={13} tone="muted">
                  {r.court_name} · {formatWhen(r.proposed_time)}
                </Body>
              </View>
              {r.match_id ? (
                <Link href={{ pathname: '/match/[id]', params: { id: r.challenge_id } }} asChild>
                  <Pressable accessibilityRole="link">
                    <Body size={14} tone="subtle">
                      {formatScores(r.games ?? [])} · {matchStatusText(r)}
                    </Body>
                  </Pressable>
                </Link>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Link href={{ pathname: '/score/[challengeId]', params: { challengeId: r.challenge_id } }} asChild>
                    <Button label="Enter score" style={{ flex: 1 }} />
                  </Link>
                  <Button label="Call off" variant="outline" disabled={busy === r.challenge_id} onPress={() => askCancel(r)} />
                </View>
              )}
            </Card>
          ))}
        </>
      ) : null}

      {tab === 'played' && rows ? (
        <>
          {played.length === 0 ? empty('No matches yet.') : null}
          {playedPaged.shown.map((r) => (
            <Link key={r.challenge_id} href={{ pathname: '/match/[id]', params: { id: r.challenge_id } }} asChild>
              <Pressable accessibilityRole="link">
                <Card style={{ padding: 16, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Body weight="semibold" style={{ flex: 1 }}>
                      {r.my_team_name} vs {r.their_team_name}
                    </Body>
                    {r.match_status === 'confirmed' ? (
                      <Body weight="bold" tone={r.i_won ? 'accent' : 'danger'}>
                        {r.i_won ? 'WON' : 'LOST'}
                      </Body>
                    ) : null}
                  </View>
                  <Body size={13} tone="muted">
                    {[formatScores(r.games ?? []), r.court_name, matchStatusText(r)].filter(Boolean).join(' · ')}
                  </Body>
                  {r.match_status === 'confirmed' ? (
                    <Body size={13} weight="semibold" tone="accent">
                      Rate how they played
                    </Body>
                  ) : null}
                </Card>
              </Pressable>
            </Link>
          ))}
          <ShowMore hasMore={playedPaged.hasMore} remaining={playedPaged.remaining} onPress={playedPaged.more} />
        </>
      ) : null}

    </Screen>
  );
}
