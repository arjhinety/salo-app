-- One row per parse call made by the parse Edge Function (architecture 5, the /parse contract).
-- Only the Edge Function writes it, with the service role. Clients may read their own rows and
-- nothing else. The function uses the (device_id, created_at) and (created_at) indexes for its
-- per-device and global rate limits.

create table public.parse_requests (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices (id) on delete cascade,
  text text not null check (char_length(text) <= 500),
  http_status int check (http_status between 100 and 599),
  response jsonb,
  usage jsonb check (usage is null or jsonb_typeof(usage) = 'object'),
  error_kind text check (error_kind is null or char_length(error_kind) <= 64),
  model text check (model is null or char_length(model) <= 100),
  request_config_sha256 text check (request_config_sha256 is null or request_config_sha256 ~ '^[0-9a-f]{64}$'),
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index parse_requests_device_created_idx on public.parse_requests (device_id, created_at);
create index parse_requests_created_idx on public.parse_requests (created_at);

alter table public.parse_requests enable row level security;
revoke all on public.parse_requests from anon, authenticated;
-- Clients: select only. No insert, update or delete grant, and no insert policy.
grant select on public.parse_requests to authenticated;
-- The Edge Function (service role) inserts. It bypasses RLS, but still needs the table and sequence grants.
grant select, insert on public.parse_requests to service_role;
grant usage on sequence public.parse_requests_id_seq to service_role;

create policy parse_requests_read_own on public.parse_requests for select to authenticated
  using (device_id = (select auth.uid()));
