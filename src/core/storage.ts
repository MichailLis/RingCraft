export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const STORAGE_VERSION = 1;

// legacy prefix kept: renaming would drop users' saved data
export const STORAGE_KEYS = {
  state: 'ringforge.state',
  ui: 'ringforge.ui',
  saved: 'ringforge.saved',
} as const;

function isEnvelope(x: unknown): x is { v: number; data: unknown } {
  return (
    typeof x === 'object' &&
    x !== null &&
    !Array.isArray(x) &&
    typeof (x as { v?: unknown }).v === 'number' &&
    'data' in x
  );
}

/** Reads `{ v, data }`; unversioned (legacy, v0) values are treated as the data itself. */
export function readStored<T>(kv: KV, key: string, parse: (data: unknown) => T, fallback: T): T {
  try {
    const raw = kv.getItem(key);
    if (raw === null) return fallback;
    const json: unknown = JSON.parse(raw);
    if (!isEnvelope(json)) return parse(json);
    if (json.v > STORAGE_VERSION) return fallback;
    return parse(json.data);
  } catch {
    return fallback;
  }
}

/** Lazy localStorage: the global is touched inside each call, so blocked site data (SecurityError) is caught by callers' try. */
export const browserKV: KV = {
  getItem: (k) => window.localStorage.getItem(k),
  setItem: (k, v) => window.localStorage.setItem(k, v),
  removeItem: (k) => window.localStorage.removeItem(k),
};

export function writeStored(kv: KV, key: string, data: unknown): void {
  try {
    const existing = kv.getItem(key);
    if (existing !== null) {
      try {
        const json: unknown = JSON.parse(existing);
        if (isEnvelope(json) && json.v > STORAGE_VERSION) return; // newer release's data: never clobber
      } catch {
        // corrupt existing value: overwrite
      }
    }
    kv.setItem(key, JSON.stringify({ v: STORAGE_VERSION, data }));
  } catch {
    // ignore quota / private-mode errors
  }
}

export function clearStored(kv: KV, keys: string[]): void {
  for (const key of keys) {
    try {
      kv.removeItem(key);
    } catch {
      // ignore
    }
  }
}
