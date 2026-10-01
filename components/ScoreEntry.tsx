import { TextInput, View } from 'react-native';

import { Body } from '@/components/ui';
import { fonts, radius } from '@/constants/theme';
import { GameScore } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

export type DraftScores = [string, string][];

export function toGameScores(draft: DraftScores): GameScore[] {
  return draft
    .filter(([a, b]) => a.trim() !== '' || b.trim() !== '')
    .map(([a, b]) => [Number(a), Number(b)] as GameScore);
}

export function fromGameScores(games: GameScore[]): DraftScores {
  const draft: DraftScores = games.map(([a, b]) => [String(a), String(b)]);
  while (draft.length < 3) draft.push(['', '']);
  return draft;
}

// Three rows of score boxes: team A on the left, team B on the right.
export function ScoreEntry({
  teamA,
  teamB,
  value,
  onChange,
}: {
  teamA: string;
  teamB: string;
  value: DraftScores;
  onChange: (next: DraftScores) => void;
}) {
  const { colors } = useTheme();
  const set = (game: number, side: 0 | 1, text: string) => {
    const next = value.map((pair) => [...pair] as [string, string]);
    next[game][side] = text.replace(/[^0-9]/g, '').slice(0, 2);
    onChange(next);
  };
  const box = {
    width: 72,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.numeric,
    fontSize: 26,
    textAlign: 'center' as const,
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 64 }} />
        <Body weight="bold" size={14} style={{ width: 72, textAlign: 'center' }} numberOfLines={2}>
          {teamA}
        </Body>
        <View style={{ width: 24 }} />
        <Body weight="bold" size={14} style={{ width: 72, textAlign: 'center' }} numberOfLines={2}>
          {teamB}
        </Body>
      </View>
      {value.map(([a, b], i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Body size={13} tone="muted" style={{ width: 64 }}>
            Game {i + 1}
            {i === 2 ? '\nif needed' : ''}
          </Body>
          <TextInput
            accessibilityLabel={`Game ${i + 1}, ${teamA} score`}
            keyboardType="number-pad"
            value={a}
            onChangeText={(t) => set(i, 0, t)}
            style={box}
          />
          <Body tone="muted" style={{ width: 24, textAlign: 'center' }}>
            –
          </Body>
          <TextInput
            accessibilityLabel={`Game ${i + 1}, ${teamB} score`}
            keyboardType="number-pad"
            value={b}
            onChangeText={(t) => set(i, 1, t)}
            style={box}
          />
        </View>
      ))}
    </View>
  );
}
