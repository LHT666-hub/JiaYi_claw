-- ============================================================
-- V2.5 Phase 3: 家属绑定关系
-- ============================================================

CREATE TABLE IF NOT EXISTS family_bindings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL,
  family_id   uuid NOT NULL,
  relationship text NOT NULL,
  note        text,
  is_primary  boolean DEFAULT false,
  status      text NOT NULL CHECK (status IN ('pending','active','disabled')) DEFAULT 'active',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT family_bindings_resident_id_fkey
    FOREIGN KEY (resident_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT family_bindings_family_id_fkey
    FOREIGN KEY (family_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT family_bindings_resident_family_unique
    UNIQUE (resident_id, family_id)
);

CREATE INDEX IF NOT EXISTS idx_family_bindings_resident
  ON family_bindings (resident_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_family_bindings_family
  ON family_bindings (family_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION update_family_bindings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS family_bindings_updated_at ON family_bindings;
CREATE TRIGGER family_bindings_updated_at
BEFORE UPDATE ON family_bindings
FOR EACH ROW
EXECUTE FUNCTION update_family_bindings_updated_at();

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE family_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY family_bindings_select_resident ON family_bindings
  FOR SELECT USING (auth.uid() = resident_id);

CREATE POLICY family_bindings_select_family ON family_bindings
  FOR SELECT USING (auth.uid() = family_id);

CREATE POLICY family_bindings_select_admin ON family_bindings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY family_bindings_insert_admin ON family_bindings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY family_bindings_update_admin ON family_bindings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
