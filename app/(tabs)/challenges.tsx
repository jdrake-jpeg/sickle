import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { SickleSlice } from '@/components/SickleSlice';
import { HelpFooter } from '@/components/HelpFooter';
import { ShowMore, usePaged } from '@/components/ShowMore';
import { Body, Button, Card, Display, Heading, Screen, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  bestOfOf,
  cancelChallenge,
  ChallengeRow,
  formatWhen,
  matchStatusText,
  refreshChallenges,
  respondToChallenge,
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
  const [tab, setTab] = useState<Tab>('incoming');
  const [busy, setBusy] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<ChallengeRow | null>(null);

  useFocusEffect(
    useCallback(() => {
      refreshChallenges(demoMode);
    }, [demoMode]),
  );

  const all = rows ?? [];
  const teamPlayers = useTeamPlayers(
    demoMode,
    all.flatMap((r) => [{ team_id: r.my_team_id }, { team_id: r.their_team_id }]),
  );
  const who = (id: string) => (teamPlayers[id] ? ` (${teamPlayers[id]})` : '');
  const toConfirm = all.filter((r) => r.match_status === 'awaiting_confirmation' && r.awaiting_me);
  const incoming = all.filter((r) => r.status === 'pending' && !r.i_challenged);
  const sent = all.filter((r) => r.status === 'pending' && r.i_challenged);
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
    if (await act(r.challenge_id, () => respondToChallenge(demoMode, r.challenge_id, true))) setAccepted(r);
  };

  const askCancel = (r: ChallengeRow) =>
    Alert.alert('Call off this challenge?', `${r.their_team_name} will see it was cancelled.`, [
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
          detail={`${accepted.my_team_name} vs ${accepted.their_team_name}\n${accepted.court_name} · ${formatWhen(accepted.proposed_time)}`}
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
          {incoming.length === 0 ? empty('No new challenges. When a team challenges you, it shows up here.') : null}
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
          {sent.length === 0 ? empty('No challenges waiting. Challenge a team from a court leaderboard or a player page.') : null}
          {sent.map((r) => (
            <Card key={r.challenge_id} style={{ padding: 16, gap: 6 }}>
              <Body weight="semibold">
                {r.my_team_name}{who(r.my_team_id)} challenged {r.their_team_name}{who(r.their_team_id)}
              </Body>
              <Body size={13} tone="muted">
                {r.court_name} · {formatWhen(r.proposed_time)} · Waiting for them to answer
              </Body>
              <Button
                label="Cancel challenge"
                variant="ghost"
                size="sm"
                disabled={busy === r.challenge_id}
                style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                onPress={() => askCancel(r)}
              />
            </Card>
          ))}
        </>
      ) : null}

      {tab === 'upcoming' && rows ? (
        <>
          {upcoming.length === 0 ? empty('No games lined up yet. Accepted challenges show up here.') : null}
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
          {played.length === 0 ? empty('No matches yet. Once a score is confirmed, it shows up here and you can rate the other players.') : null}
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

      <HelpFooter />
    </Screen>
  );
}
