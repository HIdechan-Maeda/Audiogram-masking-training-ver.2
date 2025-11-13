# 全国展開・大規模運用ガイド

## 概要

100人規模から数千人規模へのスケーリングを想定した運用方針です。

## 1. Supabaseのスケーリング計画

### 1.1 プラン選択

| 規模 | Supabaseプラン | 月額料金（目安） | 特徴 |
|------|---------------|----------------|------|
| 100人程度 | Free | $0 | 500MB DB、2GB 帯域幅 |
| 1,000人程度 | Pro | $25/月 | 8GB DB、50GB 帯域幅、バックアップ |
| 5,000人以上 | Team | $599/月 | 100GB DB、無制限帯域幅、優先サポート |

**推奨**: 1,000人を超える場合はProプラン以上を検討

### 1.2 データ量の見積もり

**1学生あたりのデータ量（概算）:**
- `students`テーブル: 約200バイト/学生
- `student_progress`テーブル: 約2-5KB/学生（進捗データ）
- `measurements`テーブル: 約100バイト/測定（1セッションあたり20-50測定）

**1,000学生の場合:**
- students: 200KB
- student_progress: 2-5MB
- measurements: 2-5MB（1セッションあたり）
- **合計**: 約10-20MB（初期）、年間で100-200MB程度

**5,000学生の場合:**
- 初期データ: 50-100MB
- 年間データ: 500MB-1GB程度

### 1.3 パフォーマンス最適化

#### インデックスの追加

```sql
-- パフォーマンス向上のための追加インデックス
CREATE INDEX IF NOT EXISTS idx_student_progress_student_id_updated_at 
  ON student_progress(student_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_measurements_student_id_created_at 
  ON measurements(student_id, created_at DESC);

-- 複合インデックス（よく使うクエリパターン用）
CREATE INDEX IF NOT EXISTS idx_students_created_at 
  ON students(created_at DESC);
```

#### データのアーカイブ戦略

古いデータを定期的にアーカイブテーブルに移動：

```sql
-- アーカイブテーブルの作成
CREATE TABLE IF NOT EXISTS student_progress_archive (
  LIKE student_progress INCLUDING ALL
);

-- 1年以上古いデータをアーカイブ（月次実行）
INSERT INTO student_progress_archive
SELECT * FROM student_progress
WHERE updated_at < NOW() - INTERVAL '1 year';

DELETE FROM student_progress
WHERE updated_at < NOW() - INTERVAL '1 year';
```

## 2. セキュリティ強化

### 2.1 RLS（Row Level Security）の強化

現在の実装では全ユーザーが全データを閲覧可能です。本番環境では制限が必要です。

```sql
-- より厳格なRLSポリシー
DROP POLICY IF EXISTS "Users can view their own student record" ON students;
DROP POLICY IF EXISTS "Users can view their own progress" ON student_progress;

-- 学生は自分のデータのみ閲覧可能
CREATE POLICY "Students can view only their own record"
  ON students FOR SELECT
  USING (student_id = current_setting('app.student_id', true));

CREATE POLICY "Students can view only their own progress"
  ON student_progress FOR SELECT
  USING (student_id = current_setting('app.student_id', true));
```

### 2.2 学生IDの検証

```sql
-- 学生IDの形式チェック（例: 数字のみ、6-10桁）
ALTER TABLE students ADD CONSTRAINT check_student_id_format 
  CHECK (student_id ~ '^[0-9]{6,10}$');
```

### 2.3 レート制限

SupabaseのEdge Functionsまたはアプリケーション側でレート制限を実装：

- ログイン試行: 5回/分
- 進捗保存: 10回/分
- API呼び出し: 100回/分

## 3. 管理機能の実装

### 3.1 講師用ダッシュボード（推奨機能）

以下の機能を実装することを推奨します：

1. **全学生の進捗一覧**
   - 学生ID、完了症例数、平均精度、最終アクセス日時
   - ページネーション（50-100件/ページ）
   - 検索・フィルタ機能

2. **統計情報**
   - 全体の平均精度
   - 症例別の正答率
   - アクティブユーザー数
   - 日次/週次/月次のトレンド

3. **成績エクスポート**
   - CSV形式での一括エクスポート
   - 学生ID、進捗データ、日時を含む

4. **学生管理**
   - 学生の追加・削除
   - 進捗データのリセット
   - バルク操作

### 3.2 管理画面の実装方法

**オプション1: 別の管理画面アプリケーション**
- `/admin` ルートで管理画面を実装
- 講師用の認証（パスワードまたはメール認証）

**オプション2: Supabase Dashboardを活用**
- SQL Editorでクエリを実行
- Table Editorで直接データを確認・編集

**オプション3: サードパーティツール**
- Retool、Appsmithなどのノーコードツールを使用

## 4. コスト管理

### 4.1 Supabaseのコスト見積もり

| 項目 | Free | Pro | Team |
|------|------|-----|------|
| データベース容量 | 500MB | 8GB | 100GB |
| 帯域幅 | 2GB/月 | 50GB/月 | 無制限 |
| APIリクエスト | 500K/月 | 5M/月 | 無制限 |
| バックアップ | なし | 日次 | 日次 |

**1,000学生の場合（Proプラン推奨）:**
- 月額: $25（約3,750円）
- 年間: $300（約45,000円）

**5,000学生の場合（Teamプラン推奨）:**
- 月額: $599（約90,000円）
- 年間: $7,188（約1,080,000円）

### 4.2 コスト削減のヒント

1. **データのアーカイブ**: 古いデータを削除またはアーカイブ
2. **キャッシュの活用**: よく使うデータをキャッシュ
3. **CDNの使用**: 静的ファイルはCDN経由で配信
4. **監視とアラート**: 使用量が上限に近づいたら通知

## 5. パフォーマンス最適化

### 5.1 データベースクエリの最適化

```sql
-- パフォーマンステスト用のクエリ
EXPLAIN ANALYZE
SELECT 
  s.student_id,
  sp.progress_data->>'totalSessions' as total_sessions,
  sp.updated_at
FROM students s
LEFT JOIN student_progress sp ON s.student_id = sp.student_id
ORDER BY sp.updated_at DESC
LIMIT 100;
```

### 5.2 フロントエンドの最適化

- **ページネーション**: 大量データを一度に読み込まない
- **仮想スクロール**: 長いリストを効率的に表示
- **デバウンス**: 進捗保存の頻度を制限（例: 5秒に1回）

### 5.3 CDNとキャッシュ

- VercelやNetlifyなどのCDNを使用
- 静的アセットのキャッシュ設定
- APIレスポンスのキャッシュ（可能な場合）

## 6. 監視とログ

### 6.1 Supabase Dashboardでの監視

- **Database**: クエリパフォーマンス、接続数
- **API**: リクエスト数、エラー率
- **Storage**: 使用量、帯域幅

### 6.2 アラート設定

以下のアラートを設定することを推奨：

1. **データベース容量**: 80%を超えたら通知
2. **APIリクエスト**: 80%を超えたら通知
3. **エラー率**: 5%を超えたら通知
4. **レスポンスタイム**: 1秒を超えたら通知

### 6.3 ログの記録

```sql
-- アクセスログテーブル（オプション）
CREATE TABLE IF NOT EXISTS access_logs (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT,
  action TEXT, -- 'login', 'save_progress', 'load_progress'
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_access_logs_student_id ON access_logs(student_id);
CREATE INDEX idx_access_logs_created_at ON access_logs(created_at DESC);
```

## 7. バックアップと災害対策

### 7.1 Supabaseのバックアップ

- **Proプラン以上**: 日次自動バックアップ
- **手動バックアップ**: 重要なデータは定期的にエクスポート

### 7.2 データエクスポート

```sql
-- 全データのエクスポート（月次推奨）
COPY (
  SELECT 
    s.student_id,
    s.created_at as student_created_at,
    sp.progress_data,
    sp.updated_at as progress_updated_at
  FROM students s
  LEFT JOIN student_progress sp ON s.student_id = sp.student_id
) TO '/tmp/student_data_backup.csv' WITH CSV HEADER;
```

### 7.3 災害復旧計画

1. **RTO（目標復旧時間）**: 24時間以内
2. **RPO（目標復旧時点）**: 1日以内のデータ損失
3. **バックアップの保存場所**: 複数箇所に保存（Supabase + ローカル）

## 8. 段階的な展開計画

### Phase 1: 100人規模（現在）
- ✅ ローカルストレージ + Supabase（Free）
- ✅ 基本的な進捗管理
- ✅ 学生IDログイン

### Phase 2: 1,000人規模
- ⬜ Supabase Proプランに移行
- ⬜ RLSポリシーの強化
- ⬜ パフォーマンス最適化
- ⬜ 基本的な管理機能の実装

### Phase 3: 5,000人規模
- ⬜ Supabase Teamプランに移行
- ⬜ 本格的な管理ダッシュボード
- ⬜ データアーカイブ機能
- ⬜ 監視とアラートの設定
- ⬜ レート制限の実装

### Phase 4: 10,000人以上
- ⬜ マルチリージョン対応の検討
- ⬜ ロードバランシング
- ⬜ より高度な分析機能
- ⬜ 自動スケーリングの設定

## 9. 推奨される追加実装

### 9.1 即座に実装すべき機能

1. **講師用ダッシュボード**（優先度: 高）
   - 全学生の進捗一覧
   - CSVエクスポート機能

2. **セキュリティ強化**（優先度: 高）
   - RLSポリシーの見直し
   - 学生IDの検証

3. **パフォーマンス最適化**（優先度: 中）
   - インデックスの追加
   - クエリの最適化

### 9.2 中期的に実装すべき機能

1. **データアーカイブ**（1,000人を超えたら）
2. **監視とアラート**（Proプラン移行時）
3. **レート制限**（セキュリティ向上）

### 9.3 長期的に検討すべき機能

1. **マルチテナント対応**（複数の学校・組織）
2. **詳細な分析機能**（学習パターンの分析）
3. **モバイルアプリ**（iOS/Android）

## 10. 運用チェックリスト

### 月次チェック
- [ ] データベース使用量の確認
- [ ] APIリクエスト数の確認
- [ ] エラーログの確認
- [ ] バックアップの確認

### 四半期チェック
- [ ] パフォーマンステストの実施
- [ ] セキュリティ監査
- [ ] コスト見直し
- [ ] 機能改善の検討

### 年次チェック
- [ ] データアーカイブの実行
- [ ] プランの見直し
- [ ] 災害復旧計画の見直し
- [ ] 技術スタックの更新検討

## 11. サポートとドキュメント

### 11.1 運用マニュアル

- 学生向けマニュアル
- 講師向けマニュアル
- 管理者向けマニュアル

### 11.2 FAQ

よくある質問と回答をまとめる：
- ログインできない場合の対処法
- 進捗が保存されない場合の対処法
- データの復元方法

## 12. 連絡先とサポート

- **Supabaseサポート**: Pro/Teamプランで優先サポートあり
- **技術的な問題**: GitHub Issuesまたはメール
- **緊急時**: Supabaseのステータスページを確認

---

**最終更新**: 2024年1月
**次回見直し**: 四半期ごと


