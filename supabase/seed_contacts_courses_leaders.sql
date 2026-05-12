-- V2.5 Phase 1 Seed: contacts, courses, group_leaders
-- Run AFTER 202605050004_contacts_courses_leaders.sql migration
-- Requires auth.users from earlier seed (zhangayi@example.com, etc.)

begin;

-- ─── 1. Contacts for 张阿姨 ────────────────────────────────────────
-- Clear existing contacts for the resident to avoid duplicates on re-run
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
  resident_id, contact_user_id, name, role_label, group_type,
  description, available_time, avatar_url, sort_order, is_primary
)
-- 家医团队
select resident_user.id, doctor_user.id, '李医生', '家庭医生', 'doctorTeam',
  '负责签约居民慢病管理、随访和转诊协助。', '工作日 08:30 - 17:00', '/avatars/li-doctor.png', 1, true
from resident_user, doctor_user
union all
select resident_user.id, nurse_user.id, '王护士', '团队护士', 'doctorTeam',
  '负责随访提醒、体检通知和日常流程协助。', '工作日 08:00 - 16:30', '/avatars/wang-nurse.png', 2, false
from resident_user, nurse_user
union all
select resident_user.id, pharmacist_user.id, '陈药师', '临床药师', 'doctorTeam',
  '负责配药规则说明和药盒相关问题协助。', '周一周三周五 09:00 - 16:00', '/avatars/chen-pharmacist.png', 3, false
from resident_user, pharmacist_user
union all
-- 家人
select resident_user.id, family_user.id, '张阿姨女儿', '家属联系人', 'family',
  '常帮忙看消息、陪同体检和提醒服药。', '晚上更方便联系', '/avatars/daughter.png', 4, true
from resident_user, family_user
union all
select resident_user.id, null, '张阿姨儿子', '家属联系人', 'family',
  '周末有空时帮忙陪同就诊和办理手续。', '周末白天', null, 5, false
from resident_user
union all
-- 社区支持
select resident_user.id, community_user.id, '居委张老师', '居委联系人', 'community',
  '可协助活动通知、体检提醒和群组协同。', '工作日 09:00 - 17:00', '/avatars/zhang-community.png', 6, false
from resident_user, community_user
union all
select resident_user.id, null, '楼组长陈阿姨', '楼组长', 'community',
  '2号楼楼组长，帮助独居老人手机操作和防诈提醒。', '白天大部分时间', null, 7, false
from resident_user;

-- ─── 2. Courses (8 items) ───────────────────────────────────────────
-- Upsert by title to avoid duplicates
delete from public.courses
where title in (
  '体检报告怎么看',
  '药吃完了怎么办',
  '高血压日常记录',
  '糖尿病低血糖提醒',
  '如何防止保健品骗局',
  '健康云不会用怎么办',
  '家庭医生不是私人医生',
  '如何在群里打卡'
);

insert into public.courses (title, category, audience, summary, duration, points, video_url, status)
values
  ('体检报告怎么看', '体检报告', '老年体检居民',
    '帮助居民理解体检报告中的常见异常指标，了解什么时候该找医生看。',
    '3 分钟', 5, null, 'published'),
  ('药吃完了怎么办', '配药用药', '长期用药居民',
    '社区续方、延伸处方和门诊配药的区别和流程，避免断药。',
    '3 分钟', 5, null, 'published'),
  ('高血压日常记录', '高血压', '高血压居民',
    '如何正确量血压、什么时候量、记录哪些信息交给医生。',
    '4 分钟', 5, null, 'published'),
  ('糖尿病低血糖提醒', '糖尿病', '糖尿病居民',
    '低血糖的症状识别、应急处理方法和预防措施。',
    '3 分钟', 5, null, 'published'),
  ('如何防止保健品骗局', '防诈提醒', '全体居民',
    '常见保健品推销话术、判断方法和举报渠道。',
    '5 分钟', 8, null, 'published'),
  ('健康云不会用怎么办', '平台使用', '不熟悉手机操作的居民',
    '健康云注册登录、查体检报告、预约挂号的图文步骤。',
    '4 分钟', 5, null, 'published'),
  ('家庭医生不是私人医生', '签约服务', '新签约居民',
    '签约家庭医生后能获得什么服务、什么不能做、如何合理利用。',
    '3 分钟', 5, null, 'published'),
  ('如何在群里打卡', '平台使用', '健康小组成员',
    '演示在健康小组中完成每日打卡的操作步骤和积分规则。',
    '2 分钟', 3, null, 'published');

-- ─── 3. Group Leaders (6 items) ─────────────────────────────────────
delete from public.group_leaders
where name in (
  '王阿姨', '李叔叔', '居委张老师', '楼组长陈阿姨', '赵阿姨', '周老师'
);

insert into public.group_leaders (
  name, role_label, area, tags, strengths, suitable_for,
  description, avatar_url, is_active
)
values
  ('王阿姨', '高血压互助小组长', '海湾社区',
    array['高血压', '糖尿病'],
    array['打卡提醒', '群聊活跃', '用药经验分享'],
    array['高血压居民', '需要打卡提醒的居民', '手机操作有困难的居民'],
    '社区健康小组组长，擅长带动邻居坚持健康打卡，每天早上提醒大家量血压。',
    null, true),
  ('李叔叔', '糖尿病自我管理小组长', '海湾社区',
    array['高血压', '冠心病'],
    array['运动指导', '健康知识', '邻里互助'],
    array['糖尿病居民', '需要运动指导的居民', '高龄独居老人'],
    '退休体育老师，热心帮助邻居做适合老年人的运动。',
    null, true),
  ('居委张老师', '社区支持联系人', '海湾社区',
    array[]::text[],
    array['政策咨询', '登记协助', '活动组织'],
    array['需要体检登记的居民', '需要防诈提醒的居民', '新签约居民'],
    '居委会工作人员，负责社区健康活动组织和登记协助。',
    null, true),
  ('楼组长陈阿姨', '老小区楼组长', '海湾社区',
    array['高血压'],
    array['邻里关怀', '手机教学', '防诈提醒'],
    array['手机操作有困难的居民', '独居老人', '需要防诈提醒的居民'],
    '2号楼楼组长，经常帮独居老人解决手机操作问题，也会提醒大家防范电信诈骗。',
    null, true),
  ('赵阿姨', '高糖共患互助组长', '滨海花园',
    array['糖尿病', '骨质疏松'],
    array['饮食管理', '打卡提醒', '陪伴就医'],
    array['糖尿病居民', '高龄独居老人', '需要陪伴就医的居民'],
    '热心肠的退休护士，擅长帮助邻居做好饮食控制和日常健康打卡。',
    null, true),
  ('周老师', '防骗与小课堂志愿者', '滨海花园',
    array['高血压'],
    array['健康讲座', '心理疏导', '社区活动'],
    array['需要防诈提醒的居民', '需要心理支持的居民', '需要体检登记的居民'],
    '退休心理老师，定期组织健康讲座，关注老年人心理健康。',
    null, true);

commit;
