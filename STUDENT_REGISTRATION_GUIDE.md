# 学生登録ガイド

## 概要
Supabaseに学生を登録して、HearSimを2名の学生が使用できるようにする手順です。

## 登録する学生
- **学籍番号**: 237003 / **氏名**: 池田侑未
- **学籍番号**: 237038 / **氏名**: 橋本優花

## 手順

### 方法1: SQL Editorで直接実行（推奨）

1. **Supabaseダッシュボードにアクセス**
   - https://app.supabase.com/ にログイン
   - プロジェクトを選択

2. **SQL Editorを開く**
   - 左メニューから「SQL Editor」を選択
   - 「New query」をクリック

3. **SQLスクリプトを実行**
   - `add_students.sql` の内容をコピー＆ペースト
   - 「Run」ボタンをクリックして実行

4. **登録確認**
   - 実行後、結果に2名の学生が表示されれば成功です

### 方法2: Table Editorで手動登録

1. **Supabaseダッシュボードにアクセス**
   - https://app.supabase.com/ にログイン
   - プロジェクトを選択

2. **Table Editorを開く**
   - 左メニューから「Table Editor」を選択
   - `students` テーブルを選択

3. **学生を追加**
   - 「Insert」→「Insert row」をクリック
   - 以下の情報を入力：
     - **student_id**: `237003`
     - **name**: `池田侑未`
   - 「Save」をクリック
   - 同様に2人目の学生も追加：
     - **student_id**: `237038`
     - **name**: `橋本優花`

## 学生の使用方法

登録後、学生は以下の手順でHearSimを使用できます：

1. **アプリケーションを開く**
   - `http://localhost:3000` にアクセス（開発環境の場合）

2. **学生IDでログイン**
   - 学籍番号を入力（例: `237003` または `237038`）
   - 「ログイン」ボタンをクリック

3. **学習開始**
   - ログイン後、進捗状況が自動的に表示されます
   - 症例を選択して学習を開始できます
   - 進捗は自動的にSupabaseに保存されます

## 確認方法

### SQLで確認
```sql
-- 全学生の一覧を確認
SELECT student_id, name, created_at, updated_at
FROM students
ORDER BY student_id;
```

### Table Editorで確認
- Table Editorで `students` テーブルを開く
- 登録された学生が表示されていることを確認

## トラブルシューティング

### エラー: "relation 'students' does not exist"
- `supabase_setup.sql` を先に実行してテーブルを作成してください

### エラー: "duplicate key value violates unique constraint"
- 学生は既に登録されています
- 更新したい場合は、`ON CONFLICT` 句を使用したSQLを実行してください

### 学生がログインできない
- 学籍番号が正しく入力されているか確認
- Supabaseの認証設定を確認
- ブラウザのコンソールでエラーメッセージを確認

## 注意事項

- 学籍番号は一意である必要があります（重複不可）
- 学生がログインすると、自動的に `user_id` が設定されます
- 進捗データは `student_progress` テーブルに保存されます
