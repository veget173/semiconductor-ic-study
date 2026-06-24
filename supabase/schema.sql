-- Semiconductor IC Study - Supabase schema and RLS
-- Run in Supabase SQL Editor after creating a project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  emoji_avatar text default '🧪',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text,
  path text,
  parse_status text default '已识别',
  note text,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('名词解释','简答题','计算题')),
  chapter text,
  tags text[] not null default '{}',
  difficulty text default '中等' check (difficulty in ('基础','中等','困难')),
  answer text,
  analysis text,
  related_formulas text,
  source_id uuid references public.sources(id),
  source_text text,
  status text not null default '待补充' check (status in ('待补充','待完善','待整理','已整理')),
  known_conditions text,
  solve_goal text,
  used_formulas text,
  solution_steps text,
  final_answer text,
  common_mistakes text,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  chapter text,
  tags text[] not null default '{}',
  formulas text,
  source_id uuid references public.sources(id),
  source_text text,
  status text not null default '待整理' check (status in ('待补充','待完善','待整理','已整理')),
  related_question_ids uuid[] not null default '{}',
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_tags (
  question_id uuid not null references public.questions(id),
  tag_id uuid not null references public.tags(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (question_id, tag_id)
);

create table if not exists public.note_tags (
  note_id uuid not null references public.knowledge_notes(id),
  tag_id uuid not null references public.tags(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check (object_type in ('question','note','source')),
  object_id uuid,
  file_name text not null,
  file_type text,
  storage_bucket text not null default 'course-images',
  storage_path text not null,
  public_url text,
  caption text,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.note_question_links (
  note_id uuid not null references public.knowledge_notes(id),
  question_id uuid not null references public.questions(id),
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (note_id, question_id)
);

create table if not exists public.edit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  action text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.log_edit()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.edit_logs(table_name, row_id, action, changed_by, after_data)
    values (tg_table_name, new.id, tg_op, auth.uid(), to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.edit_logs(table_name, row_id, action, changed_by, before_data, after_data)
    values (tg_table_name, new.id, tg_op, auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  end if;
  return null;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles(id, nickname, emoji_avatar)
  values (new.id, split_part(new.email, '@', 1), '🧪')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'profiles only allow nickname and emoji avatar updates';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
before update on public.profiles
for each row execute function public.guard_profile_update();

do $$
declare
  t text;
begin
  foreach t in array array['profiles','sources','questions','knowledge_notes','answer_submissions','tags','attachments']
  loop
    execute format('drop trigger if exists touch_%I on public.%I', t, t);
    execute format('create trigger touch_%I before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

drop trigger if exists log_questions on public.questions;
create trigger log_questions after insert or update on public.questions for each row execute function public.log_edit();
drop trigger if exists log_notes on public.knowledge_notes;
create trigger log_notes after insert or update on public.knowledge_notes for each row execute function public.log_edit();
drop trigger if exists log_attachments on public.attachments;
create trigger log_attachments after insert or update on public.attachments for each row execute function public.log_edit();
drop trigger if exists log_answer_submissions on public.answer_submissions;
create trigger log_answer_submissions after insert or update on public.answer_submissions for each row execute function public.log_edit();

alter table public.profiles enable row level security;
alter table public.sources enable row level security;
alter table public.questions enable row level security;
alter table public.knowledge_notes enable row level security;
alter table public.answer_submissions enable row level security;
alter table public.tags enable row level security;
alter table public.question_tags enable row level security;
alter table public.note_tags enable row level security;
alter table public.attachments enable row level security;
alter table public.note_question_links enable row level security;
alter table public.edit_logs enable row level security;

-- Public read, authenticated insert/update, no delete policies.
create policy "profiles readable" on public.profiles for select using (true);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own basics" on public.profiles
for update using (auth.uid() = id)
with check (auth.uid() = id);

create policy "sources readable" on public.sources for select using (true);
create policy "sources insert authenticated" on public.sources for insert to authenticated with check (true);
create policy "sources update authenticated" on public.sources for update to authenticated using (true) with check (true);

create policy "questions readable" on public.questions for select using (true);
create policy "questions insert authenticated" on public.questions for insert to authenticated with check (true);
create policy "questions update authenticated" on public.questions for update to authenticated using (true) with check (true);

create policy "notes readable" on public.knowledge_notes for select using (true);
create policy "notes insert authenticated" on public.knowledge_notes for insert to authenticated with check (true);
create policy "notes update authenticated" on public.knowledge_notes for update to authenticated using (true) with check (true);

create policy "answer_submissions readable" on public.answer_submissions for select using (true);
create policy "answer_submissions insert authenticated" on public.answer_submissions for insert to authenticated with check (true);
create policy "answer_submissions update authenticated" on public.answer_submissions for update to authenticated using (true) with check (true);

create policy "tags readable" on public.tags for select using (true);
create policy "tags insert authenticated" on public.tags for insert to authenticated with check (true);
create policy "tags update authenticated" on public.tags for update to authenticated using (true) with check (true);

create policy "question_tags readable" on public.question_tags for select using (true);
create policy "question_tags insert authenticated" on public.question_tags for insert to authenticated with check (true);
create policy "question_tags update authenticated" on public.question_tags for update to authenticated using (true) with check (true);

create policy "note_tags readable" on public.note_tags for select using (true);
create policy "note_tags insert authenticated" on public.note_tags for insert to authenticated with check (true);
create policy "note_tags update authenticated" on public.note_tags for update to authenticated using (true) with check (true);

create policy "attachments readable" on public.attachments for select using (true);
create policy "attachments insert authenticated" on public.attachments for insert to authenticated with check (true);
create policy "attachments update authenticated" on public.attachments for update to authenticated using (true) with check (true);

create policy "note_question_links readable" on public.note_question_links for select using (true);
create policy "note_question_links insert authenticated" on public.note_question_links for insert to authenticated with check (true);
create policy "note_question_links update authenticated" on public.note_question_links for update to authenticated using (true) with check (true);

create policy "edit_logs readable" on public.edit_logs for select using (true);
create policy "edit_logs insert system" on public.edit_logs for insert to authenticated with check (true);

-- Storage bucket and policies. Keep the bucket public for easy image previews.
insert into storage.buckets (id, name, public)
values ('course-images', 'course-images', true)
on conflict (id) do update set public = true;

create policy "course images public read" on storage.objects
for select using (bucket_id = 'course-images');

create policy "course images authenticated upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'course-images');

create policy "course images authenticated update archive only" on storage.objects
for update to authenticated
using (bucket_id = 'course-images')
with check (bucket_id = 'course-images');

-- No delete policy is intentionally created for public tables or storage objects.
