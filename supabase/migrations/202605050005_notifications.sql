-- ============================================================
-- V2.5 Phase 2: 通知中心 / 提醒系统
-- ============================================================

-- notifications 表
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN (
    'ask_todo_created',
    'doctor_todo_status_changed',
    'task_completed',
    'points_changed',
    'course_recommended',
    'leader_matched',
    'group_notice',
    'exchange',
    'system'
  )),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  href        text NOT NULL DEFAULT '',
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 索引：用户未读通知快速查询
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 用户读取自己的通知
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- admin 读取全部通知
CREATE POLICY notifications_select_admin ON notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 通过 API 插入（service_role 或 当前用户插入自己的）
CREATE POLICY notifications_insert ON notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户更新自己的通知（标记已读）
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
