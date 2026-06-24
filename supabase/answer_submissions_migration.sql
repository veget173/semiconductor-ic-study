-- Run this once in Supabase SQL Editor.
-- It removes 2025-related records from the active app view by archiving them,
-- then adds answer submission history with contributor identity.

update public.questions
set archived = true, updated_at = now()
where title ilike '%2025%'
   or source_text ilike '%2025%'
   or exists (select 1 from unnest(tags) as tag where tag ilike '%2025%');

update public.sources
set archived = true, updated_at = now()
where title ilike '%2025%'
   or path ilike '%2025%';

create table if not exists public.answer_submissions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id),
  answer text,
  analysis text,
  related_formulas text,
  relation_type text not null default 'initial' check (relation_type in ('initial','correction','supplement')),
  note text,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.answer_submissions enable row level security;

drop policy if exists "answer_submissions readable" on public.answer_submissions;
create policy "answer_submissions readable" on public.answer_submissions for select using (true);

drop policy if exists "answer_submissions insert authenticated" on public.answer_submissions;
create policy "answer_submissions insert authenticated" on public.answer_submissions
for insert to authenticated with check (true);

drop policy if exists "answer_submissions update authenticated" on public.answer_submissions;
create policy "answer_submissions update authenticated" on public.answer_submissions
for update to authenticated using (true) with check (true);

drop trigger if exists touch_answer_submissions on public.answer_submissions;
create trigger touch_answer_submissions
before update on public.answer_submissions
for each row execute function public.touch_updated_at();

drop trigger if exists log_answer_submissions on public.answer_submissions;
create trigger log_answer_submissions
after insert or update on public.answer_submissions
for each row execute function public.log_edit();
