-- KINGDOM SPIRIT TECHNOLOGY - Supabase schema
-- Run the entire file in Supabase Dashboard > SQL Editor > New query.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.raw_user_meta_data->>'phone')
  on conflict (id) do update set full_name=excluded.full_name, phone=excluded.phone;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  service text,
  budget text,
  message text not null,
  source text default 'website',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

-- Guest service requests are accepted by the Cloudflare Pages Function.
-- Authenticated submissions are linked to a customer profile; guest submissions keep client_id NULL.
alter table public.enquiries alter column client_id drop not null;
alter table public.enquiries drop constraint if exists enquiries_client_id_fkey;
alter table public.enquiries add constraint enquiries_client_id_fkey
  foreign key (client_id) references public.profiles(id) on delete set null;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  service text not null,
  description text,
  status text not null default 'planning',
  progress integer not null default 0 check (progress between 0 and 100),
  start_date date,
  due_date date,
  next_milestone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  invoice_number text not null unique,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending','paid','overdue','cancelled')),
  due_date date,
  paystack_reference text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- A separate immutable-history table for each Paystack checkout attempt.
-- It prevents a later retry from overwriting the only reference for an earlier payment.
create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  authorization_url text,
  status text not null default 'initialized' check (status in ('initialized','paid','failed')),
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create unique index if not exists payment_attempts_one_active_per_invoice_idx
  on public.payment_attempts(invoice_id) where status = 'initialized';
create index if not exists payment_attempts_reference_idx on public.payment_attempts(reference);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  category text,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  file_name text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists projects_client_id_idx on public.projects(client_id);
create index if not exists invoices_client_id_idx on public.invoices(client_id);
create index if not exists notifications_user_id_idx on public.notifications(user_id, created_at desc);
create index if not exists enquiries_created_at_idx on public.enquiries(created_at desc);

alter table public.profiles enable row level security;
alter table public.enquiries enable row level security;
alter table public.projects enable row level security;
alter table public.invoices enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_files enable row level security;
alter table public.payment_attempts enable row level security;

-- Explicit table privileges; row-level security below determines which rows are accessible.
revoke all on public.profiles, public.enquiries, public.projects, public.invoices, public.notifications, public.support_tickets, public.project_milestones, public.project_files, public.payment_attempts from public, anon;
revoke all on public.payment_attempts from authenticated;
grant all on public.payment_attempts to service_role;
grant select on public.profiles, public.enquiries, public.projects, public.invoices, public.notifications, public.support_tickets, public.project_milestones, public.project_files to authenticated;
grant insert on public.enquiries, public.projects, public.invoices, public.notifications, public.support_tickets, public.project_milestones, public.project_files to authenticated;
grant update on public.enquiries, public.projects, public.invoices, public.support_tickets, public.project_milestones to authenticated;
grant delete on public.projects, public.project_milestones, public.project_files to authenticated;

-- Users can update profile details only, never their own role.
revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, phone, updated_at) on public.profiles to authenticated;
-- Clients may only mark their own notifications as read.
revoke update on public.notifications from public, anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update self or admin" on public.profiles;
create policy "profiles update self or admin" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists "enquiries create own" on public.enquiries;
create policy "enquiries create own" on public.enquiries for insert to authenticated with check (client_id = auth.uid());
drop policy if exists "enquiries admin read" on public.enquiries;
drop policy if exists "enquiries own or admin read" on public.enquiries;
create policy "enquiries own or admin read" on public.enquiries for select to authenticated using (client_id = auth.uid() or public.is_admin());
drop policy if exists "enquiries admin update" on public.enquiries;
create policy "enquiries admin update" on public.enquiries for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Client reads only own projects; administrators manage all projects.
drop policy if exists "projects own or admin read" on public.projects;
create policy "projects own or admin read" on public.projects for select to authenticated using (client_id = auth.uid() or public.is_admin());
drop policy if exists "projects admin insert" on public.projects;
create policy "projects admin insert" on public.projects for insert to authenticated with check (public.is_admin());
drop policy if exists "projects admin update" on public.projects;
create policy "projects admin update" on public.projects for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "projects admin delete" on public.projects;
create policy "projects admin delete" on public.projects for delete to authenticated using (public.is_admin());

drop policy if exists "invoices own or admin read" on public.invoices;
create policy "invoices own or admin read" on public.invoices for select to authenticated using (client_id = auth.uid() or public.is_admin());
drop policy if exists "invoices admin insert" on public.invoices;
create policy "invoices admin insert" on public.invoices for insert to authenticated with check (public.is_admin());
drop policy if exists "invoices admin update" on public.invoices;
create policy "invoices admin update" on public.invoices for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "notifications own or admin read" on public.notifications;
create policy "notifications own or admin read" on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications admin create" on public.notifications;
create policy "notifications admin create" on public.notifications for insert to authenticated with check (public.is_admin());

drop policy if exists "support own create" on public.support_tickets;
create policy "support own create" on public.support_tickets for insert to authenticated with check (client_id = auth.uid());
drop policy if exists "support own or admin read" on public.support_tickets;
create policy "support own or admin read" on public.support_tickets for select to authenticated using (client_id = auth.uid() or public.is_admin());
drop policy if exists "support admin update" on public.support_tickets;
create policy "support admin update" on public.support_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "milestones read through project" on public.project_milestones;
create policy "milestones read through project" on public.project_milestones for select to authenticated using (exists(select 1 from public.projects p where p.id=project_id and (p.client_id=auth.uid() or public.is_admin())));
drop policy if exists "milestones admin manage" on public.project_milestones;
create policy "milestones admin manage" on public.project_milestones for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "project files own or admin read" on public.project_files;
create policy "project files own or admin read" on public.project_files for select to authenticated using (client_id=auth.uid() or public.is_admin());
drop policy if exists "project files admin insert" on public.project_files;
create policy "project files admin insert" on public.project_files for insert to authenticated with check (public.is_admin());
drop policy if exists "project files admin delete" on public.project_files;
create policy "project files admin delete" on public.project_files for delete to authenticated using (public.is_admin());

-- After creating your own admin account, promote it with the SQL in SETUP-GUIDE.txt.


-- ---------------------------------------------------------------------------
-- Public website: contact inbox and chatbot FAQs
-- ---------------------------------------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
alter table public.faq_entries enable row level security;
grant usage on schema public to anon, authenticated, service_role;

-- Remove any older policies on these two tables, then apply the exact rules below.
do $$
declare existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('contact_messages', 'faq_entries')
  loop
    execute format('drop policy %I on %I.%I', existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
  end loop;
end $$;

revoke all on public.contact_messages from public, anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant select on public.contact_messages to authenticated;
create policy "kst_public_contact_insert"
  on public.contact_messages for insert to anon, authenticated
  with check (true);
create policy "kst_admin_read_contact_messages"
  on public.contact_messages for select to authenticated
  using (public.is_admin());

revoke all on public.faq_entries from public, anon, authenticated;
grant select on public.faq_entries to anon, authenticated;
grant select, insert, update, delete on public.faq_entries to authenticated;
create policy "kst_public_read_published_faqs"
  on public.faq_entries for select to anon, authenticated
  using (is_published = true);
create policy "kst_admin_manage_faqs"
  on public.faq_entries for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Private 10 MiB bucket for project files. Only admins upload/delete; clients can read their own shared files.
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-files', 'client-files', false, 10485760)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "client files read own or admin" on storage.objects;
create policy "client files read own or admin"
  on storage.objects for select to authenticated
  using (bucket_id = 'client-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "client files upload own" on storage.objects;
drop policy if exists "client files upload admin only" on storage.objects;
create policy "client files upload admin only"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'client-files' and public.is_admin());
drop policy if exists "client files delete own or admin" on storage.objects;
drop policy if exists "client files delete admin only" on storage.objects;
create policy "client files delete admin only"
  on storage.objects for delete to authenticated
  using (bucket_id = 'client-files' and public.is_admin());

-- payment_attempts is private to server-side Cloudflare code. It stores every
-- checkout reference independently; do not grant browser access to this table.
