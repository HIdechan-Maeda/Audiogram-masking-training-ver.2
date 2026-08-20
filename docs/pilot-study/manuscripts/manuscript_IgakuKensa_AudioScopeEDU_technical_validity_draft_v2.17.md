# 年齢・疾患に応じた教育用オージオグラム自動生成システムの開発と出力規則の検証

| 項目 | 内容 |
|------|------|
| 論文区分 | 技術論文 |
| 投稿先 | 医学検査（日本臨床衛生検査技師会） |
| 版 | v2.17（2026-08-17）・査読想定の補強：9600の数え方、突発25 dB、ABG−5、ISO気導、考察 |

---

## 書誌情報（案）

**和文標題**  
年齢・疾患に応じた教育用オージオグラム自動生成システムの開発と出力規則の検証

**英文標題**  
Development and Verification of a Rule-Based System for Generating Educational Pure-Tone Audiograms According to Age and Disease Pattern

**ランニングタイトル（和文・30字以内）**  
教育用オージオグラム自動生成と出力規則の検証

**著者（案）**  
前田　秀彦【共著者・表記は提出時に確定】

**英文著者名（案）**  
Hidehiko Maeda

**所属**  
北海道医療大学リハビリテーション科学部言語聴覚療法学科  
Department of Speech-Language-Hearing Therapy, School of Rehabilitation Sciences, Health Sciences University of Hokkaido

**連絡先（筆頭著者）**  
【住所・電話・e-mailは提出時に記入】

**キーワード（5語以内）**  
1. 純音聴力検査 / pure-tone audiometry  
2. オージオグラム / audiogram  
3. オージオグラム自動生成 / automatic audiogram generation  
4. ISO 7029:2017  
5. 検査教育 / clinical laboratory education  

---

## 和文要旨（600字以内）

【目的】年齢・疾患別パターン・難聴の程度を組み合わせ、学習者には生成条件を知らせずに多様な教育用オージオグラムを提示できる規則生成方式を構築し、出力規則への適合を確認すること。【方法】AudioScope EDUに、ISO 7029:2017に基づく年齢・性別の基準帯、教育用の疾患パターン（正常および9種類）、程度（なし〜重度の4段階）を実装した。学習者画面では条件を非提示とし、システム内部で無作為に選択するよう設計した。6年齢群・男女・4段階の程度を組み合わせ、各条件で20件を生成した（合計9,600件）。各条件20件は統計的標本数ではなく、組合せ網羅と確率的変動下での規則確認のためとした。5 dB刻み、気骨導関係、疾患別の特徴などを、生成プログラムとは別の検証スクリプトで確認した。あわせて、著者が仕様に基づき事前定義した規則違反データで異常系テストを行い、検証器の検出能を確認した。【成績】9,600件の適用対象はすべて設定規則に適合した。著者定義の規則違反14件はすべて不適合と判定された。同一入力200件は全件再出力一致し、同一条件で乱数初期値のみ変えた200件はいずれも異なる閾値セットとなった。【結論】固定症例を補完する規則生成方式を構築した。本稿は教育効果や臨床的妥当性を証明するものではなく、今後の専門家評価・教育効果研究の技術的基盤である。

---

## 英文要旨（250 words以内）

**Objective:** To develop a rule-based system for generating diverse educational audiograms by combining age, disease-specific patterns, and hearing-loss severity while concealing generation conditions from learners, and to verify conformity with predefined output rules.

**Methods:** A generation module in AudioScope EDU was implemented using age- and sex-specific reference ranges based on ISO 7029:2017, ten educational patterns (normal hearing and nine disease patterns), and four severity levels from none to severe. Generation conditions were hidden from learners and selected randomly by the system. Twenty audiograms were generated for each combination of six age groups, two sexes, four severity levels, and ten patterns, yielding 9,600 audiograms. The 20 cases per condition were used for combinatorial coverage and rule verification under stochastic variation, not as a statistical sample size. A verification script developed separately from the generation program assessed 5-dB steps, air–bone relationships, pattern-specific features, and other predefined rules. Negative testing with 14 author-defined rule-violating datasets was also performed.

**Results:** All applicable checks across the 9,600 audiograms conformed to the predefined rules, and all 14 rule violations were correctly detected. In 200 reruns with identical inputs, including the random seed, threshold sets were reproduced exactly. In another 200 runs in which only the random seed was changed, all threshold sets differed.

**Conclusions:** We developed a rule-based audiogram generation system that complements fixed-case teaching materials. This study does not establish educational effectiveness or clinical validity; rather, it provides a technical foundation for future expert evaluation and educational studies.

---

# 本文

## Ⅰ．序・目的

純音聴力検査は、難聴の有無・左右・型（感音／伝音／混合）を把握するための基本検査であり、気導および骨導閾値の読み取りと気骨導差（air–bone gap; ABG）の解釈は、臨床検査技師の養成および卒後教育における重要な到達目標である。実際の検査場面では、加齢に伴う高音域低下、中耳炎などにみられる伝音パターン、騒音性難聴の切痕、一側性の急性感音難聴など、多様な聴力像に直面する。したがって学習者には、単一の「典型例」を暗記するだけでなく、未知のオージオグラムに対して測定手順を組み立て、結果を解釈する訓練が求められる。

しかし教育現場では、防音室やオージオメータ、被験者役の確保、指導者の帯同といった制約が大きく、年齢や疾患を幅広くカバーした症例を十分な回数だけ提示することは容易でない。紙や電子ファイルの固定症例は再現性に優れる一方、症例数が限られ、事前に疾患名や難聴の程度が分かってしまうと、「答えを知ったうえで測る」練習になりやすい。学習効果の観点からは、測定前には聴力像の型を知らせず、測定後に正答照合で振り返る方が、実臨床の検査フローに近い。

さらに純音聴力検査では、気導・骨導の閾値測定に加え、必要に応じたマスキングの判断と実施が不可欠である。マスキングは左右差や大きなABGがある症例で特に重要となるが、本稿ではマスキング操作の教育効果自体は扱わない。仮想の聴力像を規則に従って大量に生成できれば、測定手順の練習にとどまらず、マスキング判断を反復して学ぶ土台にもなりうる、という位置づけにとどめる。

国外では、Web型や仮想環境の聴力計シミュレータが報告され、操作練習や一部の教育評価に用いられてきた1–4)。既存報告は主として検査操作や手続き訓練を扱っている。AudioScope EDUは、純音聴力検査に加え、ティンパノメトリー、アブミ骨筋反射、歪成分耳音響放射などを扱う教育用Web教材である。本稿では、そのうちオージオグラム自動生成機能に限定して検討した。国内の臨床検査教育の文脈では、ISO 7029に基づく年齢・性別の基準帯を土台に、疾患別パターンと程度を組み合わせて気導・骨導閾値を規則的に自動生成し、学習者にはその条件を秘匿したまま測定演習させるシステムについての技術報告は十分でない。

そこで本研究では、AudioScope EDUのオージオグラム自動生成を対象とし、次を目的とした。年齢、疾患別パターン、難聴の程度に応じた教育用の気導・骨導閾値を、あらかじめ設定した規則に従って自動生成できること。あわせて、学習者には生成条件を知らせず測定演習できること、および生成結果が設定した出力規則に従うことを組合せ検証で確認すること。

本稿は、教育効果を証明する研究でも、生成したオージオグラムの臨床的妥当性を証明する研究でもない。多様なオージオグラムを自動生成する仕組みを開発し、意図した規則どおりに動くことを示す基盤的な技術報告である。専門家による臨床的妥当性および操作性の評価、ならびに教育効果の検証は別報で扱う。

---

## Ⅱ．方法

### 1．設計方針

対象はAudioScope EDUのオージオグラム自動生成である。主な生成条件は年齢（性別）、疾患別の聴力像パターン、難聴の程度である。学習者向け画面ではこれらを選択・表示せず、システム内部で無作為に選択するよう設計した。検証では、年齢・疾患・程度に加えて乱数の初期値を固定して再実行し、入力が同じであれば気導・骨導の数値が一致して再出力されることを確認した。これは規則生成が決定的に動くかを見るための検証用の性質であり、学習者画面で前回と同じ像を呼び出す機能ではない。数値は周波数別の上下限内で5 dB刻みとした<sup>18,19)</sup>。本稿で確認したのは出力規則への適合であり、生成像の臨床的妥当性は扱わない。

生成の流れは次のとおりである。条件の指定または内部の無作為選択 → ISO 7029:2017に基づく基準帯の参照 → 疾患別パターンの変換と程度による深さの付与 → 上下限・5 dB丸め・気骨導関係の拘束 → 気導・骨導閾値の出力 → オージオグラム画面への提示。

### 2．ISO 7029:2017基準帯と周波数

性別と年齢グループ（20、30、40、50、60、70歳代）ごとに、ISO 7029:2017<sup>5)</sup>に基づく中央値およびばらつきの参照値を、教育用に年齢グループ化して用いた。規格の表そのものは転載しない。ISO 7029:2017に基づく年齢・性別の基準は気導閾値の土台に用い、骨導閾値は気骨導関係に関する著者設定規則から生成した（ISOが直接示す骨導基準そのものではない）。気導は125〜8000 Hz、骨導は250〜4000 Hzを主な対象とした。参照値に概ね±5〜10 dBの確率的変動を加えた後、5 dBへ丸めた。この変動幅は測定誤差のモデルではなく、教育用オージオグラムの定型化を避けるための著者設定である。本稿はISO 7029:2017を用い、修正票Amd 1:2024は未反映とした。18歳未満は20歳代相当へフォールバックした。本稿の主目的は疾患別出力規則への適合確認であり、ISO係数の疫学的厳密さの検証ではない。

### 3．疾患別の聴力像パターンと程度

疾患の定性的特徴は文献を参考にし、実装の具体的なdB値（例：突発性難聴の程度別加算のおよそ25／45／65 dB、正常例のABG上限15 dB、耳硬化症のCarhart様変化を80%の確率で付与）は、教育上識別可能な差が出るよう著者らが設定した値である（表1）。疾患名は教育用パターンの識別のための便宜的な呼称であり、実臨床の聴力像との対応を証明するものではない。程度（なし／軽度／中等度／重度）は型を保ったまま閾値上昇の深さを変える教材用の区分であり、WHO等の平均聴力等級と同一ではない。

正常パターンでは、程度パラメータは聴力像に反映せず（実質的に無視し）、年齢・性別に応じた基準帯からの生成のみとした。検証グリッドでは組合せの対称性を保つため、正常×4段階も別条件として数えた（聴力像は程度間で同一規則であり、メタデータの程度のみが異なる）。疾患パターンの「程度なし」では、疾患別の追加深度は付与しない。ただし伝音パターンでは、程度なしでも指定周波数の最小ABG床を維持する（ABG＝0にはしない）。騒音切痕やCarhart様変化など一部の特徴は、程度が軽度以上でのみ適用した。

突発性難聴では、中等度以上において病側と対側の平均気導差（0.5、1、2 kHz）が25 dB以上となるよう設定した。軽度ではその下限を主合否としない。

感音難聴では、骨導が気導より大きく悪くならないよう、骨導≤気導＋5 dBに拘束した。伝音難聴では、疾患ごとに指定した対象周波数で最小の気骨導差を保証した。気導が周波数別上限付近に達した場合は、骨導をスケールアウト（無反応）として扱い、画面上は矢印記号に加え教材用に「SO」を併記しうる。「SO」は本システムの教材上の表示であり、標準オージオグラム記号として提案するものではない。突発性難聴およびムンプス難聴では、程度に応じてスケールアウトを付与しうる。付与条件と観測数は電子付録1に示した。

耳硬化症では、程度が軽度以上のとき、2 kHzの骨導閾値が隣接周波数より5 dB以上上昇するCarhart様変化を80%の確率で付与した。乱数の詳細と判定式は電子付録1に示した。

**表1．教育用疾患パターンの要約**

| 教育用パターン | 文献上の参考特徴 | 実装した主な規則（著者設定を含む） |
|----------|------------------|------------------------------------|
| 正常 | 年齢相応<sup>5)</sup> | 過大なABGを避ける（≤15 dB）。程度は聴力像に非反映 |
| 加齢性感音難聴 | 高音障害<sup>5,6)</sup> | 高音域の加算 |
| 騒音性難聴 | 4 kHz切痕<sup>7,8)</sup> | 程度が軽度以上で4 kHz気導＞2 kHz気導 |
| メニエール病 | 低音優位<sup>9)</sup> | 低音域の加算 |
| 突発性難聴 | 一側性急性<sup>10)</sup> | 一側の加算。中等度以上で左右差≥25 dB。程度に応じてSO可 |
| ムンプス難聴 | 一側高度<sup>11)</sup> | 一側の加算・SO可 |
| 滲出性中耳炎 | 伝音ABG<sup>12)</sup> | 指定周波数で最小ABG（程度なしでも床を維持） |
| 急性中耳炎 | 急性期伝音<sup>13)</sup> | 最小ABG（滲出性より大きめ） |
| 耳硬化症 | Carhart様<sup>14–16)</sup> | 程度≥1で80%の確率でCarhart様変化を付与 |
| 耳小骨連鎖離断 | 大きいABG<sup>17)</sup> | 大きめの最小ABG |

### 4．出力規則の検証

適合の判定は、生成プログラムとは別に実装した検証スクリプトで行った（外部の研究機関による第三者検証ではない）。自ら設定した規則への適合のみでは検証器が常に合格を返す可能性を否定できないため、異常系テスト（意図的異常挿入）を行った。手順は次のとおりである。(1) 出力規則の正解表を凍結した。(2) 著者が正解表に基づき、正常・適合データと規則違反データ（例：5 dB刻みから外れる閾値43 dB、正常例でABG＝20 dB、感音で骨導の過大悪化、伝音で必要ABGの消失、騒音切痕の消去、突発の左右差不足、程度上昇に伴う閾値改善、Carhart様変化の消失、NaN／周波数欠損、正常例への規定外スケールアウト）を事前定義した。(3) 違反データは生成プログラム本体を書き換えて作るのではなく、正常な生成結果または合成閾値に意図的な変更を加えて検証スクリプトへ入力した。(4) 正常・適合データは適合、違反データは不適合となることを確認した。(5) その検証スクリプトで9,600件を検証した。反例候補の列挙には生成AIを補助的に用いたが、最終的な違反条件は著者が正解表から確定した。本試験はソースコードに変異を入れる古典的なミューテーションテストではなく、検証器への意図的異常挿入である。異常系テストは、正常・適合データ9項目と規則違反データ14項目の計23項目であり、規則違反14件はすべて不適合と判定された。あわせて、24例の代表生成結果について気導・骨導値および主要規則を著者が手計算で照合し、いずれも設定規則に適合していた。

正常および9種類の教育用疾患パターンについて、6年齢群、男女、4段階の難聴程度を組み合わせ、各条件で20件のオージオグラムを生成した（10×6×2×4×20＝9,600件）。正常パターンでも程度4段階を別条件として数えたため、聴力像の実質的な型数より件数は多い。各条件20件は統計的推定を目的とした標本数ではなく、生成条件の組合せ網羅と確率的変動下での規則適合確認を目的とした。合計9,600件について、5 dB刻み、気骨導関係、疾患別の特徴、難聴程度による変化などを確認した。規則ごとに、その規則が適用される生成例だけを分母とした（例：正常960件、感音4,800件、伝音3,840件、騒音性難聴で程度が軽度以上720件）。検証項目の識別番号や判定式の詳細は電子付録1に示した。

あわせて、次の点を重点的に確認した。加齢による高音域の上昇、突発性難聴の一側差（中等度固定）、難聴の程度を上げると閾値が下がらないこと、乱数初期値を含む同一入力での再出力一致、同一条件で乱数初期値のみを変えたときの出力の変化、および耳硬化症のCarhart様変化。同一条件で乱数初期値のみを変えた200件について、左右の気導・骨導が一組として完全に一致する例を同一とみなし、何通りの異なる聴力像が得られたかを数えた。5 dB丸めにより偶然一致しうるため、すべて異なる出力になることは要求しなかった。

記述統計では、伝音のABG、騒音切痕の深さ、Carhart様変化の深さ、突発性難聴およびムンプス難聴の一側差を要約した。表3の伝音ABGは規則の対象外周波数も含むため、最小値として−5 dBが観測された。規則で指定した対象周波数では所定の最小ABGを満たした（詳細は電子付録1）。突発性難聴の一側差は、中等度固定の重点確認と程度別の記述統計とで対象が異なる（25 dB未満は主に軽度に由来する）。

実施環境は Node.js v22.20.0、macOS 26.5.2、プログラム audioscope-edu 1.0.0 とした。詳細数値は電子付録1に同梱した。

生成・検証スクリプトの作成およびデバッグにはCursor上のAIアシスタントを使用し、別の生成AI（OpenAI ChatGPT）を用いて仕様および検証設計の補助的確認（境界条件・反例候補の整理を含む）を行った。最終的な検証条件、合否基準、コードおよび実行結果は著者が確認した。原稿ドラフトの構成検討にも生成AIを補助的に用いた。なお、生成AIによる確認は独立した第三者検証ではない。

---

## Ⅲ．成績

年齢・疾患・程度に応じたオージオグラムを自動生成し、学習者には条件を秘匿して提示できるシステムを実装した。図3は、耳小骨連鎖離断以外の症例（正常を含む）から選んだ8例を示し、右＝赤・左＝青として表示した代表例である（正答照合の緑線は表示しない）。

**表2．出力規則への適合結果**

| 確認した内容 | 対象数 | 結果 |
|--------------|--------|------|
| 指定した年齢・疾患・程度の反映 | 9,600件 | 全例適合 |
| 5 dB刻みでの出力 | 9,600件 | 全例適合 |
| 正常例における過大なABGの回避 | 960件 | 全例適合 |
| 感音難聴の気骨導関係 | 4,800件 | 全例適合 |
| 伝音難聴の気骨導差 | 3,840件 | 全例適合 |
| 騒音性難聴の4 kHz切痕（程度が軽度以上） | 720件 | 全例適合 |
| 耳硬化症のCarhart様変化の形（付与された例） | 576件 | 全例適合 |
| 加齢による高音域上昇 | 200件 | 全例適合（差の中央値42.5 dB） |
| 突発性難聴の一側差≥25 dB（中等度） | 200件 | 全例適合 |
| 難聴程度を上げたときの閾値の非減少 | 540組合せ | 全例適合 |
| 乱数初期値を含む同一入力での再出力 | 200件 | 全例一致 |
| 同一条件で乱数初期値のみを変えたときの聴力像の種類 | 各200件×3条件 | いずれも200通り（200件すべて異なる） |
| 著者定義の規則違反データ（異常系テスト） | 14件 | 全件を不適合と判定 |
| 耳硬化症のCarhart様変化の付与（程度≥1、記述） | 720件 | 576件（80.0%）に付与 |

耳硬化症のCarhart様変化は、程度が軽度以上の720件中576件（80.0%）に付与された。これは実装した付与確率（80%）の観測であり、性能評価の主結果ではない。主検証は、付与された576件がすべて設定した形を満たしたことである。重点200回での観測およびスケールアウトの付与条件・観測数は電子付録1に示した。

**表3．自動生成したオージオグラムの特徴（要約）**

| 指標 | 要約 |
|------|------|
| 年齢差（70歳代−20歳代, 4–8 kHz） | 中央値42.5 dB（四分位範囲37.5–47.5） |
| 突発性難聴の一側差（程度別） | 軽度21.7／中等度38.3／重度58.3 dB（中央値）。中等度・重度は全例≥25 dB |
| ムンプス難聴の一側差（程度≥1） | 中央値88.3 dB（四分位範囲65.0–106.7） |
| 伝音ABG（病側・骨導周波数）※ | 中央値15.0 dB（四分位範囲10.0–25.0、範囲−5.0–40.0） |
| 騒音切痕の深さ（4 kHz−2 kHz気導、程度≥1） | 中央値20.0 dB（四分位範囲15.0–30.0） |
| Carhart様変化の深さ（付与例） | 中央値7.5 dB（四分位範囲7.5–12.5） |

※表3の伝音ABGは規則の対象外周波数も含むため、最小値として−5 dBが観測された。規則で指定した対象周波数では所定の最小ABGを満たした。

---

## Ⅳ．考察

既存報告は主として検査操作や手続き訓練を扱っている1–4)。本検証の意義は、生成件数を増やしたことだけでなく、生成プログラムとは別に検証スクリプトを設け、正常出力と規則違反データの両方を評価した点にある。自ら設定した規則への高い適合率のみでは、検証器が常に合格を返す不具合を除外できない。このため、正常・適合データ9項目と規則違反データ14項目から成る異常系テストを行い、違反14件をすべて不適合と判定できることを示した。乱数初期値を含む同一入力での再出力一致、および同一条件で乱数初期値のみを変えたときの聴力像の多様化は、決定的な追跡可能性と、乱数が実質的に使われていない実装ではないことの補助的な確認である。年齢・教育用疾患パターン・難聴程度の規則と著者設定値を明示したことも、再現可能な教育用生成の基盤として重要である。高い適合率のみで生成規則の臨床的妥当性が示されるわけではない。学習者画面では疾患名や程度を知らせず測定でき、年齢・疾患・程度に応じた異なるオージオグラムが生成される（代表例は図3）。

教育上の利点は次のとおりである。第一に、紙の固定症例では数が限られやすいのに対し、規則生成では多様な聴力像を用意できる。第二に、学習者は疾患名を知らぬまま測定し、終了後に正答照合できるため、実臨床の検査手順に近い練習になる。第三に、左右差やABGのある生成例を繰り返せるため、マスキング判断の練習にも展開しうる。授業では教員が選択した生成例を提示し、自習では学習者が未知の生成例を反復測定するなど、目的に応じた運用が考えられる。ただし、これらの教育効果は本稿では評価していない。

限界として、自ら定義した規則への適合確認にとどまり、外部の第三者検証ではない。具体的なdB値やスケールアウトの付与条件の多くは著者設定であり、生成したオージオグラムの臨床的妥当性の証明ではない。表1の疾患名は教育用パターンの識別のための便宜的な呼称である。ISO 7029は2017年版を用い、Amd 1:2024は未反映である（教育用基準帯としての利用であり、最新修正票に基づく疫学推定の再現を目的としない）。程度ラベルはWHO等級と同一ではない。専門家評価および教育効果の検証は別報で扱う。

---

## Ⅴ．結語

年齢・疾患・程度に応じた教育用オージオグラム自動生成システムを開発し、設定した出力規則への適合、著者定義の規則違反データの検出、および同一入力時の再出力一致を確認した。本システムは、学習者に生成条件を知らせず、固定症例を補完する多様なオージオグラムを提示できる。本稿は技術的検証であり、生成結果の臨床的妥当性および教育効果は今後検討する必要がある。

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

- **図1** 教育用オージオグラムの自動生成フロー（学習者には条件非提示）  
- **図2** AudioScope EDUのオージオグラム提示画面（正答照合画面のため緑色。測定入力時は右＝赤・左＝青）  
- **図3** 耳小骨連鎖離断以外の症例（正常を含む）から選んだ8例の代表オージオグラム（右＝赤・左＝青。正答照合の緑線は表示しない）  

注: 数dB程度の気骨導のずれは定型化回避のための確率的変動である。図3は多様なオージオグラムが規則生成されることの視覚的例示であり、臨床的妥当性の証明ではない。

## 電子付録1

疾患別規則の要約、検証ログ（適合率、記述統計、伝音ABGの−5 dB、Carhart重点200回、突発／ムンプスのスケールアウト確率等）を同梱する。  
`appendix_IgakuKensa_verification_results.md` / `.json`

---

## 投稿準備（著者作業）

詳細チェックリスト: [`SUBMISSION_CHECKLIST.md`](./SUBMISSION_CHECKLIST.md)  
メタデータ転記: [`SUBMISSION_metadata_TEMPLATE.md`](./SUBMISSION_metadata_TEMPLATE.md)  
**ファイル名:**  
- Markdown: `manuscript_IgakuKensa_AudioScopeEDU_technical_validity_draft_v2.16.md`  
- Word（日臨技テンプレ転記）: `manuscript_IgakuKensa_AudioScopeEDU_technical_validity_JAMT_v2.16.docx`  
- Word（作業用）: `manuscript_IgakuKensa_AudioScopeEDU_technical_validity_draft_v2.16.docx`  
（版を上げたら両方のファイル名も更新）

| 項目 | 状態 |
|------|------|
| 和文要旨 581/600字 | ✅ |
| 英文要旨 244/250 words | ✅ |
| 本文+図表換算 ~7,300/8,000字 | ✅ |
| 検証 A–C + 手計算24例 | ✅ |
| Wordテンプレート転記 / JAMT_v2.16.docx | ✅（連絡先・図1は未） |
| 図1 PNG | 未（[`fig1_generation_flow.mmd`](../figures/fig1_generation_flow.mmd)） |
| 所属（北海道医療大学リハ科学部言語聴覚療法学科） | ✅ |
| 共著・連絡先 | 未 |
| 英文校閲 | 未 |
| S1M投稿 | 未 |

---

## 作業メモ（提出時削除）

v2.17: 査読想定補強。9600の数え方（正常×程度は聴力像非反映だが組合せ対称性のため計数）、突発25 dBは中等度以上、表3 ABG−5の注、ISOは気導土台／骨導は著者規則、考察第1段を意義から開始、異常系は適合9＋違反14、方法の過去形、文献18–19を5 dB刻みで引用、AIは仕様・検証設計の補助的確認、ENキーワードを clinical laboratory education に変更。
v2.16: 異常系を査読想定表に合わせて拡充（43 dB、程度非減少破壊、規定外SO）。違反14件／全体23項目。対応表 `NEGATIVE_TEST_cases.md`。
v2.15: 異常系テストの主体を明示（著者・正解表から事前定義／生成本体の無作為改変ではない／古典的mutationではない）。
v2.14: プレ査読対応。異常系を表2・要旨に明示。異seed多様性T11。表1を教育用疾患パターン。SOは教材表示。各条件20件の理由。Carhart 80%は記述。表3に分布を復帰。
v2.13: 投稿仕上げチェックリスト。所属記入。
v2.12: 検証正解表・GPT依頼パック・手計算/異常データ手順を verification/ に追加。方法のAI記載を補助レビュー表現に更新。
v2.11: 要旨に9600件適合＋200件再出力一致を復帰。他検査・SO確率・授業運用を圧縮。結語を検証結果に限定。
v2.10: 要旨から再現の記述を削除。方法・表・考察で「乱数初期値固定＝検証用の再出力一致」と明記。
v2.9: 要旨【成績】を簡潔な2文に書き換え（図2言及・確率付与の添え文を削除）。
v2.8: 要旨からCarhart／SOの件数・％を外し、「一部は確率付与」の一文に簡略。数値は本文・表2に残置。
v2.7: 要旨・方法・成績で確率規則（Carhart・ムンプスSO・突発SO）を同レベル記載。
v2.6: 序・方法・考察にティンパノ/ART/DPOAEと臨床推論の位置づけを短く追加（本稿範囲外と明記）。
v2.5: 授業はデフォルト症例、自習は自由生成の二段運用を考察・結語に明記。
v2.4: 未実装の教員向けseed再現UIの主張を撤回。再現は検証用と明記。教育利用は「生成→教員選別→デフォルト症例提示」の運用案に変更。
v2.3: 考察で教員再現の利点を具体化（授業前検分・模範解答・再提示・個別指導）。→v2.4で撤回
v2.2: 「症例」→「生成例／オージオグラム」（固定症例は維持）。図2は代表例提示に。方法の無作為選択を過去形（よう設計した／were selected）。
v2.1: 題名をオージオグラムに変更。英文標題を自然な表現へ。
v2.0: draft(7)密度＋意義明確化。
