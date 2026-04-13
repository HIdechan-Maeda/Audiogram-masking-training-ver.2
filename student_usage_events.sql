/*
  Student usage events: login, default preset progress snapshot, clinical AI case generation.
  Run this entire script in Supabase SQL Editor.
*/

CREATE TABLE IF NOT EXISTS student_usage_events (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT NOT NULL,
  user_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('login', 'default_case_progress', 'clinical_case_generation')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_usage_events_student_id ON student_usage_events(student_id);
CREATE INDEX IF NOT EXISTS idx_student_usage_events_created_at ON student_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_usage_events_event_type ON student_usage_events(event_type);

ALTER TABLE student_usage_events ENABLE ROW LEVEL SECURITY;

/* Anon read-all (same pattern as student_progress) for instructor dashboard */
DROP POLICY IF EXISTS "Allow select student_usage_events" ON student_usage_events;
CREATE POLICY "Allow select student_usage_events"
  ON student_usage_events FOR SELECT
  USING (true);

/* Insert only when auth.uid() matches students.user_id for this student_id */
DROP POLICY IF EXISTS "Students insert own usage events" ON student_usage_events;
CREATE POLICY "Students insert own usage events"
  ON student_usage_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.student_id = student_usage_events.student_id
        AND s.user_id IS NOT NULL
        AND s.user_id = auth.uid()
    )
  );

COMMENT ON TABLE student_usage_events IS 'Student usage event log (login, default cases A-H progress, clinical case generation)';
