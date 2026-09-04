（v2.31から版上げ）

# 整合性チェックリスト（JAMT_v2.32 / 規則改訂同期）

最終更新: 2026-09-04（検証再実行 2026-09-04T13:53Z の数値に同期）

## 数値の単一ソース

| 項目 | 正しい値 | 反映先 |
|------|----------|--------|
| 異常系 | 違反18件＋正常13＝31項目 | 要旨・II-4・III・考察・結語・表2・付録 |
| C5-dip | 程度≥1で4k≥2k+10 かつ 4k≥8k+10 | 要旨・II-3・II-4・表1・表2・付録§1/§3/§4 |
| 突発一側差 | 程度≥1で≥30 dB（0.5/1/2 kHz平均） | 同上＋表3記述統計 |
| 突発対象（規則適合） | 720件 | 表2・付録G3-SuddenLat |
| 突発焦点T7 | 程度2・200件・中央値51.7・床≥30 | 表2注／付録T7・§4注 |
| ムンプス床 | meanAC≥70 かつ 一側差≥55（程度≥1） | II-3・表1・表2・付録 |
| 上下限 | G4a/G4b・9600件 | 表2・II-4・付録 |
| 伝音ABG | パターン別5行（OME／AOM伝音／AOM混合／耳硬化／離断） | 表3・Tables1-3・付録§4 |
| SO処理 | 上限値を数値保持（max+5代入なし） | 付録§3指標定義・II-3一文 |
| Carhart深さ床 | ≥5 dB（C5の10 dBと非対称・理由をII-3に記載） | II-3 |

## 全文検索で潰す語（残存0が目標）

- `12件` / `21項目` / `9項目`
- `≥25 dB`（突発規則としての床）/ `25 dB未満となった例`
- `4 kHz気導閾値＞2 kHz`（旧C5定義）
- `軽度21.7` / `中等度38.3` / `重度58.3`（旧記述統計）
- `ムンプス` で「一側の加算・SO可」のみ（高度床なし）
- 付録§4と表2の矛盾（例: 表が≥30なのに§4中央値21.7）

## その他必須修正

- [x] 文献13→19（AOM分岐・2 kHz超の2箇所）
- [x] 共著者所属No1）／英文 Affiliation
- [x] COI（著者ら・開発関与・特許等なし）
- [x] 図2本文引用
- [x] T8＝540組合せの定義
- [x] T6a/T6cの200件は焦点サンプルである旨
- [x] 周波数リスト（3k/6k未実装）
- [x] PRNG＝LCG
- [x] Tables1-3.docx 表3の複製行除去・パターン別ABG

## ファイル

- 原稿: `manuscripts/manuscript_IgakuKensa_AudioScopeEDU_technical_validity_JAMT_v2.32.docx`
- 表: `manuscripts/Tables1-3.docx`
- 付録md/json: `manuscripts/appendix_IgakuKensa_verification_results.{md,json}`
- Supplement: `manuscripts/Supplement1_verification_v2.32.docx`
- 検証SoT: `verification/IgakuKensa_verification_results.{md,json}`


## v2.32追補（査読指摘対応）

- [x] 英文COIを和文と同内容（authors / no patents・licensing・commercial）
- [x] 付録にISO実装値要約表、T11条件表、異常系B/M表、注記（Amd・18歳未満・第三者でない・規格認証でない・臨床妥当性でない）
- [x] 付録をWord表化（パイプ段落廃止）、SO等を日本語表記
- [x] ムンプス「軽度」表現を学習者UI vs 検証グリッドで書き分け、程度別統計を付録・表3へ
- [x] SO除外の床適合率を別掲
- [x] T11を記述（合否基準なし）
- [x] 許容帯は事前設定＋Wilson法
- [x] C5深さに4k−8kおよびminを併記
- [x] 生成器・検証器の共有関係を本文・付録に明記
