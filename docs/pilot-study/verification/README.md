# 技術検証フォルダ（医学検査原稿用）

## 検証ステータス（2026-09-18）

| 項目 | 状態 |
|------|------|
| 正解表凍結（RULE_SPEC） | 完了 |
| 9,600件 自動検証 | 完了（100%、最新実行 2026-09-18T07:49:19.098Z） |
| 異常データ検出 | 完了（31/31） |
| 手計算24例 | **完了（著者再照合・全例OK）** |
| 異seed多様性（T11） | **完了**（3条件×200、ユニーク200/200） |
| 電子付録 | `Supplement1_verification_v2.43.docx`（最新結果のみ） |

完了記録: [`HANDCHECK_completion.md`](./HANDCHECK_completion.md)

## 手順（参考）

1. [`RULE_SPEC_verification_criteria.md`](./RULE_SPEC_verification_criteria.md) を読み、数値に異論があれば先に直す（凍結）。
2. [`GPT_review_pack.md`](./GPT_review_pack.md) の **Prompt A** を ChatGPT に投げる（生成コードは渡さない）。
3. 続けて **Prompt B**（反例）。必要なら **Prompt C**（検証スクリプト）。
4. 結果を [`GPT_review_log_TEMPLATE.md`](./GPT_review_log_TEMPLATE.md) に残す。
5. [`HANDCHECK_and_mutation_checklist.md`](./HANDCHECK_and_mutation_checklist.md) の手計算と異常データ検出を進める。  
   - 異常系: [`NEGATIVE_TEST_cases.md`](./NEGATIVE_TEST_cases.md)／`npm run verify:audiogram:mutations`（済・28/28、違反16件）  
   - 手計算: [`HANDCHECK_cases_24.md`](./HANDCHECK_cases_24.md)（**済・全例OK**）

## 既存の実行結果

- [`IgakuKensa_verification_results.md`](./IgakuKensa_verification_results.md)
- 原稿付録: `../manuscripts/appendix_IgakuKensa_verification_results.md`

## コマンド

```bash
npm run verify:audiogram
npm run verify:audiogram:mutations   # 異常データ検出（検証関数が違反を落とすか）
```

## 注意

GPT確認 ≠ 独立検証。論文には補助的レビュー／反例候補の確認と書く。
