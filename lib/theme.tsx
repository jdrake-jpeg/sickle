import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { Palette, palettes, ThemeName } from '@/constants/theme';
import { kv } from '@/lib/kv';

export type ThemePreference = 'system' | ThemeName;

const STORAGE_KEY = 'sickle.themePreference';

type ThemeContextValue = {
  name: ThemeName;
  colors: Palette;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const stored = kv.getItemSync(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Storage can be unavailable (e.g. during static web rendering).
  }
  return 'system';
}

export function SickleThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      kv.setItemSync(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies for this session.
    }
  }, []);

  const name: ThemeName = preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo(
    () => ({ name, colors: palettes[name], preference, setPreference }),
    [name, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside SickleThemeProvider');
  return context;
}
