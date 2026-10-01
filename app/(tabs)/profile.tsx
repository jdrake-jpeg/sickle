import { Link } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Body, Button, Card, Display, ListRow, Screen, SectionHeader, Stat, TeamAvatars } from '@/components/ui';
import { me, myTeams, recentMatches } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

function Tag({ label, strong, dashed }: { label: string; strong?: boolean; dashed?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: 24,
        paddingHorizontal: 8,
        borderRadius: 7,
        justifyContent: 'center',
        backgroundColor: strong ? colors.inverse : 'transparent',
        borderWidth: strong ? 0 : 1,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: colors.borderStrong,
      }}>
      <Body size={12} weight="bold" style={{ color: strong ? colors.onInverse : dashed ? colors.textMuted : colors.text }}>
        {label}
      </Body>
    </View>
  );
}

export default function ProfileScreen() {
  const { colors, name, setPreference } = useTheme();

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <Body weight="semibold" tone="muted">
          @{me.username}
        </Body>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label={name === 'dark' ? 'Light' : 'Dark'}
            variant="outline"
            size="sm"
            onPress={() => setPreference(name === 'dark' ? 'light' : 'dark')}
          />
          <Link href="/settings" asChild>
            <Button label="Settings" variant="outline" size="sm" />
          </Link>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ borderWidth: 3, borderColor: colors.accentText, borderRadius: 44, padding: 2 }}>
          <Avatar initials={me.initials} size={72} />
        </View>
        <View style={{ gap: 6, flex: 1 }}>
          <Display size={28}>{me.name.toUpperCase()}</Display>
          <Body size={13} tone="muted">
            {me.area}
          </Body>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {me.school ? <Tag label={me.school} strong /> : null}
            <Tag label={`${me.skill.toFixed(1)} skill`} />
            <Tag label="DUPR soon" dashed />
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat value={me.record} label="Record" />
        <Stat value={me.winRate} label="Win rate" />
        <Stat value={me.streak} label="Streak" tone="accent" />
        <Stat value={String(me.crowns)} label="Crowns" />
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
        <SectionHeader title="Recent matches" />
        {recentMatches.map((match) => (
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
                  backgroundColor: match.won ? colors.accentFill : colors.danger,
                }}>
                <Body weight="bold" size={13} style={{ color: match.won ? colors.onAccent : colors.onDanger }}>
                  {match.won ? 'W' : 'L'}
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
        ))}
      </View>

      <Card style={{ padding: 14, gap: 2, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'transparent' }}>
        <Body weight="semibold" size={14}>
          AI video stats are coming
        </Body>
        <Body size={12} tone="muted">
          Record a match and get your stats automatically.
        </Body>
      </Card>
    </Screen>
  );
}
