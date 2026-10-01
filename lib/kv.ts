// Small key-value store backed by SQLite on iOS and Android.
// lib/kv.web.ts provides the same API on web using localStorage.
import Storage from 'expo-sqlite/kv-store';

export const kv = {
  getItemSync: (key: string) => Storage.getItemSync(key),
  setItemSync: (key: string, value: string) => Storage.setItemSync(key, value),
  getItem: (key: string) => Storage.getItem(key),
  setItem: (key: string, value: string) => Storage.setItem(key, value),
  removeItem: (key: string) => Storage.removeItem(key),
};
