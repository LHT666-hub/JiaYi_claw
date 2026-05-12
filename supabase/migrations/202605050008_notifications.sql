-- ============================================================
-- V2.5 Notifications center
-- ============================================================

ALTER TABLE IF EXISTS notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE IF EXISTS notifications
  RENAME COLUMN body TO content;

ALTER TABLE IF EXISTS notifications
  RENAME COLUMN href TO link_url;

ALTER TABLE IF EXISTS notifications
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS notifications
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid,
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN content SET DEFAULT '',
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN link_url DROP NOT NULL,
  ALTER COLUMN link_url DROP DEFAULT,
  ALTER COLUMN is_read SET DEFAULT false,
  ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND constraint_name = 'notifications_user_id_fkey'
  ) THEN
    ALTER TABLE notifications
      DROP CONSTRAINT notifications_user_id_fkey;
  END IF;
END $$;

ALTER TABLE IF EXISTS notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id),
  type text NOT NULL CHECK (
    type IN (
      'ask_todo_created',
      'todo_status_changed',
      'task_completed',
      'points_changed',
      'family_binding_created',
      'leader_matched',
      'course_recommended',
      'group_notice',
      'system'
    )
  ),
  title text NOT NULL,
  content text NOT NULL,
  link_url text,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (
    type IN (
      'ask_todo_created',
      'todo_status_changed',
      'task_completed',
      'points_changed',
      'family_binding_created',
      'leader_matched',
      'course_recommended',
      'group_notice',
      'system'
    )
  );

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON notifications;
DROP POLICY IF EXISTS notifications_select_admin ON notifications;
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_update_own ON notifications;

CREATE POLICY notifications_select_own ON notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY notifications_select_admin ON notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY notifications_insert_own_system ON notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND type = 'system'
  );

CREATE POLICY notifications_update_own_read ON notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
