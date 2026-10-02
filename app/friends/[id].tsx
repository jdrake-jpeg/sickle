import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Body, Button, Card, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { fetchFriendActivity, formatWhen, FriendActivity, matchStatusText, timeAgo } from '@/lib/matches';
import { useTheme } from '@/lib/theme';

function gameLine(a: FriendActivity) {
  if (a.challenge_status === 'pending') return a.from_me ? 'Waiting for them to answer' : 'Waiting for an answer';
  if (a.challenge_status === 'declined') return 'Declined';
  if (a.challenge_status === 'cancelled') return 'Called off';
  if (a.match_status) return matchStatusText({ match_status: a.match_status, awaiting_me: false });
  return 'Accepted · not played yet';
}

// Your inbox with one friend: games between you (as partners or opponents)
// and the private ratings you've sent each other. Only you two see it.
export default function FriendInboxScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const [items, setItems] = useState<FriendActivity[] | null>(null);
  const friend = name || 'your friend';
  const first = friend.split(' ')[0];

  useFocusEffect(
    useCallback(() => {
      fetchFriendActivity(demoMode, id).then(setItems);
    }, [demoMode, id]),
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: friend }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar initials={initialsOf(friend)} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Heading size={20}>{friend.toUpperCase()}</Heading>
          <Body size={13} tone="muted">
            Games and private ratings between you two
          </Body>
        </View>
      </View>
      <Link href={{ pathname: '/player/[id]', params: { id } }} asChild>
        <Button label={`Challenge or team up with ${first}`} variant="outline" />
      </Link>

      {items && items.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">Nothing here yet. Play a match with or against {first}, and your games and ratings land here.</Body>
        </Card>
      ) : null}

      {(items ?? []).map((a, i) => {
        if (a.kind === 'rating') {
          return (
            <View key={i} style={{ alignItems: a.from_me ? 'flex-end' : 'flex-start' }}>
              <View
                style={{
                  maxWidth: '85%',
                  padding: 12,
                  borderRadius: 16,
                  gap: 4,
                  backgroundColor: a.from_me ? colors.accentFill : colors.surfaceRaised,
                }}>
                <Body size={13} weight="semibold" tone={a.from_me ? 'onAccent' : 'muted'}>
                  {a.from_me ? `You rated ${first}` : `${first} rated you`}
                </Body>
                <Heading size={22} tone={a.from_me ? 'onAccent' : 'default'}>
                  {Number(a.skill).toFixed(1)}
                </Heading>
                {a.note ? (
                  <Body size={14} tone={a.from_me ? 'onAccent' : 'default'}>
                    &ldquo;{a.note}&rdquo;
                  </Body>
                ) : null}
                <Body size={12} tone={a.from_me ? 'onAccent' : 'muted'}>
                  Private · {timeAgo(a.at)}
                </Body>
              </View>
            </View>
          );
        }
        const card = (
          <Card style={{ padding: 14, gap: 4 }}>
            <Body size={12} weight="bold" tone="muted" style={{ letterSpacing: 1 }}>
              {a.same_team ? 'PLAYED TOGETHER' : 'CHALLENGE'}
            </Body>
            <Body weight="semibold">
              {a.my_team_name} vs {a.their_team_name}
            </Body>
            <Body size={13} tone="muted">
              {[a.court_name, a.proposed_time ? formatWhen(a.proposed_time) : null, gameLine(a)].filter(Boolean).join(' · ')}
            </Body>
          </Card>
        );
        return a.match_id && a.challenge_id ? (
          <Link key={i} href={{ pathname: '/match/[id]', params: { id: a.challenge_id } }} asChild>
            <Pressable accessibilityRole="link">{card}</Pressable>
          </Link>
        ) : (
          <View key={i}>{card}</View>
        );
      })}
    </Screen>
  );
}
