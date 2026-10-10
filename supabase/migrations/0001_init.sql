-- Aangan enquiry agent — initial schema.
--
-- Boxes 23 and 24 of the components map: rules, lead log, client roster, duty
-- rota, call log, cost, lead state, acknowledgement clock.
--
-- Two things this schema takes seriously:
--   * Transcripts are sensitive (non-negotiable 8). They live in one column, in
--     one table, so access can be restricted in one place.
--   * Phone number is the unique client key (brief §7), in E.164.
--
-- Not applied anywhere. No Supabase project exists yet; this is checked in so
-- Phase 7 has something to run. [verify] the RLS policies against the real
-- roles before trusting them.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Roster and rota
-- ---------------------------------------------------------------------------

create table if not exists designers (
  id                    text primary key,
  name                  text        not null,
  email                 text        not null,
  -- false for the founder. Assignment and escalation filter on this; the rule
  -- that Nikhil is never a designer or a backup is enforced in code AND here.
  eligible_as_designer  boolean     not null default true,
  telegram_chat_id      text,
  created_at            timestamptz not null default now()
);

create table if not exists duty_rota (
  id                  uuid primary key default gen_random_uuid(),
  duty_date           date        not null,
  designer_id         text        not null references designers (id),
  role                text        not null check (role in ('primary', 'backup')),
  shift_start         time,
  shift_end           time,
  unique (duty_date, designer_id, role)
);

-- ---------------------------------------------------------------------------
-- Clients, enquiries, calls
-- ---------------------------------------------------------------------------

create table if not exists clients (
  -- E.164. The unique key for a client (brief §7, D16).
  phone        text primary key check (phone ~ '^\+[1-9]\d{6,14}$'),
  name         text,
  location     text,
  is_existing  boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists enquiries (
  id            uuid primary key default gen_random_uuid(),
  -- 'phone' only in the MVP. The column exists so a channel can be added
  -- without a migration (brief §2).
  channel       text        not null check (channel in ('phone', 'whatsapp', 'web_form')),
  client_phone  text        references clients (phone),
  received_at   timestamptz not null,
  -- SENSITIVE. Never logged, never leaves the approved stack.
  transcript    text,
  locale        text,
  created_at    timestamptz not null default now()
);

create table if not exists calls (
  id                   text primary key,
  enquiry_id           uuid        not null references enquiries (id) on delete cascade,
  started_at           timestamptz not null,
  ended_at             timestamptz,
  rings_before_answer  integer,
  answered_by          text        not null check (answered_by in ('front_desk', 'voice_agent')),
  duration_sec         integer,
  created_at           timestamptz not null default now()
);

-- Cost is a first-class output (non-negotiable 9). Stored in paise to avoid
-- floating point; the dashboard's headline is cost per booked consultation.
create table if not exists call_costs (
  call_id              text primary key references calls (id) on delete cascade,
  voice_minutes        numeric(10, 2) not null default 0,
  voice_paise          bigint         not null default 0,
  model_input_tokens   bigint         not null default 0,
  model_output_tokens  bigint         not null default 0,
  model_paise          bigint         not null default 0,
  total_paise          bigint         not null default 0,
  recorded_at          timestamptz    not null default now()
);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create table if not exists leads (
  id                    uuid primary key default gen_random_uuid(),
  enquiry_id            uuid        not null references enquiries (id) on delete cascade,
  client_phone          text        not null references clients (phone),
  state                 text        not null check (state in (
                          'received', 'qualified', 'unclear', 'declined', 'parked',
                          'review', 'booked', 'handed_off', 'acknowledged',
                          'consulted', 'escalated')),
  outcome               text        check (outcome in (
                          'book', 'ask_one', 'decline', 'review', 'park', 'complaint')),
  scope_class           text        not null,
  intent                text        not null,
  borderline            boolean     not null default false,
  priority_score        integer     not null default 0,
  assigned_designer_id  text        references designers (id),
  backup_designer_id    text        references designers (id),
  qualified_by          text        check (qualified_by in ('agent', 'front_desk')),
  asked_question_count  integer     not null default 0,
  -- Designer-only (non-negotiable 5). Lives on the HubSpot record in
  -- production; mirrored here only if Nikhil asks, which he has not.
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists leads_state_idx on leads (state);
create index if not exists leads_client_idx on leads (client_phone);

create table if not exists criterion_scores (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid    not null references leads (id) on delete cascade,
  criterion_id      text    not null,
  -- Verbatim from the transcript. Null when the model gave none, or when a
  -- fabricated quote was rejected.
  evidence_quote    text,
  reasoning         text,
  result            text    not null check (result in ('pass', 'unclear', 'fail')),
  downgraded_for_bad_evidence boolean not null default false,
  unique (lead_id, criterion_id)
);

-- ---------------------------------------------------------------------------
-- Clocks and escalation
-- ---------------------------------------------------------------------------

create table if not exists ack_clocks (
  lead_id              uuid primary key references leads (id) on delete cascade,
  -- For an after-hours lead this is the NEXT OPENING, not the call time (T13).
  started_at           timestamptz not null,
  due_at               timestamptz not null,
  acknowledged_at      timestamptz,
  acknowledged_by      text references designers (id)
);

create table if not exists escalations (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid        not null references leads (id) on delete cascade,
  step           text        not null check (step in ('backup_designer', 'front_desk_lead')),
  fired_at       timestamptz not null default now(),
  notified_id    text        not null,
  acknowledged_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Runtime settings (brief §8A) and their audit trail
-- ---------------------------------------------------------------------------

create table if not exists settings (
  key         text primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now()
);

create table if not exists settings_audit (
  id          uuid primary key default gen_random_uuid(),
  key         text        not null,
  old_value   jsonb,
  new_value   jsonb,
  changed_by  text        not null,
  changed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Idempotency (brief §8). A replayed webhook is a no-op (T17).
-- ---------------------------------------------------------------------------

create table if not exists idempotency_keys (
  key        text primary key,
  seen_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security.
--
-- [verify] before Phase 7: these are written against role names that do not
-- exist yet. RLS is ON for every table so that a missing policy denies rather
-- than leaks — the opposite failure of the one we care about.
-- ---------------------------------------------------------------------------

alter table clients            enable row level security;
alter table enquiries          enable row level security;
alter table calls              enable row level security;
alter table call_costs         enable row level security;
alter table leads              enable row level security;
alter table criterion_scores   enable row level security;
alter table ack_clocks         enable row level security;
alter table escalations        enable row level security;
alter table settings           enable row level security;
alter table settings_audit     enable row level security;
alter table designers          enable row level security;
alter table duty_rota          enable row level security;
alter table idempotency_keys   enable row level security;
