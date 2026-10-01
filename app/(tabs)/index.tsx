import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Body, Button, Card, Chip, Display, Heading, ListRow, Avatar, Screen, SectionHeader, Segmented, TeamAvatars } from '@/components/ui';
import { nearbyPlayers, teamsLooking } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

type Visibility = 'off' | 'area_only' | 'available_nearby' | 'looking_to_play';

const visibilityLabels: Record<Visibility, { title: string; detail: string }> = {
  off: { title: 'HIDDEN', detail: 'Nobody nearby can see you' },
  area_only: { title: 'IN YOUR AREA', detail: 'Shown in Rexburg, no distance' },
  available_nearby: { title: 'AVAILABLE NEARBY', detail: 'Shown as about 1 mi away' },
  looking_to_play: { title: 'LOOKING TO PLAY', detail: 'Until 9:00 PM · shown as about 1 mi away' },
};

const filters = ['3.5 to 4.0', 'Within 3 mi', 'Tonight', 'Competitive'];

export default function PlayScreen() {
  const { colors } = useTheme();
  const [visibility, setVisibility] = useState<Visibility>('looking_to_play');
  const [activeFilters, setActiveFilters] = useState<string[]>(['3.5 to 4.0']);
  const live = visibility !== 'off';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Display size={28}>SICKLE</Display>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accentFill }} />
        </View>
        <Button label="+ Team" variant="outline" size="sm" />
      </View>

      <Card style={{ padding: 16, gap: 14, borderRadius: 20 }}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: live ? colors.accentFill : colors.borderStrong,
              }}
            />
            <Heading size={18}>{visibilityLabels[visibility].title}</Heading>
          </View>
          <Body size={13} tone="muted">
            {visibilityLabels[visibility].detail}
          </Body>
        </View>
        <Segmented
          accent
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'area_only', label: 'Area' },
            { value: 'available_nearby', label: 'Nearby' },
            { value: 'looking_to_play', label: 'Looking' },
          ]}
        />
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {filters.map((filter) => (
          <Chip
            key={filter}
            label={filter}
            selected={activeFilters.includes(filter)}
            onPress={() =>
              setActiveFilters((current) => (current.includes(filter) ? current.filter((f) => f !== filter) : [...current, filter]))
            }
          />
        ))}
      </ScrollView>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Need a partner" detail={`${nearbyPlayers.length} nearby`} />
        {nearbyPlayers.map((player) => (
          <ListRow
            key={player.id}
            left={<Avatar initials={player.initials} />}
            title={player.name}
            subtitle={`${player.skill.toFixed(1)} · ${player.distance} · ${player.court}`}
            right={<Button label="Team up" size="sm" />}
          />
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Teams want opponents" detail={`${teamsLooking.length} nearby`} />
        {teamsLooking.map((team) => (
          <ListRow
            key={team.id}
            left={<TeamAvatars initials={team.initials} />}
            title={team.name}
            subtitle={`Avg ${team.skill.toFixed(1)} · ${team.record} · ${team.detail}`}
            right={<Button label="Challenge" variant="dangerOutline" size="sm" />}
          />
        ))}
      </View>
    </Screen>
  );
}
