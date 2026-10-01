import { Link } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Body, Button, Display, ListRow, Screen, SectionHeader, Stat, TeamAvatars } from '@/components/ui';
import { me, myTeams, recentMatches } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const played = me.wins + me.losses;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <Body weight="semibold" tone="muted">
          @{me.username}
        </Body>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Edit" variant="outline" size="sm" />
          <Link href="/settings" asChild>
            <Button label="Settings" variant="outline" size="sm" />
          </Link>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ borderWidth: 3, borderColor: colors.accentText, borderRadius: 44, padding: 2 }}>
          <Avatar initials={me.initials} size={72} />
        </View>
        <View style={{ gap: 4, flex: 1 }}>
          <Display size={28}>{me.name.toUpperCase()}</Display>
          <Body size={13} tone="muted">
            Skill {me.skill.toFixed(1)} · Plays at {me.preferredCourts.join(', ')}
          </Body>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat value={`${me.wins}–${me.losses}`} label="Record" />
        <Stat value={played ? `${Math.round((me.wins / played) * 100)}%` : '–'} label="Win rate" />
        <Stat value={String(me.crowns)} label="Crowns" tone="accent" />
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionHeader title="My teams" />
          <Button label="+ New team" size="sm" />
        </View>
        {myTeams.map((team) => (
          <ListRow key={team.id} left={<TeamAvatars initials={team.initials} />} title={team.name} subtitle={`${team.record} · ${team.detail}`} />
        ))}
      </View>

      <View style={{ gap: 6 }}>
        <SectionHeader title="Match history" />
        {recentMatches.map((match) => {
          const won = match.result === 'W';
          const pending = match.result === 'pending';
          return (
            <ListRow
              key={match.id}
              left={
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pending ? colors.surfaceRaised : won ? colors.accentFill : colors.danger,
                  }}>
                  <Body weight="bold" size={13} style={{ color: pending ? colors.textMuted : won ? colors.onAccent : colors.onDanger }}>
                    {pending ? '?' : match.result}
                  </Body>
                </View>
              }
              title={`vs ${match.opponent}`}
              subtitle={match.detail}
              right={
                <Body size={13} tone="subtle">
                  {match.score}
                </Body>
              }
            />
          );
        })}
      </View>
    </Screen>
  );
}
