import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Body, Card, Chip, Heading } from '@/components/ui';
import { useTheme } from '@/lib/theme';

// Rough guide to pickleball ratings, on the same scale DUPR uses (2.0 to 8.0).
// Descriptions are a general guide, not DUPR's official definitions.
export const skillLevels: { value: number; tier: string; description: string }[] = [
  { value: 2.0, tier: 'Beginner', description: 'Brand new. Learning the rules, the serve and keeping score.' },
  { value: 2.5, tier: 'Beginner', description: 'Can keep a short rally going and knows the kitchen rule. Still working on consistency.' },
  { value: 3.0, tier: 'Intermediate', description: 'Gets most serves and returns in. Starting to dink and come up to the kitchen line.' },
  { value: 3.5, tier: 'Intermediate', description: 'Steady rallies, controlled dinks, and starting to hit drops and place shots on purpose.' },
  { value: 4.0, tier: 'Pro', description: 'Reliable third-shot drops, good resets, and plays smart as a team. Few unforced errors.' },
  { value: 4.5, tier: 'Pro', description: 'Strong at every shot, quick hands at the net, and wins with strategy. Plays tournaments.' },
  { value: 5.0, tier: 'Star', description: 'Top tournament level. Very few mistakes and controls the pace of the game.' },
  { value: 5.5, tier: 'Star', description: 'Plays at or near the pro level.' },
];

export function tierOf(skill: number) {
  return skill >= 5 ? 'Star' : skill >= 4 ? 'Pro' : skill >= 3 ? 'Intermediate' : 'Beginner';
}

// "3.5 Intermediate", so the number never shows up without its meaning.
export function skillLabel(skill: number | string | null | undefined) {
  if (skill === null || skill === undefined || skill === '') return null;
  const n = Number(skill);
  return `${n.toFixed(1)} ${tierOf(n)}`;
}

// The four groups players see, with a plain-words summary of each.
const tiers = [
  { tier: 'Beginner', range: '2.0 to 2.5', summary: 'New to the game. Learning the rules, the serve and how to keep score.' },
  { tier: 'Intermediate', range: '3.0 to 3.5', summary: 'Rallies are steady. Dinking, coming up to the kitchen, and starting to place shots.' },
  { tier: 'Pro', range: '4.0 to 4.5', summary: 'Strong, smart player. Drops, resets and team play are solid. Plays tournaments.' },
  { tier: 'Star', range: '5.0 and up', summary: 'Top of the game. Tournament winners and pros.' },
];

export function SkillPicker({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const { colors } = useTheme();
  const selected = skillLevels.find((s) => s.value === value);

  return (
    <View style={{ gap: 10 }}>
      <Body size={13} weight="semibold" tone="muted">
        Skill level (optional)
      </Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {skillLevels.map((s) => (
          <Chip
            key={s.value}
            label={s.value === 5.5 ? '5.5+' : s.value.toFixed(1)}
            selected={value === s.value}
            onPress={() => onChange(value === s.value ? null : s.value)}
          />
        ))}
      </View>

      {selected ? (
        <Card style={{ padding: 14, gap: 4 }} highlighted>
          <Heading size={15}>
            {selected.value.toFixed(1)} · {selected.tier.toUpperCase()}
          </Heading>
          <Body size={14}>{selected.description}</Body>
        </Card>
      ) : (
        <Body size={13} tone="muted">
          Tap a number to see what it means. Not sure? Pick lower; you can change it later.
        </Body>
      )}

      <SkillGuide />

      <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.dupr.com')}>
        <Card style={{ padding: 14, gap: 4, borderColor: colors.accentText }}>
          <Heading size={13}>GET YOUR DUPR RATING</Heading>
          <Body size={14}>
            DUPR is the rating most pickleball players use. Make a free account and log a few games to find your real level and learn
            how ratings work.
          </Body>
          <Body size={14} weight="bold" tone="accent">
            Open dupr.com
          </Body>
        </Card>
      </Pressable>
    </View>
  );
}

// Tap-to-open guide to what the skill numbers mean. Used wherever ratings show
// up, so nobody has to guess what a 3.5 is.
export function SkillGuide({ title = 'WHAT DO THE LEVELS MEAN?', intro }: { title?: string; intro?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}>
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Heading size={13}>{title}</Heading>
          <Body weight="bold" tone="accent">
            {open ? '▲' : '▼'}
          </Body>
        </View>
        {intro ? <Body size={14}>{intro}</Body> : null}
        {open
          ? tiers.map((t) => (
              <View key={t.tier} style={{ gap: 4, borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Body weight="bold">{t.tier.toUpperCase()}</Body>
                  <Body size={14} tone="muted">
                    {t.range}
                  </Body>
                </View>
                <Body size={14}>{t.summary}</Body>
                {skillLevels
                  .filter((l) => l.tier === t.tier)
                  .map((l) => (
                    <Body key={l.value} size={13} tone="muted">
                      {l.value.toFixed(1)}: {l.description}
                    </Body>
                  ))}
              </View>
            ))
          : tiers.map((t) => (
              <View key={t.tier} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body size={14} weight="semibold">
                  {t.tier}
                </Body>
                <Body size={14} tone="muted">
                  {t.range}
                </Body>
              </View>
            ))}
        {!open ? (
          <Body size={13} weight="semibold" tone="accent">
            Tap to see what each level looks like
          </Body>
        ) : null}
      </Card>
    </Pressable>
  );
}
