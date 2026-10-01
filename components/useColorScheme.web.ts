import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

// Static web rendering has no access to the browser's color scheme, so render
// light first and switch to the real value once the page has hydrated.
export function useColorScheme() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const scheme = useRNColorScheme();
  return hydrated && scheme === 'dark' ? 'dark' : 'light';
}
