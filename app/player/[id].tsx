import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar, Body, Button, Card, Display, Field, Heading, Screen } from '@/components/ui';
import { nearbyPlayers } from '@/lib/sample-data';

// Another player's page: team up with them, or block or report them.
export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = nearbyPlayers.find((p) => p.id === id);
  const [teamName, setTeamName] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');

  if (!player) {
    return (
      <Screen>
        <Body tone="muted">This player isn&apos;t available.</Body>
      </Screen>
    );
  }

  const firstName = player.name.split(' ')[0];

  return (
    <Screen>
      <Stack.Screen options={{ title: `@${player.username}` }} />
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
        <Avatar initials={player.initials} size={88} />
        <Display size={26}>{player.name.toUpperCase()}</Display>
        <Body tone="muted">
          @{player.username} · Skill {player.skill.toFixed(1)} · {player.distance} away
        </Body>
      </View>

      <Card style={{ padding: 16, gap: 12 }}>
        <Heading>TEAM UP WITH {firstName.toUpperCase()}</Heading>
        <Field label="Team name (optional)" placeholder={`You + ${firstName}`} value={teamName} onChangeText={setTeamName} maxLength={40} />
        <Button
          label="Create team"
          onPress={() => {
            Alert.alert('Team created', `${teamName.trim() || `You + ${firstName}`} is ready to challenge other teams.`);
            router.back();
          }}
        />
      </Card>

      {reporting ? (
        <Card style={{ padding: 16, gap: 12 }}>
          <Field label="What happened?" placeholder="Tell us what's wrong" value={reason} onChangeText={setReason} multiline maxLength={1000} style={{ height: 96, paddingTop: 12 }} />
          <Button
            label="Send report"
            variant="danger"
            disabled={!reason.trim()}
            onPress={() => {
              Alert.alert('Report sent', 'Thanks. We review every report.');
              setReporting(false);
              setReason('');
            }}
          />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label="Block"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() =>
            Alert.alert(`Block ${firstName}?`, "You won't see each other in Sickle, and neither of you can challenge the other.", [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Block', style: 'destructive', onPress: () => router.back() },
            ])
          }
        />
        <Button label="Report" variant="outline" style={{ flex: 1 }} onPress={() => setReporting(true)} />
      </View>
    </Screen>
  );
}
