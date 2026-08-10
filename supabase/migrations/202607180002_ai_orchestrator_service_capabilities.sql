-- Make service availability explicit so the assistant never implies that an
-- official booking or real-time slot exists when the team must handle it.

alter table public.service_catalog
  drop constraint if exists service_catalog_service_type_check;

alter table public.service_catalog
  add constraint service_catalog_service_type_check check (service_type in (
    'clinic_registration','family_doctor_booking','refill_request',
    'dispense_status_query','followup_reminder','report_explanation',
    'referral_assistance','other'
  ));

alter table public.service_catalog
  add column if not exists access_mode text not null default 'team_assisted'
    check (access_mode in ('team_assisted','official_link','hybrid','information_only')),
  add column if not exists official_url text,
  add column if not exists response_sla_hours integer
    check (response_sla_hours is null or response_sla_hours between 1 and 720),
  add column if not exists availability_note text;

update public.service_catalog
set
  access_mode = case
    when service_type = 'report_explanation' then 'information_only'
    else 'team_assisted'
  end,
  response_sla_hours = case
    when service_type in ('clinic_registration','family_doctor_booking','refill_request') then 24
    when service_type = 'followup_reminder' then 48
    else response_sla_hours
  end,
  availability_note = coalesce(availability_note, case
    when service_type = 'clinic_registration' then '不承诺实时号源，由家医团队核验后回写结果。'
    when service_type = 'family_doctor_booking' then '由所属家医团队确认服务方式和时间。'
    when service_type = 'refill_request' then '由医生、药师核对处方要求和实时库存。'
    when service_type = 'followup_reminder' then '由团队确认随访时间和渠道。'
    else null
  end);

insert into public.service_catalog (
  organization_id, community_id, service_type, name, description, owner_role,
  required_fields, service_hours, access_mode, response_sla_hours,
  availability_note, active
)
select
  organization_id,
  id,
  'referral_assistance',
  '分级转诊协助',
  '家庭医生评估后，按本市分级诊疗路径协助预约上级医疗机构。',
  'doctor',
  '["target","preferredDates","contactPhone"]'::jsonb,
  null,
  'team_assisted',
  48,
  '是否符合转诊条件、目标医院和科室均由家医团队确认。',
  true
from public.communities
where slug = 'haiwan-town'
on conflict (organization_id, community_id, service_type)
do update set
  name = excluded.name,
  description = excluded.description,
  owner_role = excluded.owner_role,
  required_fields = excluded.required_fields,
  access_mode = excluded.access_mode,
  response_sla_hours = excluded.response_sla_hours,
  availability_note = excluded.availability_note,
  active = true,
  updated_at = now();

comment on column public.service_catalog.access_mode is
  'How residents can access the service; never inferred by the model.';
