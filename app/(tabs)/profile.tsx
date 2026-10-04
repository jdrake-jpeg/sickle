import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { tierOf } from '@/components/SkillPicker';
import { Avatar, Body, Button, Card, Display, Heading, InfoDrop, ListRow, Screen, SectionHeader, Stat } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { fetchFriends } from '@/lib/friends';
import { fetchMyTeams, fetchRatingSummary, matchStatusText, RatingSummary, refreshChallenges, TeamRow, useChallenges, useTeamPlayers } from '@/lib/matches';
import { useProfile } from '@/lib/profile';
import { formatScores } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const challenges = useChallenges(demoMode);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [ratings, setRatings] = useState<RatingSummary | null>(null);
  const [friendCount, setFriendCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      fetchMyTeams(demoMode).then(setTeams);
      fetchRatingSummary(demoMode).then(setRatings);
      fetchFriends(demoMode).then((f) => setFriendCount(f.filter((x) => x.relation === 'friend').length));
      refreshChallenges(demoMode);
    }, [demoMode]),
  );

  const teamPlayers = useTeamPlayers(demoMode, teams);
  const name = profile?.display_name ?? '';
  const doubles = teams.filter((t) => !t.is_singles);
  const solo = teams.find((t) => t.is_singles);
  const wins = teams.reduce((n, t) => n + Number(t.wins), 0);
  const losses = teams.reduce((n, t) => n + Number(t.losses), 0);
  const played = wins + losses;
  const history = (challenges ?? []).filter((c) => c.match_id);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <Body weight="semibold" tone="muted">
          @{profile?.username}
        </Body>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Link href="/profile-edit" asChild>
            <Button label="Edit" variant="outline" size="sm" />
          </Link>
          <Link href="/settings" asChild>
            <Button label="Settings" variant="outline" size="sm" />
          </Link>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ borderWidth: 3, borderColor: colors.accentText, borderRadius: 44, padding: 2 }}>
          <Avatar initials={initialsOf(name)} size={72} />
        </View>
        <View style={{ gap: 4, flex: 1 }}>
          <Display size={28}>{name.toUpperCase()}</Display>
          <Body size={13} tone="muted">
            {profile?.skill_level ? `${Number(profile.skill_level).toFixed(1)} · ${tierOf(Number(profile.skill_level))}` : 'No skill level yet. Set it in Settings.'}
          </Body>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat value={`${wins}–${losses}`} label="Record" />
        <Stat value={played ? `${Math.round((wins / played) * 100)}%` : '–'} label="Win rate" />
        <Stat value={String(doubles.length)} label="Teams" tone="accent" />
        <Stat value={String(friendCount)} label="Friends" />
      </View>

      <Link href="/ratings" asChild>
        <Pressable accessibilityRole="link">
          <Card style={{ padding: 16, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Heading size={14} style={{ letterSpacing: 1 }}>
                HOW OTHERS RATE YOU
              </Heading>
              <Body size={12} tone="muted">
                Only you see this
              </Body>
            </View>
            {ratings && ratings.ratings > 0 ? (
              <Body>
                <Heading size={22} tone="accent">
                  {Number(ratings.average).toFixed(1)}
                </Heading>
                <Body tone="muted">
                  {'  '}from {ratings.ratings} {ratings.ratings === 1 ? 'rating' : 'ratings'}
                </Body>
              </Body>
            ) : (
              <Body tone="muted">After ranked matches, players can privately rate your level. It shows up here.</Body>
            )}
          </Card>
        </Pressable>
      </Link>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionHeader title={`My teams (${doubles.length})`} />
          <Link href="/team/new" asChild>
            <Button label="+ New team" size="sm" />
          </Link>
        </View>
        {doubles.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No doubles teams yet. Tap + New team and pick a friend as your partner.</Body>
          </Card>
        ) : null}
        <InfoDrop title="What is a team?">
          A team is you and one friend for doubles. Your wins and losses are counted for the team, and your team name shows on leaderboards. Singles is built in, so you can always challenge someone 1 vs 1.
        </InfoDrop>
        {doubles.map((team) => (
          <Link key={team.team_id} href={{ pathname: '/team/[id]', params: { id: team.team_id } }} asChild>
            <Pressable accessibilityRole="link">
              <ListRow
                left={<Avatar initials={initialsOf(team.partner_name ?? team.team_name)} size={40} />}
                title={team.team_name}
                subtitle={`${teamPlayers[team.team_id] ?? `You and ${team.partner_name}`}\n${team.wins}–${team.losses}`}
                right={
                  <Body size={13} weight="semibold" tone="accent">
                    Edit
                  </Body>
                }
              />
            </Pressable>
          </Link>
        ))}
        {solo ? (
          <Link href={{ pathname: '/team/[id]', params: { id: solo.team_id } }} asChild>
            <Pressable accessibilityRole="link">
              <ListRow
                left={<Avatar initials={initialsOf(name)} size={40} />}
                title="Singles"
                subtitle={`${solo.wins}–${solo.losses} · just you`}
                right={
                  <Body size={13} weight="semibold" tone="accent">
                    History
                  </Body>
                }
              />
            </Pressable>
          </Link>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <SectionHeader title="Match history" />
        {history.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No matches yet. Send a challenge to get started.</Body>
          </Card>
        ) : null}
        {history.map((match) => {
          const done = match.match_status === 'confirmed';
          const won = Boolean(match.i_won);
          return (
            <Link key={match.challenge_id} href={{ pathname: '/match/[id]', params: { id: match.challenge_id } }} asChild>
              <Pressable accessibilityRole="link">
                <ListRow
                  left={
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: !done ? colors.surfaceRaised : won ? colors.accentFill : colors.danger,
                      }}>
                      <Body weight="bold" size={13} style={{ color: !done ? colors.textMuted : won ? colors.onAccent : colors.onDanger }}>
                        {!done ? '?' : won ? 'W' : 'L'}
                      </Body>
                    </View>
                  }
                  title={`vs ${match.their_team_name}`}
                  subtitle={done ? `${match.my_team_name} · ${match.court_name}` : matchStatusText(match)}
                  right={
                    <Body size={13} tone="subtle">
                      {formatScores(match.games ?? [])}
                    </Body>
                  }
                />
              </Pressable>
            </Link>
          );
        })}
      </View>

      <Link href="/rules" asChild>
        <Button label="Pickleball rules" variant="outline" />
      </Link>
    </Screen>
  );
}
