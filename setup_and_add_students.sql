CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT UNIQUE NOT NULL,
  user_id UUID,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);

CREATE TABLE IF NOT EXISTS student_progress (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT UNIQUE NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  progress_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_progress_student_id ON student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_updated_at ON student_progress(updated_at DESC);

CREATE TABLE IF NOT EXISTS measurements (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  student_id TEXT,
  ear TEXT NOT NULL,
  transducer TEXT NOT NULL,
  freq INTEGER NOT NULL,
  db INTEGER NOT NULL,
  masked BOOLEAN DEFAULT FALSE,
  mask_level INTEGER,
  so BOOLEAN DEFAULT FALSE,
  case_id TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measurements_user_id ON measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_measurements_student_id ON measurements(student_id);
CREATE INDEX IF NOT EXISTS idx_measurements_created_at ON measurements(created_at DESC);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own student record" ON students;
DROP POLICY IF EXISTS "Users can view their own student record" ON students;
DROP POLICY IF EXISTS "Users can update their own student record" ON students;

CREATE POLICY "Users can insert their own student record"
  ON students FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own student record"
  ON students FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own student record"
  ON students FOR UPDATE
  USING (true);

ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own progress" ON student_progress;
DROP POLICY IF EXISTS "Users can view their own progress" ON student_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON student_progress;

CREATE POLICY "Users can insert their own progress"
  ON student_progress FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own progress"
  ON student_progress FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own progress"
  ON student_progress FOR UPDATE
  USING (true);

ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own measurements" ON measurements;
DROP POLICY IF EXISTS "Users can view their own measurements" ON measurements;

CREATE POLICY "Users can insert their own measurements"
  ON measurements FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own measurements"
  ON measurements FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_student_progress_updated_at ON student_progress;
CREATE TRIGGER update_student_progress_updated_at
  BEFORE UPDATE ON student_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO students (student_id, name, created_at, updated_at)
VALUES ('237003', '池田侑未', NOW(), NOW())
ON CONFLICT (student_id) 
DO UPDATE SET 
  name = EXCLUDED.name,
  updated_at = NOW();

INSERT INTO students (student_id, name, created_at, updated_at)
VALUES ('237038', '橋本優花', NOW(), NOW())
ON CONFLICT (student_id) 
DO UPDATE SET 
  name = EXCLUDED.name,
  updated_at = NOW();

SELECT 
  student_id,
  name,
  created_at,
  updated_at
FROM students
WHERE student_id IN ('237003', '237038')
ORDER BY student_id;
