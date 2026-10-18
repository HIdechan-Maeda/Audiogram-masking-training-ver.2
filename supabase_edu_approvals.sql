-- EDU の登録承認。実行すると eduApprovals.js はこの表を使います。
-- 未実行の間は、既存の student_progress に承認一覧を保存します。

CREATE TABLE IF NOT EXISTS edu_signup_approvals (
  email TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE edu_signup_approvals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON edu_signup_approvals TO anon, authenticated;

DROP POLICY IF EXISTS "edu approvals select" ON edu_signup_approvals;
DROP POLICY IF EXISTS "edu approvals insert" ON edu_signup_approvals;
DROP POLICY IF EXISTS "edu approvals update" ON edu_signup_approvals;

CREATE POLICY "edu approvals select"
  ON edu_signup_approvals FOR SELECT
  USING (true);

CREATE POLICY "edu approvals insert"
  ON edu_signup_approvals FOR INSERT
  WITH CHECK (true);

CREATE POLICY "edu approvals update"
  ON edu_signup_approvals FOR UPDATE
  USING (true);
