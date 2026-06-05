-- Voer dit uit in de Supabase SQL Editor (supabase.com → jouw project → SQL Editor)

create table clients (
  id uuid primary key default gen_random_uuid(),
  fname text not null default '',
  lname text not null default '',
  company text,
  email text,
  phone text,
  website text,
  status text default 'actief',
  created_at timestamptz default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  name text not null,
  url text,
  color text default '#2563eb',
  status text default 'actief',
  start_date date,
  deadline date,
  created_at timestamptz default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  desc text not null,
  due_date date,
  priority text default 'normaal',
  done boolean default false,
  created_at timestamptz default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  recurring_id uuid,
  desc text not null,
  amount numeric(10,2) not null,
  date date,
  due_date date,
  status text default 'concept',
  created_at timestamptz default now()
);

create table recurring (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  desc text not null,
  amount numeric(10,2) not null,
  freq text not null,
  start_date date not null,
  end_date date,
  status text default 'actief',
  created_at timestamptz default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- Row Level Security: alleen jij kunt de data zien
alter table clients enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table invoices enable row level security;
alter table recurring enable row level security;
alter table notes enable row level security;

-- Policies: authenticated users mogen alles (jij bent de enige gebruiker)
create policy "auth users only" on clients for all using (auth.role() = 'authenticated');
create policy "auth users only" on projects for all using (auth.role() = 'authenticated');
create policy "auth users only" on tasks for all using (auth.role() = 'authenticated');
create policy "auth users only" on invoices for all using (auth.role() = 'authenticated');
create policy "auth users only" on recurring for all using (auth.role() = 'authenticated');
create policy "auth users only" on notes for all using (auth.role() = 'authenticated');
