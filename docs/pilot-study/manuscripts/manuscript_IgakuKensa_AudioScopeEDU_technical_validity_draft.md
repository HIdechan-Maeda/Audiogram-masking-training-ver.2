# 年齢・疾患に応じた教育用純音聴力像自動生成システムの開発と出力規則の検証

| 項目 | 内容 |
|------|------|
| 論文区分 | 技術論文 |
| 投稿先 | 医学検査（日本臨床衛生検査技師会） |
| 版 | v2.0（2026-08-10）・draft(7)密度＋意義の明確化 |

---

## 書誌情報（案）

**和文標題**  
年齢・疾患に応じた教育用純音聴力像自動生成システムの開発と出力規則の検証

**英文標題**  
Development and Output-Rule Verification of an Educational System for Automatic Generation of Age- and Disease-Conditioned Pure-Tone Audiograms

**ランニングタイトル（和文・30字以内）**  
教育用聴力像自動生成と出力規則の検証

**著者（案）**  
前田　秀彦【共著者・表記は提出時に確定】

**英文著者名（案）**  
Hidehiko Maeda

**所属（案）**  
【和文・英文所属は提出時に記入】

**連絡先（筆頭著者）**  
【住所・電話・e-mailは提出時に記入】

**キーワード（5語以内）**  
1. 純音聴力検査 / pure-tone audiometry  
2. 症例自動生成 / automatic case generation  
3. ISO 7029:2017  
4. 出力規則 / output rules  
5. 検査教育 / laboratory education  

---

## 和文要旨（600字以内）

【目的】年齢・疾患別パターン・難聴の程度を組み合わせ、学習者には生成条件を知らせずに多様な教育用純音聴力像を提示できる規則生成方式を構築し、あらかじめ設定した出力規則への適合を確認すること。【方法】教育用Web教材AudioScope EDUに、ISO 7029:2017に基づく年齢・性別の基準帯、疾患別パターン（正常および9種類）、程度（なし〜重度の4段階）を実装した。学習者画面では条件を非提示とし、教員用途では同一症例を再現できる。正常および9種類の疾患パターンについて、6年齢群・男女・4段階の程度を組み合わせ、各条件で20例を生成した（合計9,600例）。5 dB刻み、気骨導関係、疾患別の特徴、程度による変化などを、生成プログラムとは別に作った検証スクリプトで確認した。【成績】確認した規則はいずれも適用対象で全例適合した。図2に示すように、年齢・疾患・程度により異なる聴力像が生成された。同一条件では同じ聴力像が再現された。耳硬化症のCarhart様変化は200回中160回（80.0%）に付与され、付与例はすべて設定した形を満たした。【結論】固定症例を補完する、規則に基づく教育用聴力像の自動生成方式を構築した。本稿は教育効果や臨床的妥当性を証明するものではなく、今後の専門家評価・教育効果研究の技術的基盤である。

---

## 英文要旨（投稿前に英文校閲・250 words以内）

**Objective:** To construct a rule-based generation method that combines age, disease-specific patterns, and severity to present diverse educational pure-tone audiograms without disclosing generation conditions to learners, and to verify conformance to predefined output rules.  
**Methods:** We implemented a generation engine in AudioScope EDU based on ISO 7029:2017 educational age–sex reference bands, disease-specific patterns (1 normal and 9 disease types), and a four-level severity parameter. Learner interfaces conceal these conditions, whereas faculty can reproduce the same case. We generated 20 examples for each combination of 6 age bands, both sexes, and 4 severity levels across the 10 patterns (9,600 audiograms). A verification script implemented separately from the generator checked 5-dB rounding, air–bone relationships, disease-specific features, severity-related changes, and reproducibility.  
**Results:** All applicable rule checks were fully satisfied. Representative outputs differed by age, disease pattern, and severity. Identical conditions reproduced identical audiograms. A Carhart-like feature in otosclerosis was expressed in 160 of 200 checks (80.0%), and all expressed cases met the predefined shape.  
**Conclusions:** We constructed a rule-based automatic generation method that complements fixed-case teaching materials. This work does not establish educational effectiveness or clinical validity; rather, it provides a technical foundation for subsequent expert evaluation and educational studies.

---

# 本文

## Ⅰ．序・目的

純音聴力検査は、難聴の有無・左右・型（感音／伝音／混合）を把握するための基本検査であり、気導および骨導閾値の読み取りと気骨導差（air–bone gap; ABG）の解釈は、臨床検査技師の養成および卒後教育における重要な到達目標である。実際の検査場面では、加齢に伴う高音域低下、中耳炎などにみられる伝音パターン、騒音性難聴の切痕、一側性の急性感音難聴など、多様な聴力像に直面する。したがって学習者には、単一の「典型例」を暗記するだけでなく、未知のオージオグラムに対して測定手順を組み立て、結果を解釈する訓練が求められる。

しかし教育現場では、防音室やオージオメータ、被験者役の確保、指導者の帯同といった制約が大きく、年齢や疾患を幅広くカバーした症例を十分な回数だけ提示することは容易でない。紙や電子ファイルの固定症例は再現性に優れる一方、症例数が限られ、事前に疾患名や難聴の程度が分かってしまうと、「答えを知ったうえで測る」練習になりやすい。学習効果の観点からは、測定前には聴力像の型を知らせず、測定後に正答照合で振り返る方が、実臨床の検査フローに近い。

さらに純音聴力検査では、気導・骨導の閾値測定に加え、必要に応じたマスキングの判断と実施が不可欠である。マスキングは左右差や大きなABGがある症例で特に重要となるが、本稿ではマスキング操作の教育効果自体は扱わない。仮想の聴力像を規則に従って大量に生成できれば、測定手順の練習にとどまらず、マスキング判断を反復して学ぶ土台にもなりうる、という位置づけにとどめる。

国外では、Web型や仮想環境の聴力計シミュレータが報告され、操作練習や一部の教育評価に用いられてきた1–4)。既存報告は主として検査操作や手続き訓練を扱っている。本システムは、年齢・疾患別パターン・難聴程度を組み合わせた聴力像の規則生成に焦点を当てた。国内の臨床検査教育の文脈では、ISO 7029に基づく年齢・性別の基準帯を土台に、疾患別パターンと程度を組み合わせて気導・骨導閾値を規則的に自動生成し、学習者にはその条件を秘匿したまま測定演習させるシステムについての技術報告は十分でない。

そこで本研究では、教育用Web教材 AudioScope EDU の純音聴力像自動生成システムを対象とし、次を目的とした。年齢、疾患別パターン、難聴の程度に応じた教育用の気導・骨導閾値を、あらかじめ設定した規則に従って自動生成できること。あわせて、学習者には生成条件を知らせず、教員には同一症例の再現を可能にし、設定した出力規則に実装が従うことを組合せ検証で確認すること。

本稿は、教育効果を証明する研究でも、生成した聴力像の臨床的妥当性を証明する研究でもない。多様な聴力像を自動生成する仕組みを開発し、意図した規則どおりに動くことを示す基盤的な技術報告である。専門家による臨床的妥当性および操作性の評価、ならびに教育効果の検証は別報で扱う。

---

## Ⅱ．方法

### 1．設計方針

対象はAudioScope EDUの純音聴力像自動生成システムである。主な生成条件は年齢（性別）、疾患別の聴力像パターン、難聴の程度である。学習者向け画面ではこれらを選択・表示せず、内部で選ぶ。教員や検証の用途では、条件を明示して指定できる。数値は周波数別の上下限内で5 dB刻みとし、同じ乱数条件を指定すれば同じ聴力像を再出力できる。本稿で確認するのは設定した出力規則への適合であり、生成像の臨床的妥当性は扱わない。

生成の流れは次のとおりである。条件の指定または内部選択 → ISO 7029:2017に基づく基準帯の参照 → 疾患別パターンの変換と程度による深さの付与 → 上下限・5 dB丸め・気骨導関係の拘束 → 気導・骨導閾値の出力 → オージオグラム画面への提示。

### 2．ISO 7029:2017基準帯と周波数

性別と年齢グループ（20、30、40、50、60、70歳代）ごとに、ISO 7029:2017<sup>5)</sup>に基づく中央値およびばらつき指標を、教育用に年齢グループ化した参照値として用いた。規格の表そのものは転載しない。気導は125〜8000 Hz、骨導は250〜4000 Hzを主な対象とした。参照値に概ね±5〜10 dBの確率的変動を加えた後、5 dBへ丸めた。この変動幅は測定誤差の厳密なモデルではなく、教育症例が過度に定型化するのを避けるための著者設定である。

本稿はISO 7029:2017を根拠とし、Amd 1:2024は未反映とした。18歳未満は規格適用外のため、最若年成人帯（20歳代相当）へフォールバックした。

### 3．疾患別の聴力像パターンと程度

疾患の定性的特徴は文献を参考にし、実装の具体的なdB値（例：突発性難聴のおよそ25／45／65 dB、正常例のABG上限15 dB、病側と対側の差≥25 dB、耳硬化症のCarhart様変化を80%の確率で付与）は、教育上識別可能な差が出るよう著者らが設定した値である（表1）。程度（なし／軽度／中等度／重度）は型を保ったまま閾値上昇の深さを変える教材用の区分であり、WHO等の平均聴力等級と同一ではない。

感音難聴では、骨導が気導より大きく悪くならないよう、骨導≤気導＋5 dBに拘束した。伝音難聴では、疾患ごとに指定した対象周波数で最小の気骨導差を保証した。気導が周波数別上限付近に達した場合は、骨導をスケールアウト（無反応）として扱い、画面上は矢印記号に加え教材用に「SO」を併記しうる。突発性難聴およびムンプス難聴では、程度に応じてスケールアウトを付与しうる（詳細は電子付録1）。

耳硬化症では、2 kHzの骨導閾値が隣接周波数より5 dB以上上昇するCarhart様変化を、80%の確率で付与した。乱数の詳細と判定式は電子付録1に示した。

**表1．疾患別パターンの要約**

| パターン | 文献上の参考特徴 | 実装した主な規則（著者設定を含む） |
|----------|------------------|------------------------------------|
| 正常 | 年齢相応<sup>5)</sup> | 過大なABGを避ける（≤15 dB） |
| 加齢性感音難聴 | 高音障害<sup>5,6)</sup> | 高音域の加算 |
| 騒音性難聴 | 4 kHz切痕<sup>7,8)</sup> | 程度が軽度以上で4 kHz気導＞2 kHz気導 |
| メニエール病 | 低音優位<sup>9)</sup> | 低音域の加算 |
| 突発性難聴 | 一側性急性<sup>10)</sup> | 一側の加算・程度に応じてSO可 |
| ムンプス難聴 | 一側高度<sup>11)</sup> | 一側の加算・SO可 |
| 滲出性中耳炎 | 伝音ABG<sup>12)</sup> | 指定周波数で最小ABG |
| 急性中耳炎 | 急性期伝音<sup>13)</sup> | 最小ABG（滲出性より大きめ） |
| 耳硬化症 | Carhart様<sup>14–16)</sup> | 80%の確率でCarhart様変化を付与 |
| 耳小骨連鎖離断 | 大きいABG<sup>17)</sup> | 大きめの最小ABG |

### 4．出力規則の検証

適合の判定は、生成プログラムとは別に実装した検証スクリプトで行った（外部の研究機関による第三者検証ではない）。

正常および9種類の疾患パターンについて、6年齢群、男女、4段階の難聴程度を組み合わせ、各条件で20例を生成した。合計9,600例について、5 dB刻み、気骨導関係、疾患別の特徴、難聴程度による変化などを確認した。規則ごとに、その規則が適用される例だけを分母とした（例：正常960例、感音4,800例、伝音3,840例、騒音性難聴で程度が軽度以上720例）。検証項目の識別番号や判定式の詳細は電子付録1に示した。

あわせて、次の点を重点的に確認した。加齢による高音域の上昇、突発性難聴の一側差（中等度に固定した200例）、難聴の程度を上げると閾値が下がらないこと、同じ乱数条件での再現、および耳硬化症のCarhart様変化（200回中の付与回数と、付与された例での形）。

記述統計では、伝音のABG、騒音切痕の深さ、Carhart様変化の深さ、突発性難聴およびムンプス難聴の一側差を要約した。伝音ABGの最小値に−5 dBが含まれ得る理由は次のとおりである。最小ABGは疾患ごとに指定した対象周波数でのみ保証した。一方、記述統計には保証対象外を含む全骨導周波数を集計したため、共通拘束「骨導≤気導＋5 dB」の下限に相当するABG＝−5 dBを含んだ。最小ABGを保証した周波数での違反は認めなかった。

なお、突発性難聴の一側差について、中等度に固定した重点確認（200例すべてが25 dB以上）と、軽度を含む全組合せの記述統計とは対象が異なる。程度別にみると、中等度および重度では全例が25 dB以上であり、25 dB未満は主に軽度に由来する。

実施環境は Node.js v22.20.0、macOS 26.5.2、プログラム audioscope-edu 1.0.0 とした。詳細数値は電子付録1に同梱した。

原稿ドラフトの構成検討に生成AI（OpenAI ChatGPT、およびCursor上のAIアシスタント）を補助的に用いた。アルゴリズム実装、検証実行、数値確定は著者が行った。

---

## Ⅲ．成績

年齢・疾患・程度に応じた聴力像を自動生成し、学習者には条件を秘匿して提示できるシステムを実装した。図2は、年齢・疾患パターン・程度の違いにより、実際に異なる聴力像が生成されることを示す代表例である（正答照合画面のため緑色。測定入力時は右＝赤・左＝青）。

**表2．出力規則への適合結果**

| 確認した内容 | 対象数 | 結果 |
|--------------|--------|------|
| 指定した年齢・疾患・程度の反映 | 9,600例 | 全例適合 |
| 5 dB刻みでの出力 | 9,600例 | 全例適合 |
| 正常例における過大なABGの回避 | 960例 | 全例適合 |
| 感音難聴の気骨導関係 | 4,800例 | 全例適合 |
| 伝音難聴の気骨導差 | 3,840例 | 全例適合 |
| 騒音性難聴の4 kHz切痕（程度が軽度以上） | 720例 | 全例適合 |
| 耳硬化症のCarhart様変化の形（付与された例） | 576例 | 全例適合 |
| 加齢による高音域上昇 | 200例 | 全例適合（差の中央値42.5 dB） |
| 突発性難聴の一側差≥25 dB（中等度） | 200例 | 全例適合 |
| 難聴程度を上げたときの閾値の非減少 | 540組合せ | 全例適合 |
| 同一条件での再現 | 200例 | 全例一致 |
| 耳硬化症のCarhart様変化の付与 | 200例 | 160回（80.0%）に付与 |

耳硬化症のCarhart様変化は、200回の検証では160回（80.0%）に付与され、発現した全例で設定した形を満たした。全組合せのうち程度が軽度以上の耳硬化症720例でも、576例（80.0%）に付与された。

**表3．自動生成した聴力像の特徴（要約）**

| 指標 | 要約 |
|------|------|
| 年齢差（70歳代−20歳代, 4–8 kHz） | 中央値42.5 dB（四分位範囲37.5–47.5） |
| 突発性難聴の一側差・軽度（240例） | 中央値21.7 dB（四分位範囲20.0–23.3）※多くが25 dB未満 |
| 突発性難聴の一側差・中等度（240例） | 中央値38.3 dB（範囲26.7–48.3）※全例≥25 dB |
| 突発性難聴の一側差・重度（240例） | 中央値58.3 dB（四分位範囲55.0–70.0）※全例≥25 dB |
| ムンプス難聴の一側差（程度が軽度以上, 720例） | 中央値88.3 dB（四分位範囲65.0–106.7） |
| 伝音ABG（全骨導周波数） | 中央値15 dB（範囲−5〜40） |
| 騒音切痕の深さ | 中央値20 dB |
| Carhart様変化の深さ（付与された例） | 中央値7.5 dB |

---

## Ⅳ．考察

既存報告は主として検査操作や手続き訓練を扱っている1–4)。本研究の技術的意義は、年齢・疾患別パターン・難聴程度を組み合わせた生成方式を構築し、その規則、著者設定値および検証条件を明示した点にある。あわせて、学習者への条件秘匿と教員による同一症例の再現を両立し、9,600例の組合せで設定した出力規則への適合を確認した。高い適合率のみで、生成規則の臨床的妥当性が示されるわけではない。図2に示すように、年齢・疾患・程度によって実際に異なる聴力像が生成される。

教育上は、固定症例を補完する形で多様な聴力像を提示でき、疾患名を秘匿した測定練習や、左右差・ABGを含む症例の反復、さらにはマスキング判断練習の土台にも展開しうる。教員は同じ乱数条件を指定すれば同一症例を再現できる。ただし本稿は、マスキング操作や教育効果そのものを検証していない。

限界として、自ら定義した規則への適合確認にとどまり、外部の第三者検証ではない。具体的なdB値やスケールアウトの付与条件の多くは著者設定であり、生成した聴力像の臨床的妥当性の証明ではない。疾患パターンは教育用に単純化しており、ISO 7029は2017年版（Amd未反映）、程度ラベルはWHO等級と同一ではない。専門家評価および教育効果の検証は別報で扱う。

---

## Ⅴ．結語

年齢・疾患・程度に応じた教育用純音聴力像の自動生成システムを開発し、設定した出力規則への適合を確認した。固定症例を補完する規則生成方式として、条件秘匿と同一症例の再現を両立した。本稿は教育効果や臨床的妥当性を主張するものではなく、AudioScope EDUに関する今後の専門家評価・教育効果研究のための技術的基盤を示す報告である。

---

## 倫理

本研究は人を対象とする生命科学・医学系研究には該当せず、患者情報および個人情報を使用していない。検証データはプログラムによる合成閾値のみである。

## 利益相反

著者はAudioScope EDUの開発に関与している。本研究に関して開示すべき利益相反はない。

## 文献

1) Lieberth AK, Martin DR: The instructional effectiveness of a web-based audiometry simulator. J Am Acad Audiol, 2005; 16: 79–84.  
2) Araújo DP, et al: Virtual audiometer: technology integrated to teaching. CoDAS, 2021; 33: e20200287.  
3) Calandruccio L, Weidman D: Online simulation education for audiometry training. Am J Audiol, 2022; 31: 1–10.  
4) Oyarzún-Díaz PA, et al: Validación y optimización de un prototipo de simulador de audiometría para estudiantes de fonoaudiología (SAEF) en tiempos de pandemia. Form Univ, 2023; 16: 45–54.  
5) International Organization for Standardization: Acoustics—Statistical distribution of hearing thresholds related to age and gender. ISO 7029:2017, ISO, Geneva, 2017.  
6) Gates GA, Mills JH: Presbycusis. Lancet, 2005; 366: 1111–1120.  
7) McBride DI, Williams S: Audiometric notch as a sign of noise induced hearing loss. Occup Environ Med, 2001; 58: 46–51.  
8) Coles RR, Lutman ME, Buffin JT: Guidelines on the diagnosis of noise-induced hearing loss for medicolegal purposes. Clin Otolaryngol Allied Sci, 2000; 25: 264–273.  
9) Lopez-Escamez JA, et al: Diagnostic criteria for Menière’s disease. J Vestib Res, 2015; 25: 1–7.  
10) Chandrasekhar SS, et al: Clinical practice guideline: sudden hearing loss (update). Otolaryngol Head Neck Surg, 2019; 161: S1–S45.  
11) Hashimoto H, et al: An office-based prospective study of deafness in mumps. Pediatr Infect Dis J, 2009; 28: 173–175.  
12) Rosenfeld RM, et al: Clinical practice guideline: otitis media with effusion (update). Otolaryngol Head Neck Surg, 2016; 154: S1–S41.  
13) Kasemodel ALP, et al: Sensorineural hearing loss in the acute phase of a single episode of acute otitis media. Braz J Otorhinolaryngol, 2020; 86: 767–773.  
14) Carhart R: Clinical application of bone conduction audiometry. Arch Otolaryngol, 1950; 51: 798–808.  
15) Kashio A, et al: Carhart notch 2-kHz bone conduction threshold dip: a nondefinitive predictor of stapes fixation in conductive hearing loss with normal tympanic membrane. Arch Otolaryngol Head Neck Surg, 2011; 137: 236–240.  
16) Wegner I, et al: Pure-tone audiometry in otosclerosis: insufficient evidence for the diagnostic value of the Carhart notch. Otolaryngol Head Neck Surg, 2013; 149: 528–532.  
17) Merchant SN, McKenna MJ, Mehta RP, et al: Middle ear mechanics of Type III tympanoplasty (stapes columella): II. Clinical studies. Otol Neurotol, 2003; 24: 186–194.  
18) Acoustical Society of America / American National Standards Institute: Specification for audiometers. ASA/ANSI S3.6-2025, ASA, New York, 2025.  
19) International Organization for Standardization: Acoustics—Audiometric test methods—Part 1: Pure-tone air and bone conduction audiometry. ISO 8253-1:2010, ISO, Geneva, 2010.

## 図表説明

- **図1** 教育用純音聴力像の自動生成フロー（学習者には条件非提示）  
- **図2** 年齢・疾患・程度により異なる自動生成代表例（正答照合画面のため緑色。測定時は右＝赤・左＝青）  
  - (a) 両耳正常（40歳代）  
  - (b) 耳硬化パターン（20歳代）  
  - (c) 急性中耳炎パターン（20歳代）  
  - (d) 突発性難聴パターン（50歳代）  
  - (e) ムンプス難聴パターン（スケールアウト表示例）  

注: 数dB程度の気骨導のずれは定型化回避のための確率的変動である。図2は多様な聴力像が規則生成されることの視覚的例示であり、臨床的妥当性の証明ではない。

## 電子付録1

疾患別規則の要約、検証ログ（適合率、記述統計、実行環境、検証ID、乱数・Carhart様・突発／ムンプスのスケールアウト確率、Wilson信頼区間）を同梱する。  
`appendix_IgakuKensa_verification_results.md` / `.json`

---

## 作業メモ（提出時削除）

v2.0: draft(7)密度に戻し、draft(8)の意義（技術的基盤・条件秘匿・再現・固定症例の補完）のみ採用。比較表削除。SO確率は本文から付録へ。著者を前田秀彦に修正。「移行」を「補完」に変更。自己否定的な適合率表現を修正。文字数削減（本文約5,400字）。
