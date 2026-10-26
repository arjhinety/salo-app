/**
 * The write queue. Every write from the app goes here first, so the UI never waits for the network (decision "everything in
 * db"). Items are kept in order in `expo-sqlite/kv-store` and flushed in that order when the network is back. Pure
 * TypeScript: the storage and the sender are injected, so the tests run without Supabase.
 *
 * Rules:
 * - An item belongs to the user who was signed in when it was written (`userId`). A flush sends only the items of the user
 *   who is signed in now. Items of another user wait in the queue (their rows carry that user's created_by, so RLS would
 *   refuse them anyway).
 * - Consecutive upserts to the same table with the same conflict key go out as one request (batching).
 * - A retryable failure (no network, 401, 429, 5xx) stops the flush, so the order is kept. A permanent refusal (4xx such
 *   as RLS or a check constraint) drops that group and counts it as rejected, so one bad row cannot block the queue.
 */

export type Row = Record<string, unknown>;

/** What a write attempt meant. `retry`: keep it queued. `rejected`: the server refused it for good. */
export type WriteOutcome = { kind: 'ok' } | { kind: 'retry'; reason: string } | { kind: 'rejected'; reason: string };

export interface OutboxItem {
  id: string;
  /** The user who must be signed in for this item to be sent. */
  userId: string;
  table: string;
  kind: 'upsert' | 'update';
  /** upsert: the rows, inserted with ON CONFLICT DO NOTHING on `onConflict`, so a retry is harmless. */
  rows?: Row[];
  onConflict?: string;
  /** update: the columns to set, and the row filter (equality on each key). */
  values?: Row;
  match?: Row;
  /** Optional label (for example `session:<id>`) so the sync can react when the item is delivered or rejected. */
  tag?: string;
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface OutboxStatus {
  /** true after the last network attempt worked, false after one failed, null before any attempt. */
  online: boolean | null;
  queued: number;
  /** Items the server refused for good, since this app started. */
  rejected: number;
}

export interface FlushReport {
  delivered: number;
  rejected: number;
  /** True when a retryable failure stopped the flush. */
  stopped: boolean;
}

export const OUTBOX_KEY = 'salo.outbox.v1';
/** Rows per request. Well below the PostgREST default body limit for these small rows. */
export const GROUP_LIMIT = 200;

type Listener = () => void;
type ItemListener = (item: OutboxItem) => void;

export class Outbox {
  private items: OutboxItem[] = [];
  private counter = 0;
  private flushing = false;
  private rejectedTotal = 0;
  private online: boolean | null = null;
  private snap: OutboxStatus = { online: null, queued: 0, rejected: 0 };
  private writing: Promise<void> = Promise.resolve();
  private readonly statusListeners = new Set<Listener>();
  private readonly deliveredListeners = new Set<ItemListener>();
  private readonly rejectedListeners = new Set<ItemListener>();

  constructor(
    private readonly store: KeyValueStore,
    private readonly send: (group: OutboxItem[]) => Promise<WriteOutcome>,
    private readonly key: string = OUTBOX_KEY,
  ) {}

  /** Loads the stored items. Items written before the load are kept after the stored ones. Call once at start. */
  async load(): Promise<void> {
    try {
      const raw = await this.store.getItem(this.key);
      const stored = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
      this.items = [...stored, ...this.items];
    } catch (error) {
      console.warn('outbox: stored queue could not be read, starting empty', error);
    }
    this.counter = this.items.length;
    this.publish();
  }

  /** Appends one write. Returns the stored item (with its id). */
  enqueue(item: Omit<OutboxItem, 'id'>): OutboxItem {
    this.counter += 1;
    const full: OutboxItem = { ...item, id: `${Date.now().toString(36)}-${this.counter}` };
    this.items.push(full);
    this.persist();
    this.publish();
    return full;
  }

  /** The items still queued, in order. */
  pending(): readonly OutboxItem[] {
    return this.items;
  }

  /** Records whether the last network attempt worked. */
  setOnline(value: boolean): void {
    if (this.online === value) return;
    this.online = value;
    this.publish();
  }

  /**
   * The next group to send for this user: the first item of this user, plus the directly following items that can share
   * one request. Items of other users stop a group, so the order is kept.
   */
  nextGroup(userId: string): OutboxItem[] | null {
    const start = this.items.findIndex((i) => i.userId === userId);
    if (start < 0) return null;
    const head = this.items[start];
    const group: OutboxItem[] = [head];
    if (head.kind === 'upsert') {
      for (let k = start + 1; k < this.items.length && group.length < GROUP_LIMIT; k++) {
        const next = this.items[k];
        if (next.userId !== userId || next.kind !== 'upsert' || next.table !== head.table || next.onConflict !== head.onConflict) break;
        group.push(next);
      }
    }
    return group;
  }

  /** Sends what the signed-in user can send, in order, until the queue is empty or a retryable failure stops it. */
  async flush(userId: string | null): Promise<FlushReport> {
    const report: FlushReport = { delivered: 0, rejected: 0, stopped: false };
    if (userId === null || this.flushing) return report;
    this.flushing = true;
    try {
      for (;;) {
        const group = this.nextGroup(userId);
        if (group === null) break;
        const outcome = await this.send(group);
        if (outcome.kind === 'retry') {
          this.setOnline(false);
          report.stopped = true;
          break;
        }
        const done = new Set(group.map((i) => i.id));
        this.items = this.items.filter((i) => !done.has(i.id));
        if (outcome.kind === 'ok') {
          this.setOnline(true);
          report.delivered += group.length;
          for (const item of group) for (const fn of this.deliveredListeners) fn(item);
        } else {
          this.rejectedTotal += group.length;
          report.rejected += group.length;
          console.warn(`outbox: ${group.length} row(s) to ${group[0].table} refused: ${outcome.reason}`);
          for (const item of group) for (const fn of this.rejectedListeners) fn(item);
        }
        this.persist();
        this.publish();
      }
    } finally {
      this.flushing = false;
    }
    return report;
  }

  /** The current status. Same object until something changes (for useSyncExternalStore). */
  getStatus = (): OutboxStatus => this.snap;

  subscribe = (listener: Listener): (() => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  onDelivered = (listener: ItemListener): (() => void) => {
    this.deliveredListeners.add(listener);
    return () => {
      this.deliveredListeners.delete(listener);
    };
  };

  onRejected = (listener: ItemListener): (() => void) => {
    this.rejectedListeners.add(listener);
    return () => {
      this.rejectedListeners.delete(listener);
    };
  };

  private publish(): void {
    const next: OutboxStatus = { online: this.online, queued: this.items.length, rejected: this.rejectedTotal };
    const same = next.online === this.snap.online && next.queued === this.snap.queued && next.rejected === this.snap.rejected;
    if (same) return;
    this.snap = next;
    for (const fn of this.statusListeners) fn();
  }

  /** Writes the queue to storage. Writes run one after another, so the last state wins. */
  private persist(): void {
    const json = JSON.stringify(this.items);
    this.writing = this.writing
      .then(() => this.store.setItem(this.key, json))
      .catch((error: unknown) => console.warn('outbox: queue not saved', error));
  }
}

/** The status line for the dashboard (English, decision). */
export function databaseStatusLine(s: OutboxStatus): string {
  if (s.online === true) return s.queued > 0 ? `Database: connected, queued ${s.queued}` : 'Database: connected';
  if (s.online === false) return `Database: offline, queued ${s.queued}`;
  return s.queued > 0 ? `Database: connecting, queued ${s.queued}` : 'Database: connecting';
}

/** Maps a PostgREST result to what the outbox should do with the group. */
export function outcomeOf(res: { error: { message: string } | null; status?: number }): WriteOutcome {
  if (!res.error) return { kind: 'ok' };
  const status = res.status ?? 0;
  const reason = res.error.message;
  // 0: no response (no network). 401: session expired, refreshed later. 429 and 5xx: the server is busy or down.
  if (status === 0 || status === 401 || status === 429 || status >= 500) return { kind: 'retry', reason };
  // With ON CONFLICT DO NOTHING a duplicate is not an error, so any other 4xx refuses the rows themselves.
  return { kind: 'rejected', reason };
}
