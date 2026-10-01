import { useState } from 'react';
import { View } from 'react-native';

import { Body, Card, Chip, Display, Heading, Screen, SectionHeader } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { courtCrowns, rankings } from '@/lib/sample-data';

const scopes = ['Rexburg', 'Porter Park', 'BYU-Idaho'];

export default function RankingsScreen() {
  const [scope, setScope] = useState(scopes[0]);

  return (
    <Screen>
      <View style={{ height: 44, justifyContent: 'center' }}>
        <Display>RANKINGS</Display>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {scopes.map((s) => (
          <Chip key={s} label={s} selected={s === scope} onPress={() => setScope(s)} />
        ))}
      </View>

      <View style={{ gap: 6 }}>
        {rankings.map((row) => (
          <Card
            key={row.rank}
            highlighted={row.mine}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 }}>
            <Body style={{ fontFamily: fonts.numeric, width: 22, fontSize: row.rank === 1 ? 20 : 16 }} tone={row.mine || row.rank === 1 ? 'accent' : 'default'}>
              {row.rank}
            </Body>
            <View style={{ flex: 1 }}>
              <Body weight={row.mine ? 'bold' : 'semibold'}>{row.name}</Body>
              <Body size={12} tone={row.mine ? 'accent' : 'muted'}>
                {row.home}
              </Body>
            </View>
            <Body size={13} tone="muted">
              {row.record}
            </Body>
          </Card>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title="Court crowns" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {courtCrowns.map((crown) => (
            <Card key={crown.court} style={{ flex: 1, padding: 12, gap: 4, borderRadius: 14 }}>
              <Body size={12} tone="muted">
                {crown.court}
              </Body>
              <Heading size={15}>{crown.team}</Heading>
              <Body size={12} tone="accent">
                {crown.held}
              </Body>
            </Card>
          ))}
        </View>
      </View>
    </Screen>
  );
}
