/**
 * A stand-in for the Supabase client and for expo-sqlite/kv-store, for the backend tests. No network. The test files load
 * it through jest.mock factories, so the modules under test see the same shape they see in the app.
 */
export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  kind: 'upsert' | 'update';
  rows?: Row[];
  onConflict?: string;
  values?: Row;
  match?: Row;
}

export interface KvStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  data: Map<string, string>;
}

export interface Fake {
  client: { auth: { signInAnonymously: () => Promise<unknown> } };
  /** Writes the server accepted, in order. */
  writes: Write[];
  /** When true: sign-in and every write fail with no network. */
  net: { down: boolean };
  /** Return a refusal for a write (a 4xx), or null to accept it. */
  refuse: (w: Write) => { status: number; message: string } | null;
  signedInUser: () => string | null;
  isRetryable: (error: unknown) => boolean;
  reset: () => void;
}

export function makeKvStore(): KvStore {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

export function makeFakeSupabase(): Fake {
  let writes: Write[] = [];
  const net = { down: false };
  let refuse: Fake['refuse'] = () => null;
  let session: { user: { id: string }; access_token: string } | null = null;
  let users = 0;
  let listeners: ((event: string, s: unknown) => void)[] = [];

  const emit = (event: string) => listeners.forEach((fn) => fn(event, session));

  const write = async (w: Write) => {
    if (net.down) return { data: null, error: { message: 'TypeError: Network request failed' }, status: 0 };
    const refusal = refuse(w);
    if (refusal) return { data: null, error: { message: refusal.message }, status: refusal.status };
    writes = [...writes, w];
    return { data: null, error: null, status: 201 };
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      signInAnonymously: async () => {
        if (net.down) {
          return { data: { session: null, user: null }, error: { message: 'Network request failed', retryable: true } };
        }
        users += 1;
        session = { user: { id: `user-${users}` }, access_token: `token-${users}` };
        emit('SIGNED_IN');
        return { data: { session, user: session.user }, error: null };
      },
      signOut: async () => {
        session = null;
        emit('SIGNED_OUT');
        return { error: null };
      },
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        listeners = [...listeners, cb];
        cb('INITIAL_SESSION', session);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
    from: (table: string) => ({
      upsert: (rows: Row | Row[], opts: { onConflict?: string }) =>
        write({ table, kind: 'upsert', rows: Array.isArray(rows) ? rows : [rows], onConflict: opts.onConflict }),
      update: (values: Row) => ({
        match: (match: Row) => write({ table, kind: 'update', values, match }),
      }),
    }),
  };

  return {
    client,
    get writes() {
      return writes;
    },
    net,
    get refuse() {
      return refuse;
    },
    set refuse(fn: Fake['refuse']) {
      refuse = fn;
    },
    signedInUser: () => session?.user.id ?? null,
    isRetryable: (error) => typeof error === 'object' && error !== null && (error as { retryable?: boolean }).retryable === true,
    reset: () => {
      writes = [];
      net.down = false;
      refuse = () => null;
      session = null;
      users = 0;
      listeners = [];
    },
  } as Fake;
}
