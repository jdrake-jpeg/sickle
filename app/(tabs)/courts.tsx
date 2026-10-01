import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Body, Card, Display, Heading, Screen } from '@/components/ui';
import { courts } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

export default function CourtsScreen() {
  const { colors } = useTheme();

  return (
    <Screen>
      <View style={{ height: 44, justifyContent: 'center' }}>
        <Display>COURTS</Display>
      </View>
      <Body tone="muted">Rexburg courts. Win at a court to climb its leaderboard and take the crown.</Body>

      {courts.map((court) => {
        const mine = court.leaderboard.find((row) => row.mine);
        return (
          <Link key={court.id} href={`/court/${court.id}`} asChild>
            <Pressable accessibilityRole="link">
              <Card style={{ padding: 16, gap: 12, borderRadius: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ gap: 2 }}>
                    <Heading size={20}>{court.name.toUpperCase()}</Heading>
                    <Body size={13} tone="muted">
                      {court.meta} · {court.leaderboard.length} teams ranked
                    </Body>
                  </View>
                  {mine ? (
                    <Body size={13} weight="bold" tone="accent">
                      You&apos;re #{mine.rank}
                    </Body>
                  ) : null}
                </View>
                <View style={{ backgroundColor: colors.accentFill, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 1 }}>
                  <Heading size={11} tone="onAccent" style={{ letterSpacing: 1 }}>
                    COURT CHAMPS
                  </Heading>
                  <Body weight="bold" tone="onAccent">
                    {court.champs.name} · {court.champs.record}
                  </Body>
                </View>
              </Card>
            </Pressable>
          </Link>
        );
      })}
    </Screen>
  );
}
