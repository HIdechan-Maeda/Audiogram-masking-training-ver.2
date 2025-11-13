-- Supabase最適化スクリプト
-- 大規模運用（1,000人以上）向けの最適化

-- ============================================
-- 1. パフォーマンス最適化のためのインデックス
-- ============================================

-- 複合インデックス（よく使うクエリパターン用）
CREATE INDEX IF NOT EXISTS idx_student_progress_student_id_updated_at 
  ON student_progress(student_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_measurements_student_id_created_at 
  ON measurements(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_students_created_at 
  ON students(created_at DESC);

-- JSONBデータの検索用インデックス（GINインデックス）
CREATE INDEX IF NOT EXISTS idx_student_progress_progress_data_gin 
  ON student_progress USING GIN (progress_data);

-- ============================================
-- 2. データ整合性のための制約
-- ============================================

-- 学生IDの形式チェック（6-10桁の数字）
ALTER TABLE students 
  DROP CONSTRAINT IF EXISTS check_student_id_format;

ALTER TABLE students 
  ADD CONSTRAINT check_student_id_format 
  CHECK (student_id ~ '^[0-9]{6,10}$');

-- 進捗データの構造チェック（JSONBスキーマ検証）
-- 注意: PostgreSQL 14以降で利用可能
-- ALTER TABLE student_progress 
--   ADD CONSTRAINT check_progress_data_structure 
--   CHECK (progress_data ? 'totalSessions' AND progress_data ? 'completedCases');

-- ============================================
-- 3. パーティショニング（大規模データ用）
-- ============================================

-- 注意: パーティショニングは10,000人以上の場合に検討
-- 現在はコメントアウト

-- CREATE TABLE student_progress_2024 PARTITION OF student_progress
--   FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
-- 
-- CREATE TABLE student_progress_2025 PARTITION OF student_progress
--   FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- ============================================
-- 4. アーカイブテーブルの作成
-- ============================================

-- 1年以上古いデータをアーカイブするためのテーブル
CREATE TABLE IF NOT EXISTS student_progress_archive (
  LIKE student_progress INCLUDING ALL
);

CREATE INDEX IF NOT EXISTS idx_student_progress_archive_student_id 
  ON student_progress_archive(student_id);

CREATE INDEX IF NOT EXISTS idx_student_progress_archive_updated_at 
  ON student_progress_archive(updated_at DESC);

-- アーカイブ用のmeasurementsテーブル
CREATE TABLE IF NOT EXISTS measurements_archive (
  LIKE measurements INCLUDING ALL
);

CREATE INDEX IF NOT EXISTS idx_measurements_archive_student_id 
  ON measurements_archive(student_id);

CREATE INDEX IF NOT EXISTS idx_measurements_archive_created_at 
  ON measurements_archive(created_at DESC);

-- ============================================
-- 5. アーカイブ関数の作成
-- ============================================

-- 1年以上古い進捗データをアーカイブする関数
CREATE OR REPLACE FUNCTION archive_old_progress()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  -- アーカイブテーブルに移動
  INSERT INTO student_progress_archive
  SELECT * FROM student_progress
  WHERE updated_at < NOW() - INTERVAL '1 year';
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  
  -- 元のテーブルから削除
  DELETE FROM student_progress
  WHERE updated_at < NOW() - INTERVAL '1 year';
  
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- 1年以上古い測定データをアーカイブする関数
CREATE OR REPLACE FUNCTION archive_old_measurements()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  -- アーカイブテーブルに移動
  INSERT INTO measurements_archive
  SELECT * FROM measurements
  WHERE created_at < NOW() - INTERVAL '1 year';
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  
  -- 元のテーブルから削除
  DELETE FROM measurements
  WHERE created_at < NOW() - INTERVAL '1 year';
  
  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. アクセスログテーブル（オプション）
-- ============================================

-- 監査とセキュリティのためのアクセスログ
CREATE TABLE IF NOT EXISTS access_logs (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT,
  action TEXT NOT NULL, -- 'login', 'save_progress', 'load_progress', 'logout'
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_student_id 
  ON access_logs(student_id);

CREATE INDEX IF NOT EXISTS idx_access_logs_created_at 
  ON access_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_logs_action 
  ON access_logs(action);

-- 古いログを自動削除（90日以上）
CREATE OR REPLACE FUNCTION cleanup_old_access_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM access_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. 統計情報ビューの作成
-- ============================================

-- 学生の進捗統計ビュー
CREATE OR REPLACE VIEW student_progress_stats AS
SELECT 
  s.student_id,
  s.created_at as student_created_at,
  sp.progress_data->>'totalSessions' as total_sessions,
  jsonb_array_length(sp.progress_data->'completedCases') as completed_cases_count,
  (
    SELECT AVG((value->>'accuracy')::numeric)
    FROM jsonb_each(sp.progress_data->'caseAccuracy')
  ) as average_accuracy,
  sp.updated_at as last_activity
FROM students s
LEFT JOIN student_progress sp ON s.student_id = sp.student_id;

-- 全体統計ビュー
CREATE OR REPLACE VIEW overall_stats AS
SELECT 
  COUNT(DISTINCT s.student_id) as total_students,
  COUNT(DISTINCT sp.student_id) as students_with_progress,
  AVG((sp.progress_data->>'totalSessions')::integer) as avg_sessions_per_student,
  SUM(jsonb_array_length(sp.progress_data->'completedCases')) as total_completed_cases,
  (
    SELECT AVG((value->>'accuracy')::numeric)
    FROM student_progress sp2,
    LATERAL jsonb_each(sp2.progress_data->'caseAccuracy')
  ) as overall_average_accuracy
FROM students s
LEFT JOIN student_progress sp ON s.student_id = sp.student_id;

-- ============================================
-- 8. パフォーマンス監視用のクエリ
-- ============================================

-- テーブルサイズの確認
-- SELECT 
--   schemaname,
--   tablename,
--   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- インデックスの使用状況
-- SELECT 
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan as index_scans,
--   idx_tup_read as tuples_read,
--   idx_tup_fetch as tuples_fetched
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- ============================================
-- 9. メンテナンス用の関数
-- ============================================

-- VACUUMとANALYZEを実行（定期的に実行推奨）
-- VACUUM ANALYZE students;
-- VACUUM ANALYZE student_progress;
-- VACUUM ANALYZE measurements;

-- ============================================
-- 10. スケジュール設定（pg_cron拡張が必要）
-- ============================================

-- 注意: pg_cron拡張はSupabase Proプラン以上で利用可能
-- 月次でアーカイブを実行
-- SELECT cron.schedule('archive-old-data', '0 2 1 * *', 'SELECT archive_old_progress(); SELECT archive_old_measurements();');

-- 週次でログをクリーンアップ
-- SELECT cron.schedule('cleanup-access-logs', '0 3 * * 0', 'SELECT cleanup_old_access_logs();');

-- ============================================
-- 使用方法
-- ============================================

-- アーカイブの手動実行:
-- SELECT archive_old_progress();
-- SELECT archive_old_measurements();

-- 統計情報の確認:
-- SELECT * FROM student_progress_stats LIMIT 100;
-- SELECT * FROM overall_stats;

-- アクセスログの確認:
-- SELECT * FROM access_logs ORDER BY created_at DESC LIMIT 100;


