import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Body, Button, Card, Display, Heading, ListRow, Screen, SectionHeader, Stat } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { fetchMyTeams, fetchRatingSummary, matchStatusText, RatingSummary, refreshChallenges, TeamRow, useChallenges } from '@/lib/matches';
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

  useFocusEffect(
    useCallback(() => {
      fetchMyTeams(demoMode).then(setTeams);
      fetchRatingSummary(demoMode).then(setRatings);
      refreshChallenges(demoMode);
    }, [demoMode]),
  );

  const name = profile?.display_name ?? '';
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
          <Link href="/friends" asChild>
            <Button label="Friends" variant="outline" size="sm" />
          </Link>
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
            {profile?.skill_level ? `Skill ${Number(profile.skill_level).toFixed(1)}` : 'No skill level yet. Tap Edit to add one.'}
          </Body>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat value={`${wins}–${losses}`} label="Record" />
        <Stat value={played ? `${Math.round((wins / played) * 100)}%` : '–'} label="Win rate" />
        <Stat value={String(teams.length)} label="Teams" tone="accent" />
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
          <SectionHeader title="My teams" />
          <Link href="/friends" asChild>
            <Button label="+ New team" size="sm" />
          </Link>
        </View>
        {teams.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No teams yet. Open a friend&apos;s page and tap Create team.</Body>
          </Card>
        ) : null}
        {teams.map((team) => (
          <ListRow
            key={team.team_id}
            left={<Avatar initials={initialsOf(team.partner_name ?? team.team_name)} size={40} />}
            title={team.team_name}
            subtitle={`${team.wins}–${team.losses} · with ${team.partner_name}`}
          />
        ))}
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
