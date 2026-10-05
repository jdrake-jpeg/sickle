import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { tierOf } from '@/components/SkillPicker';
import { RecordFilters } from '@/components/RecordFilters';
import { ShowMore, usePaged } from '@/components/ShowMore';
import { Avatar, Body, Button, Card, Display, Heading, ListRow, Screen, SectionHeader, Stat } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { fetchUnreadCount } from '@/lib/chat';
import { fetchFriends } from '@/lib/friends';
import { fetchMyTeams, fetchRatingSummary, matchStatusText, RatingSummary, refreshChallenges, TeamRow, useChallenges } from '@/lib/matches';
import { applyRecordFilter, noRecordFilter, RecordFilter, recordFilterCount } from '@/lib/record';
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
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);
  const [filter, setFilter] = useState<RecordFilter>(noRecordFilter);

  useFocusEffect(
    useCallback(() => {
      fetchMyTeams(demoMode).then(setTeams);
      fetchRatingSummary(demoMode).then(setRatings);
      fetchFriends(demoMode).then((f) => {
        setFriendCount(f.filter((x) => x.relation === 'friend').length);
        setRequests(f.filter((x) => x.relation === 'incoming').length);
      });
      fetchUnreadCount(demoMode).then(setUnread);
      refreshChallenges(demoMode);
    }, [demoMode]),
  );

  const name = profile?.display_name ?? '';
  const doubles = teams.filter((t) => !t.is_singles);
  const singlesIds = new Set(teams.filter((t) => t.is_singles).map((t) => t.team_id));
  const history = (challenges ?? []).filter((c) => c.match_id);
  // One record for everything. The filters change the record and the history together.
  const filtered = applyRecordFilter(
    history.map((c) => ({ c, singles: singlesIds.has(c.my_team_id), opponent: c.their_team_id })),
    filter,
  ).map((x) => x.c);
  const confirmed = filtered.filter((c) => c.match_status === 'confirmed');
  const wins = confirmed.filter((c) => c.i_won).length;
  const losses = confirmed.length - wins;
  const opponents = new Set(confirmed.map((c) => c.their_team_id)).size;
  const paged = usePaged(filtered, 5);

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
            {profile?.skill_level ? `${Number(profile.skill_level).toFixed(1)} · ${tierOf(Number(profile.skill_level))}` : 'No rating yet. Set it in Settings.'}
          </Body>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat value={`${wins}–${losses}`} label="Record" />
          <Stat value={confirmed.length ? `${Math.round((wins / confirmed.length) * 100)}%` : '–'} label="Win rate" />
          <Stat value={String(opponents)} label="Opponents" />
        </View>
        <RecordFilters filter={filter} onChange={setFilter} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Link href="/my-teams" asChild>
          <Pressable accessibilityRole="link" style={{ flex: 1 }}>
            <Card style={{ padding: 12, gap: 2 }}>
              <Heading size={22} tone="accent">
                {doubles.length}
              </Heading>
              <Body size={13} weight="semibold">
                Teams
              </Body>
            </Card>
          </Pressable>
        </Link>
        <Link href="/my-friends" asChild>
          <Pressable accessibilityRole="link" style={{ flex: 1 }}>
            <Card style={{ padding: 12, gap: 2 }} highlighted={requests > 0}>
              <Heading size={22}>{friendCount}</Heading>
              <Body size={13} weight="semibold">
                Friends
              </Body>
              {requests > 0 ? (
                <Body size={12} tone="danger">
                  {requests} {requests === 1 ? 'request' : 'requests'}
                </Body>
              ) : null}
            </Card>
          </Pressable>
        </Link>
        <Link href="/chats" asChild>
          <Pressable accessibilityRole="link" style={{ flex: 1 }}>
            <Card style={{ padding: 12, gap: 2 }} highlighted={unread > 0}>
              <Heading size={22} tone={unread > 0 ? 'danger' : 'default'}>
                {unread}
              </Heading>
              <Body size={13} weight="semibold">
                Chats
              </Body>
              {unread > 0 ? (
                <Body size={12} tone="danger">
                  new
                </Body>
              ) : null}
            </Card>
          </Pressable>
        </Link>
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
              <Body tone="muted">Players can privately rate your level after ranked matches.</Body>
            )}
          </Card>
        </Pressable>
      </Link>

      <View style={{ gap: 6 }}>
        <SectionHeader title="Match history" detail={recordFilterCount(filter) > 0 ? `${filtered.length} of ${history.length}` : undefined} />
        {history.length > 0 && filtered.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No matches fit these filters.</Body>
          </Card>
        ) : null}
        {history.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No matches yet. Send a challenge to start.</Body>
          </Card>
        ) : null}
        {paged.shown.map((match) => {
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
        <ShowMore hasMore={paged.hasMore} remaining={paged.remaining} onPress={paged.more} />
      </View>

      <Link href="/rules" asChild>
        <Button label="Pickleball rules" variant="outline" />
      </Link>

    </Screen>
  );
}
