// Small key-value store backed by SQLite on iOS and Android.
// lib/kv.web.ts provides the same API on web using localStorage.
//
// Everything goes through expo-sqlite's sync calls, even the async-looking
// ones Supabase uses. Mixing its sync and async calls opens two connections
// to the same file, and at startup both run their setup transaction at once,
// which shows a red "cannot rollback - no transaction is active" error.
import Storage from 'expo-sqlite/kv-store';

export const kv = {
  getItemSync: (key: string) => Storage.getItemSync(key),
  setItemSync: (key: string, value: string) => Storage.setItemSync(key, value),
  getItem: async (key: string) => Storage.getItemSync(key),
  setItem: async (key: string, value: string) => Storage.setItemSync(key, value),
  removeItem: async (key: string) => {
    Storage.removeItemSync(key);
  },
};
