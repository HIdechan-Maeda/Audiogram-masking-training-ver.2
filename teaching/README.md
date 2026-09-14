# teaching — AudioScope EDU 臨床推論課題

言語聴覚療法学科の聴覚検査領域で使う臨床推論課題を、症例定義 JSON から
Word の課題シート（学生用・教員用）として生成する。

症例の生成条件は AudioScope EDU 本体と共有している。EDU が生成する聴力像と、
学生の手元にあるシートの条件は同じ JSON から派生するので、両者がずれることはない。

作業規約は [AGENTS.md](./AGENTS.md) を参照。Cursor / Claude Code はこれに従うこと。

---

## EDU から課題へ落とす（推奨フロー）

1. 講師画面（`?mode=instructor`）で症例を生成し、Tym／ART／DPOAE を確認する。
2. 課題ID（例 `case02`）を入れ、**「臨床推論課題へ書き出す」** で JSON をダウンロードする。
3. リポジトリで取り込む（必要なら `--build` で Word まで）:

```bash
npm run teaching:import -- ~/Downloads/case02_edu_export.json --build
```

生成条件・閾値・他覚的検査所見は EDU の出力が入ります。設問文（stages）や解説（teaching）は
既存テンプレート（初回は case01）を土台に残るので、教員が JSON を編集して調整します。

---

## セットアップ

リポジトリルートで docx を入れる。

```bash
npm install --save-dev docx
```

`package.json` にスクリプトを足しておくと楽。

```json
{
  "scripts": {
    "teaching:build": "node teaching/build/build.mjs",
    "teaching:sync": "node teaching/build/sync-thresholds.mjs"
  }
}
```

PDF で目視確認する場合は LibreOffice と Poppler も入れる（macOS）。

```bash
brew install --cask libreoffice
brew install poppler
```

---

## 使い方

### シートを作る

```bash
npm run teaching:build              # 全症例
npm run teaching:build -- case01    # 指定症例
npm run teaching:build -- --out ~/Desktop/配布用
```

`teaching/dist/` に以下が出る。

```
case01_臨床推論課題_学生用.docx    7ページ
case01_臨床推論課題_教員用.docx    8ページ
```

### 生成条件を変える

`cases/case01.json` の `generation` 節を編集する。

```json
"generation": {
  "profile": "CHL_OME",
  "ageGroup": "30s",
  "sex": "female",
  "severity": 1,
  "seed": 4101
}
```

`seed` を変えたら**必ず**代表閾値を同期してからビルドする。同期しないと、
学生が画面で測る値と教員用の正答（マスキング計算を含む）がずれる。

```bash
npm run teaching:sync -- case01
npm run teaching:build -- case01
```

`profile` に使える値は付録1の実装と揃えてある。

```
Normal
SNHL_Age  SNHL_NoiseNotch  SNHL_Meniere  SNHL_Sudden  SNHL_Mumps
CHL_OME   CHL_AOM          CHL_Otosclerosis  CHL_OssicularDiscontinuity
```

`ageGroup` は `20s`〜`70s`。検証グリッドが 20〜70歳代なので、18歳未満は設定できない。

### マスキングの流儀を変える

`cases/caseNN.json` の `masking` 節だけを触る。式は `build/masking.mjs` に一箇所あり、
学生シートに印刷される式も教員用の正答も、すべてそこから導出される。

```json
"masking": {
  "interauralAttenuationAC": 50,
  "interauralAttenuationBC": 0,
  "safetyMargin": 10,
  "occlusionCorrection": false
}
```

IA を 50 から変えれば、シートの式・教員用の正答表・プラトー幅の一般化まで一斉に追従する。

参考までに、両耳対称なら

```
プラトー幅 = IA − ABG − 2×安全域
```

となり、現在の設定（IA 50 / 安全域 10）では `30 − ABG`。ABG が 30 dB に達すると
プラトーが消え、マスキングジレンマに入る。症例1（ABG 15〜20）は 10〜15 dB の
プラトーが取れるが、レベル2の耳硬化症・耳小骨連鎖離断（ABG 30〜50）では取れない。
この落差を体験させるのがレベル1→2の設計意図。

### 新しい症例を足す

`cases/case01.json` をコピーして番号を振り、中身を差し替える。
`cases/case.schema.json` を参照しているので、Cursor なら補完と検証が効く。

レンダラを触る必要はない。内容はすべて JSON 側にある。

---

## EDU 本体から症例を読む

```js
import { loadCase, toGeneratorOptions } from './teaching/cases/index.mjs';

const c = await loadCase('case01');
const audiogram = generateAudiogram(toGeneratorOptions(c));
```

**EDU 側で症例条件を別途ハードコードしないこと。** 単一の情報源の原則が崩れる。

---

## 生成物を目視確認する

docx を変更したら必ず見る。過去に空ページと罫線結合の不具合が出ている。

```bash
npm run teaching:build -- case01
cd teaching/dist
soffice --headless --convert-to pdf *.docx
pdftoppm -jpeg -r 80 case01_臨床推論課題_学生用.pdf s
open s-1.jpg
```

確認する点：空ページがないか、記入罫線が指定した本数だけ描かれているか、
表がページ途中で分断されていないか、設問の見出しと記入欄が離れていないか。

---

## 未確認の事項

以下は AudioScope EDU の実装状況に依存し、**未確認**である。
運用前に確認し、教員用シートの「要確認事項」を更新すること。

- 4検査が同一症例IDで連動生成されるか。技術論文 v2.32 で出力規則の適合を検証したのは
  純音聴力検査の生成部分のみで、ティンパノ・反射・DPOAE との検査間整合は未検証。
  連動していない場合、`findings` の値は教員が手動提示する運用になる（現状はその前提）。
- 段階提示（S2 → S3 → S4 の順に解禁）が UI で可能か。
- マスキング量に応じた閾値変化（シャドー聴取、オーバーマスキング）が実装されているか。
  未実装ならマスキング計算は紙上にとどまり、プラトーの実機探索はレベル2以降に送る。
- アブミ骨筋反射の非交叉・交叉を分けて提示できるか（レベル3で必須）。
- DPOAE が DP-gram（周波数別 SNR）で表示できるか。pass/refer の2値では推論材料にならない。

また `cases/index.mjs` の `toGeneratorOptions()` と `build/sync-thresholds.mjs` は
`src/engine/generateAudiogram.js` に照合済みである。seed 変更後は必ず
`npm run teaching:sync -- caseNN` を実行すること。

---

## 数値の扱い

本教材の判定値（IA 50 dB、安全域 10 dB、DPOAE の SNR 判定 6 dB、反射消失の ABG 目安
10〜15 dB など）は、いずれも文献により幅があり単一の基準として確定していない。
すべて**教育用の設定値**として扱い、学科で採用している教科書の値に合わせて固定する。
技術論文で採った方針と揃えておけば、後に教育効果研究へ展開する際も説明が一貫する。

患者・研究参加者の個人情報はこのリポジトリに入れない。症例はすべて合成データまたは
教材用の架空の人物である。
