# 学生IDログイン機能のセットアップガイド

## 概要

学生IDを入力してログインし、進捗状況を自動的に管理する機能を実装しました。

## 機能

1. **学生IDログイン**: 学生IDを入力するだけでログインできます
2. **自動進捗保存**: 学習進捗が自動的にSupabaseに保存されます
3. **進捗状況表示**: ダッシュボードで進捗状況を確認できます
4. **デバイス間同期**: 同じ学生IDでログインすれば、どのデバイスからでも進捗を確認できます

## Supabaseテーブルのセットアップ

### 1. Supabaseダッシュボードにアクセス

1. [Supabase Dashboard](https://app.supabase.com/) にログイン
2. プロジェクトを選択

### 2. SQL Editorでテーブルを作成

1. 左メニューから「SQL Editor」を選択
2. `supabase_setup.sql` の内容をコピー＆ペースト
3. 「Run」ボタンをクリックして実行

### 3. テーブル構造

#### `students` テーブル
- `id`: 主キー
- `student_id`: 学生ID（ユニーク）
- `user_id`: Supabase匿名認証のユーザーID
- `created_at`, `updated_at`: タイムスタンプ

#### `student_progress` テーブル
- `id`: 主キー
- `student_id`: 学生ID（外部キー）
- `progress_data`: 進捗データ（JSON形式）
- `created_at`, `updated_at`: タイムスタンプ

#### `measurements` テーブル（既存）
- 測定データを保存するテーブル
- `student_id` カラムが追加されます

## 使用方法

### 学生側

1. アプリケーションを開く
2. 学生IDを入力（例: `2024001`）
3. 「ログイン」ボタンをクリック
4. ログイン後、進捗状況が自動的に表示されます
5. 学習を進めると、進捗が自動的に保存されます

### 講師側（成績確認）

Supabaseダッシュボードから以下のクエリで学生の進捗を確認できます：

```sql
-- 全学生の進捗状況を確認
SELECT 
  s.student_id,
  sp.progress_data,
  sp.updated_at
FROM students s
LEFT JOIN student_progress sp ON s.student_id = sp.student_id
ORDER BY sp.updated_at DESC;

-- 特定の学生の進捗を確認
SELECT 
  progress_data
FROM student_progress
WHERE student_id = '2024001';
```

## 進捗データの構造

`progress_data` は以下のJSON構造を持ちます：

```json
{
  "totalSessions": 5,
  "completedCases": ["A", "B", "C"],
  "caseAccuracy": {
    "A": {
      "total": 20,
      "correct": 18,
      "accuracy": 90,
      "completedAt": "2024-01-15T10:30:00Z"
    },
    "B": {
      "total": 18,
      "correct": 16,
      "accuracy": 89,
      "completedAt": "2024-01-16T14:20:00Z"
    }
  },
  "lastSessionDate": "2024-01-16T14:20:00Z"
}
```

## トラブルシューティング

### ログインできない場合

1. Supabaseのテーブルが正しく作成されているか確認
2. RLS（Row Level Security）ポリシーが正しく設定されているか確認
3. ブラウザのコンソールでエラーメッセージを確認

### 進捗が保存されない場合

1. ネットワーク接続を確認
2. Supabaseの接続設定を確認（`src/supabaseClient.js`）
3. ブラウザのコンソールでエラーメッセージを確認

## セキュリティに関する注意

- 現在の実装では、匿名ユーザーが全データを閲覧可能です
- 本番環境では、RLSポリシーを適切に設定してください
- 学生IDの検証や認証を追加することを推奨します

## 今後の拡張案

1. **講師用ダッシュボード**: 全学生の進捗を一覧表示
2. **成績エクスポート**: CSV形式で成績をエクスポート
3. **詳細な分析**: 症例別の正答率、時間分析など
4. **学生認証**: パスワードやメール認証の追加


