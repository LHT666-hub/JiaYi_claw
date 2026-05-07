insert into public.tasks (id, title, description, category, points, is_active, sort_order)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '早饭后服药',
    '按家庭医生既往安排，完成今天早饭后服药打卡。',
    'medicine',
    5,
    true,
    10
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '记录一次血压',
    '测完血压后完成一次记录，方便后续随访查看。',
    'record',
    5,
    true,
    20
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '记录一次血糖',
    '如家中有监测条件，可完成一次血糖记录。',
    'record',
    5,
    true,
    30
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '看 3 分钟家医小课堂',
    '观看一条简短课程，学习慢病日常管理重点。',
    'course',
    8,
    true,
    40
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '进群回复一句',
    '在居民群里回复一句近况，完成今日打卡。',
    'group',
    3,
    true,
    50
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '完成随访确认',
    '收到随访通知后确认时间或回复需要协助。',
    'followup',
    6,
    true,
    60
  )
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  points = excluded.points,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;
