begin;

with users_map as (
  select id, email
  from auth.users
  where email in (
    'zhangayi@example.com',
    'daughter@example.com',
    'li-doctor@example.com',
    'wang-nurse@example.com',
    'chen-pharmacist@example.com',
    'community-zhang@example.com',
    'admin@example.com'
  )
)
insert into public.profiles (id, display_name, role, avatar_url, phone)
select
  id,
  case email
    when 'zhangayi@example.com' then '张阿姨'
    when 'daughter@example.com' then '张阿姨女儿'
    when 'li-doctor@example.com' then '李医生'
    when 'wang-nurse@example.com' then '王护士'
    when 'chen-pharmacist@example.com' then '陈药师'
    when 'community-zhang@example.com' then '居委张老师'
    when 'admin@example.com' then '管理员'
  end,
  case email
    when 'zhangayi@example.com' then 'resident'
    when 'daughter@example.com' then 'family'
    when 'li-doctor@example.com' then 'doctor'
    when 'wang-nurse@example.com' then 'nurse'
    when 'chen-pharmacist@example.com' then 'pharmacist'
    when 'community-zhang@example.com' then 'community'
    when 'admin@example.com' then 'admin'
  end,
  case email
    when 'zhangayi@example.com' then '/avatars/zhang-auntie.png'
    when 'daughter@example.com' then '/avatars/daughter.png'
    when 'li-doctor@example.com' then '/avatars/li-doctor.png'
    when 'wang-nurse@example.com' then '/avatars/wang-nurse.png'
    when 'chen-pharmacist@example.com' then '/avatars/chen-pharmacist.png'
    when 'community-zhang@example.com' then '/avatars/zhang-community.png'
    when 'admin@example.com' then '/avatars/admin.png'
  end,
  case email
    when 'zhangayi@example.com' then '13800000001'
    when 'daughter@example.com' then '13800000002'
    when 'li-doctor@example.com' then '13800000003'
    when 'wang-nurse@example.com' then '13800000004'
    when 'chen-pharmacist@example.com' then '13800000005'
    when 'community-zhang@example.com' then '13800000006'
    when 'admin@example.com' then '13800000007'
  end
from users_map
on conflict (id) do update
set
  display_name = excluded.display_name,
  role = excluded.role,
  avatar_url = excluded.avatar_url,
  phone = excluded.phone,
  updated_at = now();

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
),
doctor_user as (
  select id from auth.users where email = 'li-doctor@example.com'
),
community_user as (
  select id from auth.users where email = 'community-zhang@example.com'
)
insert into public.resident_profiles (user_id, age, chronic_tags, family_doctor_id, community_contact_id)
select resident_user.id, 72, array['高血压', '糖尿病'], doctor_user.id, community_user.id
from resident_user, doctor_user, community_user
on conflict (user_id) do update
set
  age = excluded.age,
  chronic_tags = excluded.chronic_tags,
  family_doctor_id = excluded.family_doctor_id,
  community_contact_id = excluded.community_contact_id;

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
)
delete from public.contacts
where resident_id in (select id from resident_user);

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
),
family_user as (
  select id from auth.users where email = 'daughter@example.com'
),
doctor_user as (
  select id from auth.users where email = 'li-doctor@example.com'
),
nurse_user as (
  select id from auth.users where email = 'wang-nurse@example.com'
),
pharmacist_user as (
  select id from auth.users where email = 'chen-pharmacist@example.com'
),
community_user as (
  select id from auth.users where email = 'community-zhang@example.com'
)
insert into public.contacts (
  resident_id,
  contact_user_id,
  name,
  role_label,
  group_type,
  description,
  available_time,
  avatar_url,
  sort_order
)
select resident_user.id, doctor_user.id, '李医生', '家庭医生', 'doctorTeam', '负责签约居民慢病管理、随访和转诊协助。', '工作日 08:30 - 17:00', '/avatars/li-doctor.png', 1
from resident_user, doctor_user
union all
select resident_user.id, nurse_user.id, '王护士', '团队护士', 'doctorTeam', '负责随访提醒、体检通知和日常流程协助。', '工作日 08:00 - 16:30', '/avatars/wang-nurse.png', 2
from resident_user, nurse_user
union all
select resident_user.id, pharmacist_user.id, '陈药师', '临床药师', 'doctorTeam', '负责配药规则说明和药盒相关问题协助。', '周一周三周五 09:00 - 16:00', '/avatars/chen-pharmacist.png', 3
from resident_user, pharmacist_user
union all
select resident_user.id, family_user.id, '张阿姨女儿', '家属联系人', 'family', '常帮忙看消息、陪同体检和提醒服药。', '晚上更方便联系', '/avatars/daughter.png', 4
from resident_user, family_user
union all
select resident_user.id, community_user.id, '居委张老师', '居委联系人', 'community', '可协助活动通知、体检提醒和群组协同。', '工作日 09:00 - 17:00', '/avatars/zhang-community.png', 5
from resident_user, community_user;

delete from public.tasks
where title in ('早饭后服药', '记录一次血压', '看 3 分钟小课', '进群回复一句', '完成随访确认');

insert into public.tasks (title, description, category, points, is_active, sort_order)
values
  ('早饭后服药', '按医生既往安排完成今日早饭后服药打卡。', 'medicine', 5, true, 1),
  ('记录一次血压', '量完血压后完成一次记录，便于后续随访查看。', 'record', 5, true, 2),
  ('看 3 分钟小课', '学习一条家医小课堂，了解慢病日常管理重点。', 'course', 8, true, 3),
  ('进群回复一句', '在健康小组里打个卡，告诉大家今天状态。', 'group', 4, true, 4),
  ('完成随访确认', '收到随访通知后，确认时间或回复需要协助。', 'followup', 10, true, 5);

delete from public.courses
where title in (
  '高血压药为什么不能随便停？',
  '体检报告拿到手，先看哪几页？',
  '长处方和延伸处方，到底差在哪？'
);

insert into public.courses (title, category, audience, summary, duration, points, video_url, is_active)
values
  ('高血压药为什么不能随便停？', '高血压', '高血压居民', '解释持续服药、复查和联系家庭医生的重要性。', '3 分钟', 5, null, true),
  ('体检报告拿到手，先看哪几页？', '体检报告', '老年体检居民', '帮助居民先理解异常提示和报告解读路径。', '3 分钟', 5, null, true),
  ('长处方和延伸处方，到底差在哪？', '配药用药', '长期用药居民', '梳理社区续配里常见名词和路径。', '4 分钟', 5, null, true);

delete from public.faqs
where question in (
  '体检报告看不懂怎么办？',
  '药吃完了怎么办？',
  '怎么联系家庭医生？'
);

insert into public.faqs (question, keywords, category, answer, next_step, suggest_doctor, risk_level, is_active)
values
  ('体检报告看不懂怎么办？', array['体检报告看不懂', '报告怎么看', '体检结果'], '体检报告', '体检报告需要结合年龄、既往病史、用药情况和症状综合判断。家医 Claw 可以先帮助理流程，但不能判断严重程度。', '建议带完整报告联系家庭医生团队进一步解释。', true, 'medium', true),
  ('药吃完了怎么办？', array['药吃完', '没药了', '配药', '续方'], '配药用药', '慢病药快吃完时，应尽量提前联系家庭医生或社区卫生服务中心了解续方和配药安排，不要自行停药或换药。', '先准备好药盒或用药清单，再联系家医团队。', true, 'medium', true),
  ('怎么联系家庭医生？', array['联系家庭医生', '找李医生', '家医电话'], '找医生', '可以通过签约电话、社区卫生服务中心、家医团队微信群或平台中的一键找人入口联系家庭医生团队。', '在本平台可以点击一键找人，选择医生、护士、药师或家属。', false, 'low', true);

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
),
task_one as (
  select id, points from public.tasks where title = '早饭后服药' limit 1
),
task_two as (
  select id, points from public.tasks where title = '记录一次血压' limit 1
)
delete from public.task_records
where resident_id in (select id from resident_user);

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
),
task_one as (
  select id, points from public.tasks where title = '早饭后服药' limit 1
),
task_two as (
  select id, points from public.tasks where title = '记录一次血压' limit 1
)
insert into public.task_records (resident_id, task_id, points_awarded, note)
select resident_user.id, task_one.id, task_one.points, '演示种子数据' from resident_user, task_one
union all
select resident_user.id, task_two.id, task_two.points, '演示种子数据' from resident_user, task_two;

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
)
delete from public.points_ledger
where resident_id in (select id from resident_user);

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
),
admin_user as (
  select id from auth.users where email = 'admin@example.com'
)
insert into public.points_ledger (
  resident_id,
  change,
  reason,
  source_type,
  balance_after,
  created_by
)
select resident_user.id, 100, '演示初始积分', 'system', 100, admin_user.id from resident_user, admin_user
union all
select resident_user.id, 5, '完成任务：早饭后服药', 'task', 105, admin_user.id from resident_user, admin_user
union all
select resident_user.id, 5, '完成任务：记录一次血压', 'task', 110, admin_user.id from resident_user, admin_user;

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
)
delete from public.exchanges
where resident_id in (select id from resident_user);

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
)
insert into public.exchanges (resident_id, item_name, points_cost, status, completed_at)
select resident_user.id, '药盒', 35, 'completed', now() - interval '2 day'
from resident_user;

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
),
doctor_user as (
  select id from auth.users where email = 'li-doctor@example.com'
),
nurse_user as (
  select id from auth.users where email = 'wang-nurse@example.com'
)
delete from public.group_messages
where group_id = 'hypertension-haiwan';

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
),
doctor_user as (
  select id from auth.users where email = 'li-doctor@example.com'
),
nurse_user as (
  select id from auth.users where email = 'wang-nurse@example.com'
)
insert into public.group_messages (group_id, sender_id, sender_name, sender_role, content)
select 'hypertension-haiwan', null, 'Claw 群助手', 'assistant', '今天的小课堂是《高血压药为什么不能随便停》，看完可得 5 分。'
union all
select 'hypertension-haiwan', doctor_user.id, '李医生', 'doctor', '血压记录可以先连续观察。若持续明显升高，或出现胸痛、肢体无力等情况，请及时就医。'
from doctor_user
union all
select 'hypertension-haiwan', nurse_user.id, '王护士', 'nurse', '本周三上午有慢病随访，请收到提醒的居民记得确认。'
from nurse_user
union all
select 'hypertension-haiwan', resident_user.id, '张阿姨', 'resident', '我早上量了 135/82。'
from resident_user;

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
)
delete from public.doctor_todos
where resident_id in (select id from resident_user);

with resident_user as (
  select id from auth.users where email = 'zhangayi@example.com'
),
doctor_user as (
  select id from auth.users where email = 'li-doctor@example.com'
),
nurse_user as (
  select id from auth.users where email = 'wang-nurse@example.com'
),
pharmacist_user as (
  select id from auth.users where email = 'chen-pharmacist@example.com'
),
community_user as (
  select id from auth.users where email = 'community-zhang@example.com'
)
insert into public.doctor_todos (
  resident_id,
  assigned_to,
  type,
  title,
  description,
  risk_level,
  status,
  source
)
select resident_user.id, doctor_user.id, 'risk', '回看张阿姨近期血压记录', '居民在群里提到最近两天血压偏高，需要医生决定是否电话回访。', 'high', 'pending', 'ask'
from resident_user, doctor_user
union all
select resident_user.id, nurse_user.id, 'followup', '确认本周慢病随访', '张阿姨还没有确认周三上午的慢病随访，请协助提醒。', 'medium', 'processing', 'followup'
from resident_user, nurse_user
union all
select resident_user.id, pharmacist_user.id, 'medication', '解释社区续配规则', '居民询问社区配药和医院配药的区别，请先做流程解释。', 'low', 'pending', 'ask'
from resident_user, pharmacist_user
union all
select resident_user.id, community_user.id, 'notice', '协助转发老年体检通知', '请协助提醒居民关注本周体检排班和报告领取安排。', 'low', 'pending', 'notice'
from resident_user, community_user;

commit;
