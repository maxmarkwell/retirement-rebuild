-- Retirement Rebuild
-- Queue notifications when WATCH reassessments become ready.

create table if not exists public.reassessment_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  reassessment_id uuid not null references public.investment_reassessments(id) on delete cascade,
  ticker text not null,
  notification_type text not null default 'reassessment_ready',
  title text not null,
  message text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  delivered_at timestamptz
);

create unique index if not exists reassessment_notifications_reassessment_type_idx
  on public.reassessment_notifications(reassessment_id, notification_type);

create index if not exists reassessment_notifications_user_status_idx
  on public.reassessment_notifications(user_id, status, created_at desc);

alter table public.reassessment_notifications enable row level security;

drop policy if exists "Users can view own reassessment notifications" on public.reassessment_notifications;
create policy "Users can view own reassessment notifications"
  on public.reassessment_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own reassessment notifications" on public.reassessment_notifications;
create policy "Users can update own reassessment notifications"
  on public.reassessment_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
