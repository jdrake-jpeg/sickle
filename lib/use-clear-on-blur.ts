import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

// Clears a search box when you leave the tab, so it is empty when you come back.
export function useClearOnBlur(clear: () => void) {
  useFocusEffect(
    useCallback(() => {
      return () => clear();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
}
