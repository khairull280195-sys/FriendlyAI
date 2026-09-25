create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  type text not null check (type in ('ai_answer','image_problem','app_bug','suggestion','other')),
  details text not null check (char_length(details) between 1 and 2000),
  page_url text,
  user_agent text,
  status text not null default 'new' check (status in ('new','reviewing','resolved')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Users can submit own feedback"
on public.feedback for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can view own feedback"
on public.feedback for select
to authenticated
using (auth.uid() = user_id);

create index if not exists feedback_created_at_idx on public.feedback(created_at desc);
create index if not exists feedback_status_idx on public.feedback(status);
