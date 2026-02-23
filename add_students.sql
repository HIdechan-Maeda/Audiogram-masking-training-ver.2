-- 学生をSupabaseに登録するスクリプト
-- 実行方法: SupabaseダッシュボードのSQL Editorで実行

-- 1. studentsテーブルに氏名カラムを追加（まだ存在しない場合）
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS name TEXT;

-- 2. 学生を登録
-- 学籍番号237003 氏名池田侑未
INSERT INTO students (student_id, name, created_at, updated_at)
VALUES ('237003', '池田侑未', NOW(), NOW())
ON CONFLICT (student_id) 
DO UPDATE SET 
  name = EXCLUDED.name,
  updated_at = NOW();

-- 学籍番号237038 氏名橋本優花
INSERT INTO students (student_id, name, created_at, updated_at)
VALUES ('237038', '橋本優花', NOW(), NOW())
ON CONFLICT (student_id) 
DO UPDATE SET 
  name = EXCLUDED.name,
  updated_at = NOW();

-- 3. 登録確認（登録された学生を表示）
SELECT 
  student_id,
  name,
  created_at,
  updated_at
FROM students
WHERE student_id IN ('237003', '237038')
ORDER BY student_id;
