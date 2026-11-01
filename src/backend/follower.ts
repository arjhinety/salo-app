/**
 * A follower phone (donor, pantry or driver) in a two-phone session (M5). The phone joins with the session code, replays
 * the session's input log and follows its shared clock (LiveEvening in follower mode), and sends its own actions as
 * requests. Nothing it does locally becomes an input.
 *
 * States: `joining` (waiting for the code or for registration), `live`, `offline` (the last state is kept and frozen,
 * and the phone re-reads the session and all inputs when the network is back), `ended` (the dashboard ended this session;
 * a new code is needed), `refused` (the code is not a session). Requests are `sending`, `unsent` (kept, sent again on the
 * next pass), `applied` (removed from the list; the lot or answer shows in the replay) or `rejected` (with the reason).
 */
import type { LiveEvening, SessionInput, SharedClock } from '../live/evening';
import type { RequestInput } from './requests';
import { SessionError, type RequestRow, type SessionApi, type SessionRow } from './sessionApi';

export type FollowState = 'idle' | 'joining' | 'live' | 'offline' | 'ended' | 'refused';

export interface FollowRequest {
  localId: number;
  input: RequestInput;
  status: 'sending' | 'unsent' | 'rejected';
  remoteId: number | null;
  reason: string | null;
}

export interface FollowStatus {
  state: FollowState;
  sessionId: string | null;
  /**
   * True when this phone joined after the evening started (the clock had moved or an input existed): the held drivers
   * are fixed by then, so a driver phone only watches (decision D-Q5). Set at join; a phone that joined before may answer.
   */
  watchOnly: boolean;
  /** A short English note for the state (the screens add the Filipino copy). Null when there is nothing to say. */
  message: string | null;
  requests: readonly FollowRequest[];
}

export type FollowerLive = Pick<
  LiveEvening,
  'getSnapshot' | 'follow' | 'followInputs' | 'followHeld' | 'followClock' | 'leaveFollow' | 'isFollower' | 'heldDrivers'
>;

export interface FollowerOptions {
  api: SessionApi;
  live: FollowerLive;
  /** True when the signed-in user is registered for this phone's role (the database accepts its requests then). */
  registered: () => boolean;
  /** The signed-in user's id. A change (a role change signs in another user) means the membership must be made again. */
  userId: () => string | null;
  now?: () => number;
  /** How often a live session is re-read, even without an event (protocol: re-read after any gap). */
  resyncMs?: number;
  /** Without a clock update for this long while the clock runs, the dashboard is treated as gone: the clock freezes. */
  staleMs?: number;
}

const MAX_KEPT_REJECTED = 5;
/** 17:00 in minutes: the clock's start (SIM_START_MINUTE). A session whose clock is elsewhere has started. */
const STARTED_AT_MINUTE = 1020;

export class Follower {
  private state: FollowState = 'idle';
  private code: string | null = null;
  private sessionId: string | null = null;
  private message: string | null = null;
  private requests: FollowRequest[] = [];
  private nextLocal = 1;
  private inputs: SessionInput[] = [];
  private unsubscribe: (() => void) | null = null;
  private lastClockAt = 0;
  private lastResyncAt = 0;
  /** The user who joined: membership belongs to that user, so a change of user joins again with the same code. */
  private joinedAs: string | null = null;
  private watchOnly = false;
  private busy = false;
  private snap: FollowStatus = { state: 'idle', sessionId: null, watchOnly: false, message: null, requests: [] };
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly resyncMs: number;
  private readonly staleMs: number;

  constructor(private readonly opts: FollowerOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.resyncMs = opts.resyncMs ?? 10_000;
    this.staleMs = opts.staleMs ?? 30_000;
  }

  subscribeStatus = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getStatus = (): FollowStatus => this.snap;

  /** Asks to join the session with this code. Joins once the phone is registered (pass() does it). */
  join(rawCode: string): void {
    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      this.leave();
      this.state = 'refused';
      this.message = 'the code has six letters or digits';
      this.publish();
      return;
    }
    this.leave();
    this.code = code;
    this.state = 'joining';
    this.publish();
  }

  /** Leaves the session on this phone. The displayed clock is left where it is, paused. */
  leave(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.opts.live.isFollower()) this.opts.live.leaveFollow();
    this.sessionId = null;
    this.code = null;
    this.inputs = [];
    this.requests = [];
    this.message = null;
    this.watchOnly = false;
    this.state = 'idle';
    this.publish();
  }

  /** Whether this phone is following a session right now. */
  isFollowing(): boolean {
    return this.sessionId !== null && this.opts.live.isFollower();
  }

  /** Sends one request to the dashboard. It shows as `sending` until the dashboard applies or rejects it. */
  send(input: RequestInput): void {
    const req: FollowRequest = { localId: this.nextLocal++, input, status: 'sending', remoteId: null, reason: null };
    this.requests = [...this.requests, req].slice(-(MAX_KEPT_REJECTED + 10));
    this.publish();
    void this.attempt(req);
  }

  /**
   * Called by the loop every few seconds. Joins when asked and registered; otherwise re-reads the session when it is
   * due, retries unsent requests, collects the outcomes of sent ones, and freezes the clock when the dashboard has gone quiet.
   */
  async pass(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.sessionId !== null && this.opts.userId() !== this.joinedAs) this.rejoinNeeded();
      if (this.sessionId === null) {
        if (this.code !== null && this.opts.registered()) await this.tryJoin(this.code);
      } else {
        if (this.state === 'offline' || this.now() - this.lastResyncAt >= this.resyncMs) await this.resync();
        await this.syncRequests();
        this.checkStale();
      }
    } finally {
      this.busy = false;
      this.publish();
    }
  }

  // -------------------------------------------------------------------------

  private async tryJoin(code: string): Promise<void> {
    let id: string | null = null;
    try {
      id = await this.opts.api.join(code);
      const row = await this.opts.api.readSession(id);
      if (row === null) throw new SessionError('not-found', 'the session is gone');
      if (row.endedAt !== null) return this.ended('This session ended. Join again with the new code.');
      this.sessionId = id;
      this.joinedAs = this.opts.userId();
      this.code = code;
      this.subscribeTo(id);
      await this.loadAll(row);
      this.watchOnly = row.clock.running || row.clock.minute !== STARTED_AT_MINUTE || this.inputs.length > 0;
      this.state = 'live';
      this.message = null;
    } catch (error) {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.sessionId = null;
      this.watchOnly = false;
      if (error instanceof SessionError && error.kind === 'not-found') {
        this.code = null;
        if (this.opts.live.isFollower()) this.opts.live.leaveFollow();
        this.state = 'refused';
        this.message = 'No session has that code.';
      } else if (error instanceof SessionError && error.kind === 'limited') {
        // Locked out: stop trying on the loop (each try would be another attempt). The phone must be given the code again.
        this.code = null;
        if (this.opts.live.isFollower()) this.opts.live.leaveFollow();
        this.state = 'refused';
        this.message = 'Too many tries. Wait 10 minutes.';
      } else if (error instanceof SessionError && error.kind === 'refused') {
        // Usually: the device is not registered yet. Try again on the next pass.
        this.state = 'joining';
        this.message = null;
      } else {
        this.state = 'offline';
        this.message = 'Not connected.';
      }
    }
  }

  /** The signed-in user changed: drop the session and its replay; the code is kept, so pass() joins again. */
  private rejoinNeeded(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.opts.live.isFollower()) this.opts.live.leaveFollow();
    this.sessionId = null;
    this.joinedAs = null;
    this.watchOnly = false;
    this.inputs = [];
    this.requests = [];
    this.state = 'joining';
    this.message = null;
  }

  private subscribeTo(id: string): void {
    this.unsubscribe?.();
    this.unsubscribe = this.opts.api.subscribe(id, {
      onSession: (row) => this.onSession(row),
      onInput: (input) => this.onInput(input),
      onStatus: (status) => this.onStatus(status),
    });
  }

  /** Replaces the whole replay with the session's rows, and moves the clock to the stored clock. */
  private async loadAll(row: SessionRow): Promise<void> {
    const id = row.id;
    const inputs = await this.opts.api.readInputs(id);
    if (this.sessionId !== id) return;
    this.inputs = inputs;
    this.opts.live.follow({ policy: row.policy, heldDrivers: row.heldDrivers }, inputs, row.clock, this.now());
    this.lastClockAt = this.now();
    this.lastResyncAt = this.now();
  }

  private async resync(): Promise<void> {
    const id = this.sessionId;
    if (id === null) return;
    try {
      const row = await this.opts.api.readSession(id);
      if (row === null || this.sessionId !== id) return;
      if (row.endedAt !== null) return this.ended('This session ended. Join again with the new code.');
      const inputs = await this.opts.api.readInputs(id);
      if (this.sessionId !== id) return;
      this.inputs = inputs;
      this.opts.live.followInputs(inputs);
      this.opts.live.followHeld(row.heldDrivers);
      this.opts.live.followClock(row.clock, this.now());
      this.lastClockAt = this.now();
      this.lastResyncAt = this.now();
      this.state = 'live';
      this.message = null;
    } catch (error) {
      if (error instanceof SessionError && error.kind === 'network') this.goOffline();
      else this.message = errorText(error);
    }
    this.publish();
  }

  private onSession(row: SessionRow): void {
    if (row.id !== this.sessionId) return;
    if (row.endedAt !== null) return this.ended('This session ended. Join again with the new code.');
    this.opts.live.followHeld(row.heldDrivers);
    this.opts.live.followClock(row.clock, this.now());
    this.lastClockAt = this.now();
    if (this.state !== 'live') {
      this.state = 'live';
      this.message = null;
    }
    this.publish();
  }

  private onInput(input: SessionInput): void {
    const last = this.inputs.length === 0 ? 0 : this.inputs[this.inputs.length - 1].seq;
    if (input.seq <= last) return;
    if (input.seq !== last + 1) {
      // A gap: some rows were missed. Re-read the whole log.
      void this.resync();
      return;
    }
    this.inputs = [...this.inputs, input];
    this.opts.live.followInputs(this.inputs);
    this.publish();
  }

  private onStatus(status: 'live' | 'down'): void {
    if (status === 'down') this.goOffline();
    else void this.resync();
  }

  private ended(text: string): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.sessionId = null;
    this.code = null;
    this.state = 'ended';
    this.message = text;
    this.freeze();
    this.publish();
  }

  /** Keeps the last state: the clock stops where it is, and the screen says so. */
  private goOffline(): void {
    if (this.state !== 'offline') this.freeze();
    this.state = 'offline';
    this.message = 'Not connected.';
    this.publish();
  }

  private freeze(): void {
    if (!this.opts.live.isFollower()) return;
    const snap = this.opts.live.getSnapshot();
    const clock: SharedClock = {
      minute: snap.minute,
      running: false,
      secondsPerMinute: snap.secondsPerMinute,
      updatedAtMs: this.now(),
    };
    this.opts.live.followClock(clock, this.now());
  }

  private checkStale(): void {
    if (this.state !== 'live') return;
    if (!this.opts.live.getSnapshot().running) return;
    if (this.now() - this.lastClockAt > this.staleMs) {
      this.state = 'offline';
      this.message = 'The dashboard has not sent the clock for a while.';
      this.freeze();
      this.publish();
    }
  }

  private async attempt(req: FollowRequest): Promise<void> {
    const id = this.sessionId;
    if (id === null) {
      req.status = 'unsent';
      this.publish();
      return;
    }
    try {
      req.remoteId = await this.opts.api.insertRequest(id, req.input);
      req.status = 'sending';
      req.reason = null;
    } catch (error) {
      if (error instanceof SessionError && error.kind === 'network') {
        req.status = 'unsent';
        this.goOffline();
      } else {
        req.status = 'rejected';
        req.reason = errorText(error);
      }
    }
    this.publish();
  }

  /** Retries unsent requests and reads the outcome of the sent ones. */
  private async syncRequests(): Promise<void> {
    const id = this.sessionId;
    if (id === null) return;
    for (const req of this.requests) if (req.status === 'unsent') await this.attempt(req);
    if (!this.requests.some((r) => r.status === 'sending' && r.remoteId !== null)) {
      this.trimRejected();
      return;
    }
    let rows: RequestRow[];
    try {
      rows = await this.opts.api.readOwnRequests(id);
    } catch (error) {
      if (error instanceof SessionError && error.kind === 'network') this.goOffline();
      return;
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    this.requests = this.requests.flatMap((req) => {
      if (req.remoteId === null) return [req];
      const row = byId.get(req.remoteId);
      if (!row || row.status === 'pending') return [req];
      if (row.status === 'applied') return [];
      return [{ ...req, status: 'rejected' as const, reason: row.reason ?? 'rejected by the dashboard' }];
    });
    this.trimRejected();
  }

  private trimRejected(): void {
    const rejected = this.requests.filter((r) => r.status === 'rejected');
    if (rejected.length <= MAX_KEPT_REJECTED) return;
    const drop = new Set(rejected.slice(0, rejected.length - MAX_KEPT_REJECTED));
    this.requests = this.requests.filter((r) => !drop.has(r));
  }

  private publish(): void {
    this.snap = {
      state: this.state,
      sessionId: this.sessionId,
      watchOnly: this.watchOnly,
      message: this.message,
      requests: [...this.requests],
    };
    for (const l of this.listeners) l();
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
