insert into public.service_catalog (
  organization_id,
  community_id,
  service_type,
  name,
  description,
  owner_role,
  required_fields
)
select
  organization.id,
  community.id,
  service.service_type,
  service.name,
  service.description,
  service.owner_role,
  service.required_fields::jsonb
from public.organizations organization
join public.communities community
  on community.organization_id = organization.id
  and community.slug = 'haiwan-town'
cross join (values
  (
    'referral_assistance',
    '分级转诊协助',
    '由家医团队评估社区处理或协助上转，不承诺实时号源。',
    'community',
    '["target","preferredDates","contactPhone"]'
  ),
  (
    'report_explanation',
    '检查报告整理',
    '整理居民提供的报告信息和待问问题，供医生接诊前参考。',
    'doctor',
    '["reportText"]'
  )
) as service(service_type, name, description, owner_role, required_fields)
where organization.slug = 'fengxian-primary-care'
on conflict (organization_id, community_id, service_type) do update set
  name = excluded.name,
  description = excluded.description,
  owner_role = excluded.owner_role,
  required_fields = excluded.required_fields,
  active = true,
  updated_at = now();
