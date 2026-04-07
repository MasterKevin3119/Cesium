-- First answer per mission question per user (wrong answers kept; retries do not overwrite).
-- Run in Supabase SQL Editor after prior migrations.

create table if not exists public.mission_first_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null,
  question_id text not null,
  answer jsonb not null,
  is_correct boolean,
  created_at timestamptz not null default now(),
  constraint mission_first_answers_user_mission_question_unique
    unique (user_id, mission_id, question_id)
);

create index if not exists mission_first_answers_user_created
  on public.mission_first_answers (user_id, created_at desc);

alter table public.mission_first_answers enable row level security;

create policy "mission_first_answers_select_own"
  on public.mission_first_answers for select
  using (auth.uid() = user_id);

create policy "mission_first_answers_insert_own"
  on public.mission_first_answers for insert
  with check (auth.uid() = user_id);

-- No update/delete policies: rows are immutable after insert (retries use ON CONFLICT / ignore duplicate).
