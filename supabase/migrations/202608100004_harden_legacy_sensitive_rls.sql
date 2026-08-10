begin;

drop policy if exists "ask_logs_select_own_or_admin" on public.ask_logs;
create policy "ask_logs_read_scoped" on public.ask_logs for select to authenticated
using (
  user_id = auth.uid()
  or (user_id is not null and public.can_staff_access_profile(user_id))
);

drop policy if exists "ask_logs_insert_own_or_admin" on public.ask_logs;
create policy "ask_logs_insert_own" on public.ask_logs for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "course_views_resident_read" on public.course_views;
create policy "course_views_read_scoped" on public.course_views for select to authenticated
using (
  public.is_related_to_resident(resident_id)
  or public.can_staff_access_profile(resident_id)
);

drop policy if exists "course_views_insert" on public.course_views;
create policy "course_views_insert_scoped" on public.course_views for insert to authenticated
with check (
  resident_id = auth.uid()
  or (public.is_admin() and public.can_staff_access_profile(resident_id))
);

drop policy if exists "leader_matches_resident_read" on public.leader_matches;
create policy "leader_matches_read_scoped" on public.leader_matches for select to authenticated
using (
  public.is_related_to_resident(resident_id)
  or public.can_staff_access_profile(resident_id)
);

drop policy if exists "leader_matches_insert" on public.leader_matches;
create policy "leader_matches_insert_scoped" on public.leader_matches for insert to authenticated
with check (
  resident_id = auth.uid()
  or (public.is_admin() and public.can_staff_access_profile(resident_id))
);

drop policy if exists "leader_matches_resident_update" on public.leader_matches;
create policy "leader_matches_update_scoped" on public.leader_matches for update to authenticated
using (
  resident_id = auth.uid()
  or (public.is_admin() and public.can_staff_access_profile(resident_id))
)
with check (
  resident_id = auth.uid()
  or (public.is_admin() and public.can_staff_access_profile(resident_id))
);

drop policy if exists "family_link_codes_resident_read" on public.family_link_codes;
create policy "family_link_codes_resident_read" on public.family_link_codes for select to authenticated
using (
  resident_id = auth.uid()
  or (public.is_admin() and public.can_staff_access_profile(resident_id))
);

drop policy if exists "wechat_identities_owner_read" on public.wechat_identities;
create policy "wechat_identities_owner_read" on public.wechat_identities for select to authenticated
using (
  user_id = auth.uid()
  or (public.is_admin() and public.can_staff_access_profile(user_id))
);

drop policy if exists "notifications_select_admin" on public.notifications;
create policy "notifications_select_admin" on public.notifications for select to authenticated
using (public.is_admin() and public.can_staff_access_profile(user_id));

drop policy if exists "outbox_admin_read" on public.outbox_events;
create policy "outbox_admin_read" on public.outbox_events for select to authenticated
using (
  public.is_admin()
  and recipient_id is not null
  and public.can_staff_access_profile(recipient_id)
);

commit;
