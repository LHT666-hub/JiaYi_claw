begin;

create or replace function public.has_active_family_binding(
  p_family_id uuid,
  p_resident_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.family_bindings
    where family_id = p_family_id
      and resident_id = p_resident_id
      and status = 'active'
  )
$$;

revoke all on function public.has_active_family_binding(uuid, uuid) from public;
grant execute on function public.has_active_family_binding(uuid, uuid) to authenticated;

drop policy if exists "profiles_read_related_or_staff" on public.profiles;
drop policy if exists "profiles_read_scope" on public.profiles;

create policy "profiles_read_scope"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or (
    public.is_workbench_role()
    and organization_id = public.current_organization_id()
    and (
      public.current_app_role() = 'admin'
      or public.current_community_id() is null
      or community_id = public.current_community_id()
    )
  )
  or public.has_active_family_binding(auth.uid(), id)
);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

grant select on public.organizations,
  public.communities,
  public.care_networks,
  public.care_network_institutions,
  public.institutions,
  public.departments,
  public.practitioners,
  public.practitioner_schedules,
  public.referral_routes,
  public.service_catalog,
  public.public_info_entries,
  public.content_sources,
  public.content_items
to anon;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
grant usage, select on sequences to authenticated;
alter default privileges in schema public
grant all privileges on tables to service_role;
alter default privileges in schema public
grant all privileges on sequences to service_role;

commit;
