import { ReactNode, useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Card, Chip } from '@/components/ui';

// One Filters button for every list. Closed, it shows how many filters are on.
// Tap it to see the options.
export function Filters({ active, onClear, children, label = 'Filters' }: { active: number; onClear?: () => void; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button label={`${label}${active ? ` (${active})` : ''} ${open ? '▾' : '▸'}`} variant={active ? 'primary' : 'outline'} size="sm" onPress={() => setOpen(!open)} />
        {active && onClear ? <Button label="Clear" variant="ghost" size="sm" onPress={onClear} /> : null}
      </View>
      {open ? <Card style={{ padding: 14, gap: 16 }}>{children}</Card> : null}
    </View>
  );
}

export function FilterGroup({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Body size={13} weight="bold" tone="muted">
        {label}
      </Body>
      {children}
      {hint ? (
        <Body size={12} tone="muted">
          {hint}
        </Body>
      ) : null}
    </View>
  );
}

export function FilterChips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}
