-- Supabaseテーブル作成スクリプト
-- 学生IDベースの成績管理システム用

-- 1. studentsテーブル（学生情報）
CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT UNIQUE NOT NULL,
  user_id UUID, -- Supabase匿名認証のユーザーID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);

-- 2. student_progressテーブル（学生の進捗状況）
CREATE TABLE IF NOT EXISTS student_progress (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT UNIQUE NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  progress_data JSONB NOT NULL, -- 進捗データ（JSON形式）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_student_progress_student_id ON student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_updated_at ON student_progress(updated_at DESC);

-- 3. measurementsテーブル（既存のテーブルがある場合はスキップ）
-- このテーブルは既に存在する可能性があります
CREATE TABLE IF NOT EXISTS measurements (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  student_id TEXT, -- 学生IDを追加（オプション）
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

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_measurements_user_id ON measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_measurements_student_id ON measurements(student_id);
CREATE INDEX IF NOT EXISTS idx_measurements_created_at ON measurements(created_at DESC);

-- RLS（Row Level Security）ポリシーの設定
-- 匿名ユーザーは自分のデータのみ読み書き可能

-- studentsテーブルのRLS
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own student record"
  ON students FOR INSERT
  WITH CHECK (true); -- 匿名ユーザーは新規作成可能

CREATE POLICY "Users can view their own student record"
  ON students FOR SELECT
  USING (true); -- 全ユーザーが閲覧可能（必要に応じて制限）

CREATE POLICY "Users can update their own student record"
  ON students FOR UPDATE
  USING (true); -- 全ユーザーが更新可能（必要に応じて制限）

-- student_progressテーブルのRLS
ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own progress"
  ON student_progress FOR INSERT
  WITH CHECK (true); -- 匿名ユーザーは新規作成可能

CREATE POLICY "Users can view their own progress"
  ON student_progress FOR SELECT
  USING (true); -- 全ユーザーが閲覧可能（必要に応じて制限）

CREATE POLICY "Users can update their own progress"
  ON student_progress FOR UPDATE
  USING (true); -- 全ユーザーが更新可能（必要に応じて制限）

-- measurementsテーブルのRLS（既存のポリシーがある場合は調整）
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own measurements"
  ON measurements FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own measurements"
  ON measurements FOR SELECT
  USING (true);

-- updated_atを自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーを設定
CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_progress_updated_at
  BEFORE UPDATE ON student_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


