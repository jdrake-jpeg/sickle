import { View } from 'react-native';

import { Body, Button, Card, Display, Heading, Screen, SectionHeader } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { court } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

export default function CourtsScreen() {
  const { colors } = useTheme();

  return (
    <Screen>
      {/* Map placeholder until a maps provider is added (expo-maps). */}
      <View
        accessibilityLabel="Map of nearby courts"
        style={{ height: 180, borderRadius: 20, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
        <Body size={13} tone="muted">
          Court map
        </Body>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 4 }}>
          <Display size={28}>{court.name.toUpperCase()}</Display>
          <Body size={13} tone="muted">
            {court.meta}
          </Body>
        </View>
        <Button label="Follow" variant="outline" size="sm" />
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          [court.lookingToPlay, 'looking to play', true],
          [court.teamsWantGames, 'teams want games', false],
          [court.matchesThisWeek, 'matches this week', false],
        ].map(([value, label, accent]) => (
          <Card key={String(label)} style={{ flex: 1, padding: 10, gap: 2, borderRadius: 14 }}>
            <Body style={{ fontFamily: fonts.numeric, fontSize: 22 }} tone={accent ? 'accent' : 'default'}>
              {String(value)}
            </Body>
            <Body size={12} tone="muted">
              {String(label)}
            </Body>
          </Card>
        ))}
      </View>

      <View style={{ backgroundColor: colors.accentFill, borderRadius: 18, padding: 16, gap: 2 }}>
        <Heading size={12} tone="onAccent" style={{ letterSpacing: 1 }}>
          COURT CHAMPS
        </Heading>
        <Heading size={20} tone="onAccent">
          {court.champs.name}
        </Heading>
        <Body size={13} weight="medium" tone="onAccent">
          Held {court.champs.held} · {court.champs.record}
        </Body>
      </View>

      <View style={{ gap: 6 }}>
        <SectionHeader title="Leaderboard" detail="Doubles teams" />
        {court.leaderboard.map((row) => (
          <Card
            key={row.rank}
            highlighted={row.mine}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 }}>
            <Body style={{ fontFamily: fonts.numeric, width: 20 }} tone={row.mine ? 'accent' : 'default'}>
              {row.rank}
            </Body>
            <Body weight={row.mine ? 'bold' : 'semibold'} style={{ flex: 1 }}>
              {row.name}
            </Body>
            {row.mine ? (
              <Button label="Challenge up" variant="danger" size="sm" />
            ) : (
              <>
                <Body size={13} tone="muted">
                  {row.record}
                </Body>
                <Body size={12} weight="bold" tone={row.streak.startsWith('W') ? 'accent' : 'danger'} style={{ width: 28 }}>
                  {row.streak}
                </Body>
              </>
            )}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
