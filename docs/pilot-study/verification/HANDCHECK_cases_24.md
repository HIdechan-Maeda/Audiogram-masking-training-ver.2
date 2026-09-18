# 手計算照合シート（24例）

- 作成日: 2026-08-12（AOM 13–14は 2026-08-18 の伝音／混合分岐実装後に再生成して再照合）
- **再出力日: 2026-09-18**（SNHL_Age 高音漸傾・気導揺らぎ・両側左右差の周波数別化の後）
- 使い方: 各例について、右記のAC/BCをオージオグラムとして読み、下のチェック欄を記入する。
- AC順: 0.125/0.25/0.5/1/2/4/8 kHz　BC順: 0.25/0.5/1/2/4 kHz
- 所要目安: 1例3〜5分 × 24 ≈ 1.5〜2時間
- **著者再照合: 2026-09-18 全24例OK**


| #   | 狙い          | 条件                                             | seed | 患側        | 確認ポイント                                         | 著者OK |
| --- | ----------- | ---------------------------------------------- | ---- | --------- | ---------------------------------------------- | ---- |
| 1   | ABG≤15      | Normal / 40s / Female / sev0                 | 1001 | bilateral | ABG≤15 / Carhart no / 5dB刻み                    | OK |
| 2   | 加齢帯＋ABG     | Normal / 70s / Male / sev0                   | 1002 | bilateral | ABG≤15 / Carhart no / 5dB刻み                    | OK |
| 3   | 若年感音        | SNHL_Age / 20s / Male / sev2                 | 1003 | bilateral | Carhart no / 5dB刻み                             | OK |
| 4   | 高年感音        | SNHL_Age / 70s / Male / sev2                 | 1004 | bilateral | Carhart no / 5dB刻み                             | OK |
| 5   | 4k>2k       | SNHL_NoiseNotch / 50s / Male / sev1          | 1005 | bilateral | 切痕R 30 / Carhart no / 5dB刻み                    | OK |
| 6   | 深い切痕        | SNHL_NoiseNotch / 50s / Female / sev3        | 1006 | bilateral | 切痕R 30 / Carhart no / 5dB刻み                    | OK |
| 7   | 一側差≥25・右    | SNHL_Sudden / 50s / Male / sev2              | 1007 | R         | 左右差 50 / Carhart no / 5dB刻み                    | OK |
| 8   | 一側差≥25・左    | SNHL_Sudden / 50s / Male / sev2              | 1008 | L         | 左右差 46.7 / Carhart no / 5dB刻み                  | OK |
| 9   | 高度一側        | SNHL_Mumps / 30s / Female / sev2             | 1009 | R         | 左右差 108.3 / Carhart no / 5dB刻み                 | OK |
| 10  | 重度/SO有無     | SNHL_Mumps / 30s / Female / sev3             | 1010 | L         | 左右差 95 / Carhart no / 5dB刻み                    | OK |
| 11  | 最小ABG       | CHL_OME / 20s / Female / sev1                | 1011 | bilateral | ABG 10/15/15/10/5 / Carhart no / 5dB刻み         | OK |
| 12  | 深い伝音        | CHL_OME / 20s / Female / sev3                | 1012 | bilateral | ABG 25/30/25/10/15 / Carhart no / 5dB刻み        | OK |
| 13  | 一側AOM（伝音型）  | CHL_AOM / 20s / Male / sev1                  | 1013 | R         | ABG 10/15/15/10/-5 / 混合no / 5dB刻み              | OK |
| 14  | 一側AOM（混合型）  | CHL_AOM / 20s / Male / sev1                  | 1014 | R         | ABG 10/15/15/10/0 / 混合yes（4k BC>0.5k BC） / 5dB刻み | OK |
| 15  | Carhart探索   | CHL_Otosclerosis / 30s / Female / sev1       | 1015 | bilateral | ABG 10/15/20/5/0 / Carhart yes+geomOK / 5dB刻み  | OK |
| 16  | Carhart探索   | CHL_Otosclerosis / 30s / Female / sev1       | 1016 | bilateral | ABG 10/15/15/5/-5 / Carhart no / 5dB刻み         | OK |
| 17  | Carhart深さ   | CHL_Otosclerosis / 30s / Female / sev2       | 1017 | bilateral | ABG 20/20/15/5/5 / Carhart yes+geomOK / 5dB刻み  | OK |
| 18  | 大きいABG      | CHL_OssicularDiscontinuity / 40s / Male / sev2 | 1018 | R         | ABG 40/40/45/30/35 / Carhart no / 5dB刻み        | OK |
| 19  | 低音・一側       | SNHL_Meniere / 40s / Female / sev1           | 1019 | R         | 左右差 5 / Carhart no / 5dB刻み                     | OK |
| 20  | 低音・一側       | SNHL_Meniere / 40s / Female / sev2           | 1020 | L         | 左右差 10 / Carhart no / 5dB刻み                    | OK |
| 21  | 上限付近        | SNHL_Age / 70s / Male / sev3                 | 1021 | bilateral | Carhart no / 5dB刻み                             | OK |
| 22  | 切痕・seed差A   | SNHL_NoiseNotch / 50s / Male / sev2          | 1022 | bilateral | 切痕R 30 / Carhart no / 5dB刻み                    | OK |
| 23  | 切痕・seed差B   | SNHL_NoiseNotch / 50s / Male / sev2          | 1023 | bilateral | 切痕R 30 / Carhart no / 5dB刻み                    | OK |
| 24  | 程度0でもC1下限   | CHL_OME / 40s / Male / sev0                  | 1024 | bilateral | ABG 10/15/20/10/10 / Carhart no / 5dB刻み        | OK |




## 詳細数値



### #1 Normal（ABG≤15）

- 条件: 40s, Female, severity=0, seed=1001, affected=bilateral
- 右 AC: `5/5/5/0/10/0/-5`
- 右 BC: `10/10/0/5/-5`
- 左 AC: `5/5/10/0/10/0/-5`
- 左 BC: `10/15/5/15/-5`
- 病側ABG(0.25–4): `-5/-5/0/5/5`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #2 Normal（加齢帯＋ABG）

- 条件: 70s, Male, severity=0, seed=1002, affected=bilateral
- 右 AC: `15/10/10/10/25/45/40`
- 右 BC: `10/5/10/30/50`
- 左 AC: `15/10/5/15/20/40/40`
- 左 BC: `15/5/20/25/35`
- 病側ABG(0.25–4): `0/5/0/-5/-5`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #3 SNHL_Age（若年感音）

- 条件: 20s, Male, severity=2, seed=1003, affected=bilateral
- 右 AC: `25/25/25/25/25/30/35`
- 右 BC: `15/30/30/15/20`
- 左 AC: `20/25/25/25/25/30/35`
- 左 BC: `30/30/30/15/20`
- 病側ABG(0.25–4): `10/-5/-5/10/10`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #4 SNHL_Age（高年感音）

- 条件: 70s, Male, severity=2, seed=1004, affected=bilateral
- 右 AC: `30/30/30/40/40/45/75`
- 右 BC: `25/30/35/30/50`
- 左 AC: `20/30/30/40/40/45/65`
- 左 BC: `30/30/30/30/40`
- 病側ABG(0.25–4): `5/0/5/10/-5`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #5 SNHL_NoiseNotch（4k>2k）

- 条件: 50s, Male, severity=1, seed=1005, affected=bilateral
- 右 AC: `5/5/5/5/10/40/30`
- 右 BC: `5/5/0/0/30`
- 左 AC: `15/5/5/5/15/50/40`
- 左 BC: `10/5/5/15/40`
- 病側ABG(0.25–4): `0/0/5/10/10`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #6 SNHL_NoiseNotch（深い切痕）

- 条件: 50s, Female, severity=3, seed=1006, affected=bilateral
- 右 AC: `5/5/5/0/15/45/30`
- 右 BC: `10/10/0/10/50`
- 左 AC: `5/5/5/0/20/40/30`
- 左 BC: `10/10/5/10/40`
- 病側ABG(0.25–4): `-5/-5/0/5/-5`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #7 SNHL_Sudden（一側差≥25・右）

- 条件: 50s, Male, severity=2, seed=1007, affected=R
- 右 AC: `45/35/60/50/55/50/60`
- 右 BC: `30/50/40/45/40`
- 左 AC: `5/5/5/5/5/10/15`
- 左 BC: `5/5/0/5/15`
- 病側ABG(0.25–4): `5/10/10/10/10`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #8 SNHL_Sudden（一側差≥25・左）

- 条件: 50s, Male, severity=2, seed=1008, affected=L
- 右 AC: `5/5/5/10/10/20/10`
- 右 BC: `5/10/0/0/10`
- 左 AC: `45/40/55/50/60/50/50`
- 左 BC: `45/45/40/50/40`
- 病側ABG(0.25–4): `-5/10/10/10/10`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #9 SNHL_Mumps（高度一側）

- 条件: 30s, Female, severity=2, seed=1009, affected=R
- 右 AC: `SO/SO/SO/SO/SO/SO/SO`
- 右 BC: `SO/SO/SO/SO/SO`
- 左 AC: `5/5/5/0/0/0/0`
- 左 BC: `5/5/5/5/0`
- 病側ABG(0.25–4): `35/45/40/40/50`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #10 SNHL_Mumps（重度/SO有無）

- 条件: 30s, Female, severity=3, seed=1010, affected=L
- 右 AC: `5/5/5/0/0/-5/5`
- 右 BC: `5/10/0/0/-5`
- 左 AC: `70/90/100/95/95/95/95`
- 左 BC: `SO/SO/SO/SO/SO`
- 病側ABG(0.25–4): `—/—/—/—/—`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #11 CHL_OME（最小ABG）

- 条件: 20s, Female, severity=1, seed=1011, affected=bilateral
- 右 AC: `10/15/25/15/10/5/0`
- 右 BC: `5/10/0/0/0`
- 左 AC: `15/15/20/15/10/10/0`
- 左 BC: `5/5/0/0/15`
- 病側ABG(0.25–4): `10/15/15/10/5`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #12 CHL_OME（深い伝音）

- 条件: 20s, Female, severity=3, seed=1012, affected=bilateral
- 右 AC: `20/30/35/25/25/15/5`
- 右 BC: `5/5/0/15/0`
- 左 AC: `10/25/30/25/10/15/10`
- 左 BC: `10/15/5/0/15`
- 病側ABG(0.25–4): `25/30/25/10/15`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #13 CHL_AOM（一側・伝音型）

- 条件: 20s, Male, severity=1, seed=1013, affected=R
- 右 AC: `15/15/20/25/15/0/0`
- 右 BC: `5/5/10/5/5`
- 左 AC: `5/5/5/0/0/0/-5`
- 左 BC: `5/5/0/0/0`
- 病側ABG(0.25–4): `10/15/15/10/-5`

- [x] 5 dB刻み　[x] 規則適合を手計算で確認　[x] 著者OK（数値不変）


### #14 CHL_AOM（一側・混合型）

- 条件: 20s, Male, severity=1, seed=1014, affected=R
- 右 AC: `15/20/20/15/20/15/0`
- 右 BC: `10/5/0/10/15`
- 左 AC: `5/5/5/0/0/5/5`
- 左 BC: `10/10/0/0/0`
- 病側ABG(0.25–4): `10/15/15/10/0`

- [x] 5 dB刻み　[x] 規則適合を手計算で確認　[x] 著者OK（数値不変）


### #15 CHL_Otosclerosis（Carhart探索）

- 条件: 30s, Female, severity=1, seed=1015, affected=bilateral
- 右 AC: `10/15/20/20/15/5/5`
- 右 BC: `5/5/0/10/5`
- 左 AC: `5/30/20/35/30/-5/5`
- 左 BC: `20/5/20/25/0`
- 病側ABG(0.25–4): `10/15/20/5/0`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #16 CHL_Otosclerosis（Carhart探索）

- 条件: 30s, Female, severity=1, seed=1016, affected=bilateral
- 右 AC: `10/20/20/15/5/0/0`
- 右 BC: `10/5/0/0/5`
- 左 AC: `5/15/20/20/5/10/0`
- 左 BC: `5/5/5/0/5`
- 病側ABG(0.25–4): `10/15/15/5/-5`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #17 CHL_Otosclerosis（Carhart深さ）

- 条件: 30s, Female, severity=2, seed=1017, affected=bilateral
- 右 AC: `15/25/25/35/30/5/-5`
- 右 BC: `5/5/20/25/0`
- 左 AC: `5/20/25/25/20/10/0`
- 左 BC: `10/10/10/15/5`
- 病側ABG(0.25–4): `20/20/15/5/5`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #18 CHL_OssicularDiscontinuity（大きいABG）

- 条件: 40s, Male, severity=2, seed=1018, affected=R
- 右 AC: `40/45/45/45/45/40/15`
- 右 BC: `5/5/0/15/5`
- 左 AC: `5/5/5/0/0/5/15`
- 左 BC: `10/5/5/5/-5`
- 病側ABG(0.25–4): `40/40/45/30/35`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #19 SNHL_Meniere（低音・一側）

- 条件: 40s, Female, severity=1, seed=1019, affected=R
- 右 AC: `15/15/15/10/0/0/0`
- 右 BC: `20/5/15/0/-5`
- 左 AC: `5/5/5/5/0/0/0`
- 左 BC: `10/10/0/0/5`
- 病側ABG(0.25–4): `-5/10/-5/0/5`

- [x] 5 dB刻み　[x] 規則適合を手計算で確認　[x] 著者OK（数値不変）


### #20 SNHL_Meniere（低音・一側）

- 条件: 40s, Female, severity=2, seed=1020, affected=L
- 右 AC: `5/5/5/0/5/5/10`
- 右 BC: `10/5/0/10/10`
- 左 AC: `25/25/20/10/10/0/15`
- 左 BC: `20/10/10/15/-5`
- 病側ABG(0.25–4): `5/10/0/-5/5`

- [x] 5 dB刻み　[x] 規則適合を手計算で確認　[x] 著者OK（数値不変）


### #21 SNHL_Age（上限付近）

- 条件: 70s, Male, severity=3, seed=1021, affected=bilateral
- 右 AC: `45/45/50/55/55/60/70`
- 右 BC: `45/45/50/50/50`
- 左 AC: `45/45/50/50/55/70/70`
- 左 BC: `35/55/55/60/60`
- 病側ABG(0.25–4): `0/5/5/5/10`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #22 SNHL_NoiseNotch（切痕・seed差A）

- 条件: 50s, Male, severity=2, seed=1022, affected=bilateral
- 右 AC: `5/5/5/5/10/40/30`
- 右 BC: `10/5/0/15/40`
- 左 AC: `5/10/5/0/5/40/30`
- 左 BC: `10/5/5/10/45`
- 病側ABG(0.25–4): `-5/0/5/-5/0`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #23 SNHL_NoiseNotch（切痕・seed差B）

- 条件: 50s, Male, severity=2, seed=1023, affected=bilateral
- 右 AC: `5/5/5/10/5/35/25`
- 右 BC: `5/10/10/0/30`
- 左 AC: `5/10/5/15/0/30/15`
- 左 BC: `5/10/20/5/25`
- 病側ABG(0.25–4): `0/-5/0/5/5`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK


### #24 CHL_OME（程度0でもC1下限）

- 条件: 40s, Male, severity=0, seed=1024, affected=bilateral
- 右 AC: `5/20/20/20/15/5/10`
- 右 BC: `10/5/0/5/-5`
- 左 AC: `10/20/25/20/25/5/10`
- 左 BC: `5/5/0/15/-5`
- 病側ABG(0.25–4): `10/15/20/10/10`

- [x] 5 dB刻み　[x] 規則適合を生成器再出力で確認（2026-09-18）　[x] 著者再照合OK

