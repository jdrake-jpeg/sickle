import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Body, Button, Card, Chip, Display, Field, Heading, ListRow, Screen, SectionHeader, Segmented } from '@/components/ui';
import { nearbyPlayers } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

type Duration = '1h' | '2h' | 'tonight';

const durations: { value: Duration; label: string; until: string }[] = [
  { value: '1h', label: '1 hour', until: 'for the next hour' },
  { value: '2h', label: '2 hours', until: 'for the next 2 hours' },
  { value: 'tonight', label: 'Tonight', until: 'until 11:59 PM' },
];

const skillRanges = ['Any skill', '3.0 to 3.5', '3.5 to 4.0', '4.0+'];
const distances = ['1 mi', '3 mi', '5 mi'];

export default function PlayScreen() {
  const { colors } = useTheme();
  const [looking, setLooking] = useState(false);
  const [duration, setDuration] = useState<Duration>('2h');
  const [skill, setSkill] = useState('3.5 to 4.0');
  const [distance, setDistance] = useState('3 mi');
  const [query, setQuery] = useState('');

  const searching = query.trim().length >= 2;
  const q = query.trim().toLowerCase();
  const results = searching
    ? nearbyPlayers.filter((p) => p.username.includes(q) || p.name.toLowerCase().includes(q))
    : nearbyPlayers;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44 }}>
        <Display size={28}>SICKLE</Display>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accentFill }} />
      </View>

      <Card style={{ padding: 16, gap: 14, borderRadius: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: looking ? colors.accentFill : colors.borderStrong }} />
              <Heading size={18}>{looking ? 'LOOKING TO PLAY' : 'NOT LOOKING'}</Heading>
            </View>
            <Body size={13} tone="muted">
              {looking
                ? `Shown nearby ${durations.find((d) => d.value === duration)!.until}, as a rough distance`
                : 'Nobody nearby can see you'}
            </Body>
          </View>
          <Button label={looking ? 'Stop' : 'Go'} variant={looking ? 'outline' : 'primary'} size="sm" onPress={() => setLooking(!looking)} />
        </View>
        <Segmented accent value={duration} onChange={setDuration} options={durations.map(({ value, label }) => ({ value, label }))} />
      </Card>

      <Field
        label="Find a player"
        placeholder="Search by username"
        autoCapitalize="none"
        autoCorrect={false}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />

      {!searching ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {skillRanges.map((s) => (
              <Chip key={s} label={s} selected={s === skill} onPress={() => setSkill(s)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {distances.map((d) => (
              <Chip key={d} label={`Within ${d}`} selected={d === distance} onPress={() => setDistance(d)} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHeader title={searching ? 'Players' : 'Looking to play nearby'} detail={`${results.length} found`} />
        {results.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">
              {searching ? `No player matches "${query.trim()}".` : 'Nobody nearby is looking right now. Turn on Looking to Play so others can find you.'}
            </Body>
          </Card>
        ) : (
          results.map((player) => (
            <Link key={player.id} href={`/player/${player.id}`} asChild>
              <Pressable accessibilityRole="link">
                <ListRow
                  left={<Avatar initials={player.initials} />}
                  title={player.name}
                  subtitle={`@${player.username} · ${player.skill.toFixed(1)}${searching ? '' : ` · ${player.distance}`}`}
                  right={<Body tone="accent" weight="bold" size={14}>Team up</Body>}
                />
              </Pressable>
            </Link>
          ))
        )}
      </View>
    </Screen>
  );
}
