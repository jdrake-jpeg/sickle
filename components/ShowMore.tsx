import { useState } from 'react';

import { Button } from '@/components/ui';

// Long lists stop after a few rows. "Show more" reveals the next batch.
export function usePaged<T>(items: T[], size = 5, step = size * 2) {
  const [count, setCount] = useState(size);
  return {
    shown: items.slice(0, count),
    hasMore: items.length > count,
    remaining: Math.max(0, items.length - count),
    more: () => setCount((c) => c + step),
  };
}

export function ShowMore({ hasMore, remaining, onPress }: { hasMore: boolean; remaining: number; onPress: () => void }) {
  if (!hasMore) return null;
  return <Button label={`Show more (${remaining} left)`} variant="outline" size="sm" onPress={onPress} />;
}
