# CSV症例データベースの構造

## ファイル命名規則
疾患ごとにCSVファイルを作成します。
- `normal.csv` - 正常聴力
- `AOM.csv` - 急性中耳炎
- `OME.csv` - 滲出性中耳炎
- `MUMPS.csv` - ムンプス難聴
- `SUDDEN.csv` - 突発性難聴
- `MENIERE.csv` - メニエール病
- `OTOSCLEROSIS.csv` - 耳硬化症
- `NOISE.csv` - 騒音性難聴
- `PRESBYCUSIS.csv` - 加齢性難聴
- `OSSICULAR_DISCONTINUITY.csv` - 耳小骨離断
- `ACOUSTIC_TRAUMA.csv` - 音響外傷

## CSVファイルの構造

### 必須カラム
- `caseId` - 症例ID（数値）
- `chiefComplaint` - 主訴（文字列）
- `hpi` - 病歴（文字列）
- `otoscopy` - 鼓膜所見（文字列）
- `tympanogram` - ティンパノグラム型（A/B/C/As/Adなど）

### AC値カラム（周波数別）
- `ac_125`, `ac_250`, `ac_500`, `ac_1000`, `ac_2000`, `ac_4000`, `ac_8000`
- 数値（dB HL）または空欄（測定なし）

### BC値カラム
- `bc_all` - 全周波数共通のBC値（数値、dB HL）
- または個別に `bc_250`, `bc_500`, `bc_1000`, `bc_2000`, `bc_4000` を指定可能

### オプションカラム
- `age_min` - 年齢範囲（最小値）
- `age_max` - 年齢範囲（最大値）
- `gender` - 性別（男性/女性）
- `notes` - 備考

## CSV例

```csv
caseId,chiefComplaint,hpi,otoscopy,tympanogram,ac_125,ac_250,ac_500,ac_1000,ac_2000,ac_4000,ac_8000,bc_all
1,強い耳痛（夜間に増悪）,2日前から発熱38.5℃、感冒様症状に続いて右耳痛が急速に増悪。難聴感あり。,右鼓膜は発赤・膨隆、光錐消失、鼓膜拍動所見あり,C→B,30,35,40,40,35,25,10
2,耳がズキズキ痛む／聞こえにくい,上気道炎後、左耳痛と難聴。鎮痛薬で一時軽快も再燃。,左鼓膜は混濁・膨隆、血管拡張、可動性著明低下,B,25,30,35,35,30,25,10
```

## 使用方法

CSVファイルは自動的にJSONに変換されて読み込まれます。
`loadCaseDatabase()` 関数を使用して症例データを取得できます。

