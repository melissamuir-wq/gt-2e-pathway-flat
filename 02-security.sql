-- =============================================================
-- GT Anywhere · 2e Pathway — 02-security.sql
-- Run this AFTER 01-schema.sql. Safe to re-run.
--
-- This file is the only real access control in the product.
-- The ALLOWED_DOMAINS check in page.tsx runs in the browser and
-- stops an honest mistake, not a determined person with the anon
-- key -- which is public by design. The domain gate below runs in
-- Postgres and is the one that counts.
--
-- Two rules are enforced here that the UI promises but cannot keep
-- on its own:
--   1. Only gt.school / alpha.school accounts touch student records.
--   2. Notes and stage transitions are append-only. No update, no
--      delete, for anyone holding the anon key.
-- =============================================================

-- ---------- who counts as staff ----------

create or replace function public.is_gt_staff()
returns boolean
language sql
stable
as $$
  select coalesce(
    split_part(lower(auth.jwt() ->> 'email'), '@', 2)
      in ('gt.school', 'alpha.school'),
    false
  );
$$;

-- ---------- turn RLS on ----------

alter table public.cases             enable row level security;
alter table public.case_steps        enable row level security;
alter table public.case_notes        enable row level security;
alter table public.stage_transitions enable row level security;

-- Deliberately NOT using FORCE ROW LEVEL SECURITY. It has no effect on
-- roles that hold BYPASSRLS -- which is exactly what service_role and
-- the dashboard's postgres role are -- so it would buy nothing here,
-- while risking an admin locked out of the Table Editor. The anon key
-- path, the only one this app exposes, is fully covered by the policies
-- and revokes below.

-- ---------- cases · read, file, and update; never delete ----------

drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
  for select to authenticated
  using (public.is_gt_staff());

drop policy if exists cases_insert on public.cases;
create policy cases_insert on public.cases
  for insert to authenticated
  with check (public.is_gt_staff());

drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases
  for update to authenticated
  using (public.is_gt_staff())
  with check (public.is_gt_staff());

-- ---------- case_steps · read, create, update ----------

drop policy if exists case_steps_select on public.case_steps;
create policy case_steps_select on public.case_steps
  for select to authenticated
  using (public.is_gt_staff());

drop policy if exists case_steps_insert on public.case_steps;
create policy case_steps_insert on public.case_steps
  for insert to authenticated
  with check (public.is_gt_staff());

drop policy if exists case_steps_update on public.case_steps;
create policy case_steps_update on public.case_steps
  for update to authenticated
  using (public.is_gt_staff())
  with check (public.is_gt_staff());

-- ---------- case_notes · APPEND ONLY ----------
-- Select and insert exist. Update and delete deliberately do not.
-- "Advancing a stage writes a dated entry that cannot be edited or
-- deleted" is a claim the case file makes to its user. This is where
-- that claim is actually true.

drop policy if exists case_notes_select on public.case_notes;
create policy case_notes_select on public.case_notes
  for select to authenticated
  using (public.is_gt_staff());

drop policy if exists case_notes_insert on public.case_notes;
create policy case_notes_insert on public.case_notes
  for insert to authenticated
  with check (public.is_gt_staff());

-- ---------- stage_transitions · APPEND ONLY ----------

drop policy if exists stage_transitions_select on public.stage_transitions;
create policy stage_transitions_select on public.stage_transitions
  for select to authenticated
  using (public.is_gt_staff());

drop policy if exists stage_transitions_insert on public.stage_transitions;
create policy stage_transitions_insert on public.stage_transitions
  for insert to authenticated
  with check (public.is_gt_staff());

-- ---------- belt and braces ----------
-- RLS already denies anything without a matching policy. These
-- revokes mean a future policy added in a hurry still cannot hand
-- out a delete on a student record.

revoke delete on public.cases             from anon, authenticated;
revoke delete on public.case_steps        from anon, authenticated;
revoke delete on public.case_notes        from anon, authenticated;
revoke delete on public.stage_transitions from anon, authenticated;

revoke update on public.case_notes        from anon, authenticated;
revoke update on public.stage_transitions from anon, authenticated;

-- The anon role gets nothing at all. Sign in first.
revoke all on public.cases             from anon;
revoke all on public.case_steps        from anon;
revoke all on public.case_notes        from anon;
revoke all on public.stage_transitions from anon;
