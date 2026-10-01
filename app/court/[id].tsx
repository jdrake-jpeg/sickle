import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Body, Button, Card, Display, Heading, Screen, SectionHeader } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { courts } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

export default function CourtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const court = courts.find((c) => c.id === id);

  if (!court) {
    return (
      <Screen>
        <Body tone="muted">This court isn&apos;t on the list.</Body>
      </Screen>
    );
  }

  const myRank = court.leaderboard.find((row) => row.mine)?.rank;

  return (
    <Screen>
      <Stack.Screen options={{ title: court.name }} />
      <View style={{ gap: 4 }}>
        <Display size={28}>{court.name.toUpperCase()}</Display>
        <Body size={13} tone="muted">
          {court.meta}
        </Body>
      </View>

      <View style={{ backgroundColor: colors.accentFill, borderRadius: 18, padding: 16, gap: 2 }}>
        <Heading size={12} tone="onAccent" style={{ letterSpacing: 1 }}>
          COURT CHAMPS
        </Heading>
        <Heading size={22} tone="onAccent">
          {court.champs.name}
        </Heading>
        <Body size={13} weight="medium" tone="onAccent">
          {court.champs.record} at {court.name}
        </Body>
      </View>

      <View style={{ gap: 6 }}>
        <SectionHeader title="Leaderboard" detail="Doubles teams" />
        {court.leaderboard.map((row) => (
          <Card
            key={row.rank}
            highlighted={row.mine}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, minHeight: 52 }}>
            <Body style={{ fontFamily: fonts.numeric, width: 20 }} tone={row.mine ? 'accent' : 'default'}>
              {row.rank}
            </Body>
            <View style={{ flex: 1 }}>
              <Body weight={row.mine ? 'bold' : 'semibold'}>{row.name}</Body>
              <Body size={12} tone="muted">
                {row.record} · {row.rating}
              </Body>
            </View>
            {myRank && row.rank < myRank ? <Button label="Challenge" variant="dangerOutline" size="sm" /> : null}
          </Card>
        ))}
        <Body size={12} tone="muted">
          Only confirmed matches count. Beating a higher-rated team moves you up more.
        </Body>
      </View>
    </Screen>
  );
}
