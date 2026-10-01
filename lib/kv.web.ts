// Web version of lib/kv.ts. localStorage is missing during static rendering,
// so every call tolerates its absence.
const store = () => (typeof localStorage === 'undefined' ? null : localStorage);

export const kv = {
  getItemSync: (key: string) => store()?.getItem(key) ?? null,
  setItemSync: (key: string, value: string) => store()?.setItem(key, value),
  getItem: async (key: string) => store()?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => store()?.setItem(key, value),
  removeItem: async (key: string) => store()?.removeItem(key),
};
