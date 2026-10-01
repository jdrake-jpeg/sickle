import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Body, Button, Card, Display, Heading, ListRow, Screen, Segmented, TeamAvatars } from '@/components/ui';
import { radius } from '@/constants/theme';
import { incomingChallenge, pendingResult } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

type Tab = 'incoming' | 'sent' | 'accepted' | 'done';

export default function ChallengesScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('incoming');
  const c = incomingChallenge;
  const scoreLine = pendingResult.games.map(([a, b]) => `${a}–${b}`).join(' · ');

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <Display>CHALLENGES</Display>
        <Button label="+ New" size="sm" />
      </View>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'incoming', label: 'Incoming 2' },
          { value: 'sent', label: 'Sent' },
          { value: 'accepted', label: 'Accepted' },
          { value: 'done', label: 'Done' },
        ]}
      />

      <Card style={{ overflow: 'hidden', borderRadius: 20 }}>
        <View style={{ height: 5, backgroundColor: colors.danger }} />
        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Heading size={14} style={{ letterSpacing: 1 }}>
              YOU&apos;VE BEEN CHALLENGED
            </Heading>
            <Body size={12} tone="muted">
              Expires in {c.expires}
            </Body>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ gap: 2, flex: 1 }}>
              <Heading size={19}>{c.from.name}</Heading>
              <Body size={13} tone="muted">
                {c.from.detail}
              </Body>
            </View>
            <Heading size={18} style={{ color: colors.danger }}>
              VS
            </Heading>
            <View style={{ gap: 2, flex: 1, alignItems: 'flex-end' }}>
              <Heading size={19}>{c.to.name}</Heading>
              <Body size={13} tone="muted">
                {c.to.detail}
              </Body>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              ['Court', c.court],
              ['When', c.when],
              ['Type', c.ranked ? 'Ranked' : 'Casual'],
              ['Format', 'Best of 3'],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '48%', flexGrow: 1, backgroundColor: colors.background, borderRadius: 12, padding: 10, gap: 2 }}>
                <Body size={12} tone="muted">
                  {label}
                </Body>
                <Body size={14} weight="semibold">
                  {value}
                </Body>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Accept" style={{ flex: 1 }} />
            <Button label="Counter" variant="outline" style={{ flex: 1 }} />
            <Button label="Decline" variant="ghost" />
          </View>
        </View>
      </Card>

      <ListRow
        left={<TeamAvatars initials={['EH', 'NP']} />}
        title="Eli + Nate challenged You + Tyler"
        subtitle="Smith Park · Sat 10:00 AM · Ranked"
      />

      <Heading>NEEDS YOUR CONFIRMATION</Heading>
      <Link href={`/match/${pendingResult.id}`} asChild>
        <Pressable
          accessibilityRole="link"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.accentText,
            backgroundColor: colors.surface,
          }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="semibold">{pendingResult.teamA} sent a score</Body>
            <Body size={13} tone="muted">
              {scoreLine} at {pendingResult.court}
            </Body>
          </View>
          <View style={{ borderRadius: radius.sm, paddingHorizontal: 4 }}>
            <Body weight="bold" size={14} tone="accent">
              Review
            </Body>
          </View>
        </Pressable>
      </Link>
    </Screen>
  );
}
