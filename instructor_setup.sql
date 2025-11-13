-- 講師用ダッシュボードのセットアップスクリプト

-- 1. instructorsテーブルの作成
CREATE TABLE IF NOT EXISTS instructors (
  id BIGSERIAL PRIMARY KEY,
  instructor_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_instructors_instructor_id ON instructors(instructor_id);

-- 2. 初期講師アカウントの作成（2名）
-- 注意: パスワードは平文で保存（本番環境ではbcryptなどでハッシュ化推奨）
-- パスワード: instructor01 / password01
INSERT INTO instructors (instructor_id, name, password_hash, email)
VALUES 
  ('instructor01', '講師1', 'password01', NULL),
  ('instructor02', '講師2', 'password02', NULL)
ON CONFLICT (instructor_id) DO NOTHING;

-- 3. RLS（Row Level Security）ポリシーの設定
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;

-- 講師は自分の情報のみ閲覧可能（将来の拡張用）
CREATE POLICY "Instructors can view their own record"
  ON instructors FOR SELECT
  USING (true); -- 現在は全講師が閲覧可能

-- 4. updated_atを自動更新するトリガー
CREATE TRIGGER update_instructors_updated_at
  BEFORE UPDATE ON instructors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. 講師の操作ログテーブル（オプション、将来の拡張用）
CREATE TABLE IF NOT EXISTS instructor_logs (
  id BIGSERIAL PRIMARY KEY,
  instructor_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'login', 'view_student', 'reset_progress', 'export_csv'
  target_student_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_logs_instructor_id ON instructor_logs(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_logs_created_at ON instructor_logs(created_at DESC);

-- 使用方法:
-- 1. SupabaseダッシュボードのSQL Editorで実行
-- 2. 講師ID: instructor01, パスワード: password01 でログイン
-- 3. 講師ID: instructor02, パスワード: password02 でログイン
--
-- 注意: 本番環境では、パスワードをbcryptなどでハッシュ化してください

