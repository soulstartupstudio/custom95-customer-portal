-- Monthly PDF reports archive for brandshops.
-- Run once in the Supabase SQL editor (same as previous portal migrations).

create table if not exists brandshop_reports (
  id uuid primary key default gen_random_uuid(),
  brandshop_id uuid not null references brandshops(id) on delete cascade,
  period_start date not null,          -- first day of the reported month
  period_label text not null,          -- e.g. 'June 2026'
  pdf_url text not null,               -- long-lived signed URL (same pattern as project photos)
  file_size_bytes bigint,
  generated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (brandshop_id, period_start)
);

alter table brandshop_reports enable row level security;

-- Portal customers can read reports for their own company's shops.
-- Mirrors the access pattern of the other brandshop_* tables: adapt the
-- USING clause if your existing policies use a helper function instead.
create policy "portal members read own shop reports"
  on brandshop_reports for select
  using (
    brandshop_id in (
      select b.id
      from brandshops b
      join contacts c on c.company_id = b.company_id
      where c.portal_auth_id = auth.uid()
    )
  );

-- Team app (authenticated internal users) — full access. Adapt to your
-- existing team-role check if you have one (e.g. is_team_member()).
create policy "service role manages reports"
  on brandshop_reports for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Private bucket for the PDFs (files are served via long-lived signed URLs,
-- so no public read policy is needed).
insert into storage.buckets (id, name, public)
values ('brandshop-reports', 'brandshop-reports', false)
on conflict (id) do nothing;
