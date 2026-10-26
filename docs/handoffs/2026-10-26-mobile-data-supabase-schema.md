# Handoff: mobile-data, Supabase schema (2026-10-26)

Project `salo`, ref `usslrxpftaupvropfkzl` (Singapore). The remote was changed as instructed by the orchestrator, with Arjhine's authorisation: migrations, seed, pgTAP run and `config push`. No other project was touched. No local `supabase start` was run (slow connection). Nothing is committed or pushed to git.

## What was applied remotely

| Step | Command (ref checked first) | Result |
|---|---|---|
| Migrations | `supabase db push --linked -p <from supabase/.env> --include-seed` | 3 migrations applied (below) |
| Seed | same command, `supabase/seed.sql` | 50 donors, 30 pantries, 40 drivers |
| Migration list | `supabase migration list --linked` | `20261026100000`, `20261026100100`, `20261026100200`, all remote |
| pgTAP | `SUPABASE_DB_PASSWORD=<from file> supabase test db --linked` | **All tests successful, 57 of 57** (4 files) |
| Auth config | `supabase config push --project-ref usslrxpftaupvropfkzl` | **Partial, see "Side effects" below** |

After the test run the remote holds 0 rows in `auth.users`, `devices`, `live_sessions`, `lots`, `events` and `parse_requests`. pgTAP is not installed (the CLI removes it). Only the seed rows remain. `supabase db reset --linked` was **not** used.

Note: `db push` pulled the `edge-runtime` image and `supabase test db` pulled `pg_prove` (CLI tooling images). Docker Desktop was not running at the start; I started it. It is still running.

## Migrations

- `supabase/migrations/20261026100000_reference_tables.sql`: `donors`, `pantries`, `drivers` (reference data from the dataset).
- `supabase/migrations/20261026100100_devices_live_sessions.sql`: `devices`, `live_sessions`, `lots`, `events`, the `devices_guard` trigger, and the Realtime publication for `lots` and `events`.
- `supabase/migrations/20261026100200_parse_requests.sql`: `parse_requests` and its two indexes.

## Tables (all 8 in `public`, RLS on every one)

| Table | Key | Notes |
|---|---|---|
| `donors` | `id` `D\d{2}` | 50 rows. type union, closing minute 960–1320 |
| `pantries` | `id` `P\d{2}` | 30 rows. `has_fridge` is true exactly when `fridge_capacity_kg > 0` |
| `drivers` | `id` `V\d{2}` | 40 rows. tuning counts and frozen reliability |
| `devices` | `id` uuid → `auth.users` | `role` in donor/pantry/driver/dashboard. `profile_id` must match the role's prefix (dashboard: null) |
| `live_sessions` | `id` uuid | `evening_id` CHECK **E01–E10 only**. `policy` in salo/fcfs/nearest/central_greedy. `unique (id, policy)` |
| `lots` | PK (`session_id`, `lot_id`) | `lot_id` `LIVE-\d+`. `items` jsonb array, 1–10 elements. `est_kg > 0`, `load_units > 0`. minutes 960–1320, pickup after posting. `origin` = live |
| `events` | PK (`session_id`, `seq`) | `seq >= 1`, `at_minute` 0–1439, `event` jsonb object with `type`. FK (`session_id`, `policy`) → `live_sessions` |
| `parse_requests` | `id` bigint identity | `text` ≤ 500 chars, `http_status`, `response`, `usage` (object), `error_kind` (≤ 64), `model`, `request_config_sha256` (64 hex), `latency_ms`. Indexes `(device_id, created_at)`, `(created_at)` |

No `donor_messages`, `food_offers`, `evenings`, `pantry_needs` or `driver_runs` table exists. No `message_text` or `gold_*` column exists (tested).

## Policies and grants

Explicit grants are used. `anon` has no privileges on any table. Clients are `authenticated`.

- `donors`, `pantries`, `drivers`: select for authenticated (all rows). Service role may select.
- `devices`: select, insert, update own row only (`id = auth.uid()`). The `devices_guard` trigger forbids changing `id`, `role`, `profile_id` or `created_at`, requires a donor, pantry or driver profile to exist, and is not executable by API roles.
- `live_sessions`: select for all authenticated. Insert only when `created_by = auth.uid()` **and** the caller is a `dashboard` device. Update only by the creator, and only the `ended_at` column is granted. No delete.
- `lots`: select for all authenticated. Insert only when `created_by = auth.uid()` **and** the caller is a `dashboard` device or the donor device whose `profile_id` equals `lots.donor_id`. No update or delete.
- `events`: select for all authenticated. Insert only by the session's creator. No update or delete.
- `parse_requests`: clients select their own rows only (`device_id = auth.uid()`). No insert, update or delete grant or policy. The service role has select and insert, plus usage on the identity sequence.
- Realtime publication `supabase_realtime`: `lots`, `events`.

## Seed script and hashes

- Generator: `scripts/gen-supabase-seed.mjs` (reads only the three CSVs and `src/engine/types.ts` for the vocabularies; checks each CSV against `SHA256SUMS`; fails on unknown categories, out-of-range minutes or inconsistent fridge data). `--check` fails if the committed seed is stale.
- Tests: `scripts/gen-supabase-seed.test.mjs`, run with `node --test scripts/gen-supabase-seed.test.mjs`: **9 of 9 pass**. Covers determinism, committed seed matches, row counts 50/30/40, the source hashes, a literal row, no E11–E30 ids, only the three reference tables, and CSV parsing.
- Source sha256 (also in the seed header):
  - `donors.csv` `3627a11639cca71c93b216e742e52aa7254d93f6db10d585a50d3a23323083f1`
  - `pantries.csv` `51750f323d3e2f43ca7e957baf6a8606ac55ddfc11200201d13b4d44c27f1c6d`
  - `drivers.csv` `50e35f5c99a7451536844c33632d4474ed5988417d43913da089a0685f220c6e`
- `supabase/seed.sql` sha256 `f793059eecac6efb97f2e42a8aace7608b28f50bc16d61844139eaf7d2c80022`.
- Generator sha256 `c3e19c643173e7dca6d571a56ce82d7ca2004153a38d2eeeb46d72e59c3d808b`.

## Test files and results

- `supabase/tests/00_schema_guard.test.sql` (8): the exact table set; no `message_text` or `gold_*` column; RLS on every table; 50/30/40 rows; no E11–E30 id in the reference rows; anon has no table privileges.
- `supabase/tests/10_devices_rls.test.sql` (8): own row only; cannot insert or update another device; role and profile frozen; unknown donor rejected; anon cannot read.
- `supabase/tests/20_parse_requests.test.sql` (10): service role inserts; clients read own rows only; client insert, update and delete denied (42501); anon denied; text over 500 rejected (23514); both indexes exist.
- `supabase/tests/30_live_sessions_lots_events.test.sql` (31): E11, E21 and E30 rejected; unknown policy rejected; only the dashboard opens sessions; only `ended_at` changes; donor cannot post for another donor; lot ids unique per session (same id allowed in another session); pickup and minute bounds; events only by the creator, policy must match the session, seq unique, object with `type`; realtime publication.

Helper functions in the tests (`pg_temp.err_state`, `pg_temp.exec_rows`) return the exact SQLSTATE or row count, so each assertion names its error code.

Command: `SUPABASE_DB_PASSWORD=<from file> supabase test db --linked`, output `All tests successful. Files=4, Tests=57 ... Result: PASS`.

## Side effects of `supabase config push` (needs a decision)

The push printed a diff of the whole local `config.toml` against the remote. The auth part was applied (confirmed through `GET /auth/v1/settings`: `anonymous_users: true`, `mailer_autoconfirm: true`). The **storage step then failed**: `402 Please upgrade the project to a paid tier to enable vector buckets`, because local `[storage.vector] enabled = true`. Vector buckets are not used, so the next push will also fail until that line is changed.

Auth values changed on the remote, from the CLI diff (old remote → now):
- `enable_anonymous_sign_ins` false → **true** (intended)
- email `enable_confirmations` true → **false** (confirmation off)
- email `otp_length` 8 → 6; email `max_frequency` 1m0s → 1s
- MFA TOTP `enroll_enabled` / `verify_enabled` true → **false**
- SMS and MFA phone template: only the escaping changed (same text)

The design uses anonymous sign-in only, and the project had no users when this ran. I did not check the app code for email, SMS or MFA use. I did not revert these, because a second push would apply the same auth block again. To restore the old values, set them back in `supabase/config.toml` (or in the dashboard) with the orchestrator's go-ahead. Recommend the orchestrator decides.

## Design notes and deviations from the brief

- `devices.role` and `profile_id` are self-declared. No login links a person to a donor id, so ownership of rows is the protection, not identity. This is stated in the migration.
- The brief said "insert with `created_by = auth.uid()`". I tightened it: sessions need a dashboard device; lots need a dashboard device or the matching donor device; events need the session creator. The tests cover these.
- `events.at_minute` is 0–1439, not 16:00–22:00. Engine events are not limited to the post window, so a stricter check could reject valid events. Tighten if the engine guarantees it.
- `lots` uniqueness is the primary key (`session_id`, `lot_id`), which is a unique constraint.
- `error_kind` is free text (≤ 64 chars), not an enum, so the Edge Function can add kinds without a migration.
- `parse_requests.text` is the user's message as sent to `/parse`. It is not the dataset's `donor_messages`.

## Files touched (mine)

- `supabase/config.toml` (`enable_anonymous_sign_ins = true`; also `[storage.vector]` still `enabled = true`, see above)
- `supabase/migrations/20261026100000_reference_tables.sql`, `20261026100100_devices_live_sessions.sql`, `20261026100200_parse_requests.sql`
- `supabase/seed.sql`
- `supabase/tests/00_schema_guard.test.sql`, `10_devices_rls.test.sql`, `20_parse_requests.test.sql`, `30_live_sessions_lots_events.test.sql`
- `scripts/gen-supabase-seed.mjs`, `scripts/gen-supabase-seed.test.mjs`
- `docs/handoffs/2026-10-26-mobile-data-supabase-schema.md` (this file)

Not touched: `src/`, `server/`, `app.json`, `package.json`, `supabase/.env`, `donor_messages.csv`. `supabase/functions/` and `scripts/gen-parse-prompt-data.mjs` are from other agents.

## ER sketch

```
auth.users 1 ──0..1 devices (id)
devices 1 ──0..n live_sessions (created_by)
devices 1 ──0..n lots (created_by)
devices 1 ──0..n parse_requests (device_id)
live_sessions 1 ──0..n lots (session_id)
live_sessions 1 ──0..n events (session_id, policy)
donors 1 ──0..n lots (donor_id)
devices.profile_id ──(by role, trigger check, not FK)──> donors | pantries | drivers
pantries, drivers: no foreign keys in v1
```

## Open risks

1. The `config push` side effects above (auth settings changed; a storage step to fix before the next push).
2. Free-tier limits: `supabase test db` and `db push` ran on the free plan. The vector buckets 402 shows the plan limits apply.
3. Remote and local are not checked against each other (no local stack was run). The remote is the tested copy.
