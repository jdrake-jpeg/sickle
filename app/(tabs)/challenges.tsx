import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Body, Button, Card, Display, Heading, Screen, Segmented } from '@/components/ui';
import { challenges, pendingResult } from '@/lib/sample-data';
import { formatScores } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

type Tab = 'incoming' | 'sent' | 'accepted';

export default function ChallengesScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('incoming');

  return (
    <Screen>
      <View style={{ height: 44, justifyContent: 'center' }}>
        <Display>CHALLENGES</Display>
      </View>

      <Link href={`/match/${pendingResult.id}`} asChild>
        <Pressable
          accessibilityRole="link"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.accentText, backgroundColor: colors.surface }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="semibold">Confirm the score: {pendingResult.teamA}</Body>
            <Body size={13} tone="muted">
              {formatScores(pendingResult.games)} at {pendingResult.court}
            </Body>
          </View>
          <Body weight="bold" size={14} tone="accent">
            Review
          </Body>
        </Pressable>
      </Link>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'incoming', label: `Incoming ${challenges.incoming.length}` },
          { value: 'sent', label: 'Sent' },
          { value: 'accepted', label: 'Accepted' },
        ]}
      />

      {tab === 'incoming'
        ? challenges.incoming.map((c) => (
            <Card key={c.id} style={{ overflow: 'hidden', borderRadius: 20 }}>
              <View style={{ height: 5, backgroundColor: colors.danger }} />
              <View style={{ padding: 16, gap: 14 }}>
                <Heading size={14} style={{ letterSpacing: 1 }}>
                  YOU&apos;VE BEEN CHALLENGED
                </Heading>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ gap: 2, flex: 1 }}>
                    <Heading size={18}>{c.from}</Heading>
                    <Body size={13} tone="muted">
                      {c.fromDetail}
                    </Body>
                  </View>
                  <Heading size={18} style={{ color: colors.danger }}>
                    VS
                  </Heading>
                  <View style={{ gap: 2, flex: 1, alignItems: 'flex-end' }}>
                    <Heading size={18}>{c.to}</Heading>
                    <Body size={13} tone="muted">
                      {c.toDetail}
                    </Body>
                  </View>
                </View>
                <Body size={14} tone="subtle">
                  {c.court} · {c.when} · Ranked, best of 3
                </Body>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button label="Accept" style={{ flex: 1 }} />
                  <Button label="Decline" variant="outline" style={{ flex: 1 }} />
                </View>
              </View>
            </Card>
          ))
        : null}

      {tab === 'sent'
        ? challenges.sent.map((c) => (
            <Card key={c.id} style={{ padding: 16, gap: 6 }}>
              <Body weight="semibold">
                {c.from} challenged {c.to}
              </Body>
              <Body size={13} tone="muted">
                {c.court} · {c.when} · Waiting for them to answer
              </Body>
              <Button label="Cancel challenge" variant="ghost" size="sm" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            </Card>
          ))
        : null}

      {tab === 'accepted'
        ? challenges.accepted.map((c) => (
            <Card key={c.id} style={{ padding: 16, gap: 10 }}>
              <View style={{ gap: 4 }}>
                <Heading size={18}>
                  {c.us} vs {c.them}
                </Heading>
                <Body size={13} tone="muted">
                  {c.court} · {c.when}
                </Body>
              </View>
              <Link href={`/score/${c.id}`} asChild>
                <Button label="Enter score" />
              </Link>
            </Card>
          ))
        : null}
    </Screen>
  );
}
