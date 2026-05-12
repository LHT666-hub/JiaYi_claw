-- 先在 auth.users 中找到 resident@test.com 和 family@test.com 的 user id
-- 再替换下面的 UUID

insert into public.family_bindings (resident_id, family_id, relationship, note, is_primary, status)
values
('这里填 resident@test.com 的 user id', '这里填 family@test.com 的 user id', '女儿', '主要家属联系人', true, 'active')
on conflict (resident_id, family_id) do update set
  relationship = excluded.relationship,
  note = excluded.note,
  is_primary = excluded.is_primary,
  status = excluded.status,
  updated_at = now();
