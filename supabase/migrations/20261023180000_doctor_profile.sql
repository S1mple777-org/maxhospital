-- Fuller doctor profile: work hours, languages, education (public), a private home
-- address the doctor can choose to show, public stats and a patient list that only the
-- doctor himself (and admins) can see.

alter table public.doctors
  add column if not exists work_hours jsonb not null default '{}'::jsonb,
  add column if not exists languages text,
  add column if not exists education text;

-- The doctors table is readable by everyone, so private data lives in its own table.
create table if not exists public.doctor_private (
  doctor_id uuid primary key references public.doctors(id) on delete cascade,
  home_address text,
  show_home_address boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.doctor_private enable row level security;

drop policy if exists "Doctor manages own private data" on public.doctor_private;
create policy "Doctor manages own private data" on public.doctor_private
  for all to authenticated
  using (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid()));

drop policy if exists "Admin reads doctor private data" on public.doctor_private;
create policy "Admin reads doctor private data" on public.doctor_private
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'owner'::app_role));

grant select, insert, update on public.doctor_private to authenticated;

-- Home address, only when the doctor chose to show it (or the caller is that doctor / admin).
create or replace function public.get_doctor_contact(_doctor_id uuid)
returns table (home_address text, show_home_address boolean)
language sql stable security definer set search_path = public as $$
  select
    case when p.show_home_address
           or d.user_id = auth.uid()
           or public.has_role(auth.uid(), 'admin'::app_role)
           or public.has_role(auth.uid(), 'owner'::app_role)
         then p.home_address end,
    p.show_home_address
  from public.doctors d
  join public.doctor_private p on p.doctor_id = d.id
  where d.id = _doctor_id;
$$;
grant execute on function public.get_doctor_contact(uuid) to anon, authenticated;

-- Real numbers from consultations instead of the stored counter.
create or replace function public.get_doctor_stats(_doctor_id uuid)
returns table (patients bigint, consultations bigint, active bigint)
language sql stable security definer set search_path = public as $$
  select
    count(distinct c.patient_id) filter (where c.status = 'completed'),
    count(*) filter (where c.status = 'completed'),
    count(*) filter (where c.status in ('pending', 'active'))
  from public.consultations c
  where c.doctor_id = _doctor_id;
$$;
grant execute on function public.get_doctor_stats(uuid) to anon, authenticated;

-- Patient list: only the doctor himself or an admin.
create or replace function public.get_doctor_patients(_doctor_id uuid)
returns table (
  patient_id uuid, full_name text, phone text,
  visits bigint, last_visit timestamptz, last_diagnosis text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.doctors d where d.id = _doctor_id and d.user_id = auth.uid())
     and not public.has_role(auth.uid(), 'admin'::app_role)
     and not public.has_role(auth.uid(), 'owner'::app_role) then
    raise exception 'Ruxsat yo''q';
  end if;

  return query
  select c.patient_id, pr.full_name, pr.phone,
         count(*)::bigint,
         max(coalesce(c.ended_at, c.created_at)),
         (select rx.diagnosis from public.prescriptions rx
           where rx.patient_id = c.patient_id and rx.doctor_id = _doctor_id
           order by rx.created_at desc limit 1)
  from public.consultations c
  left join public.profiles pr on pr.user_id = c.patient_id
  where c.doctor_id = _doctor_id and c.status = 'completed'
  group by c.patient_id, pr.full_name, pr.phone
  order by max(coalesce(c.ended_at, c.created_at)) desc
  limit 200;
end;
$$;
revoke execute on function public.get_doctor_patients(uuid) from public, anon;
grant execute on function public.get_doctor_patients(uuid) to authenticated;
