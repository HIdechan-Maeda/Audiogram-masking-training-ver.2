// 疾患データベース（臨床的な症例生成のため）
export const HEARING_DISORDERS = [
  {
    name: "メニエール病",
    epidemiology: "有病率 ~30–150/10万人。女性>男性。30–50歳に多い。",
    audiogram: "低音障害型〜水平型。発作期に変動あり。",
    tympanometry: "A型",
    stapedial_reflex: "通常保たれるが発作期に変動することあり",
    oae: "発作期にDPOAEが低下し回復とともに改善することがある",
    ageRange: [30, 50],
    genderBias: 0.7, // 女性が多い（0.7 = 70%女性）
    pattern: "meniere",
    episodes: [
      "回転性めまいの反復発作（数十分〜数時間）",
      "低音障害型の感音難聴（変動）",
      "『ゴー』という低音性耳鳴り",
      "発作時に聞こえが悪化し、寛解期に改善"
    ]
  },
  {
    name: "突発性難聴",
    epidemiology: "年間 ~4万人。40–60歳に多い。ウイルス/血流障害が主仮説。",
    audiogram: "高音障害型・谷型・全体低下型など多様。多くは急性一側。",
    tympanometry: "A型",
    stapedial_reflex: "多くは消失（内耳性）",
    oae: "多くはDPOAE消失（外有毛細胞障害）。予後指標となる。",
    ageRange: [40, 60],
    genderBias: 0.5,
    pattern: "sudden",
    unilateral: true, // 多くは一側性
    episodes: [
      "起床時に片耳の聞こえが突然悪化",
      "『昨日から/数日前』の急性発症",
      "耳鳴り（±）・めまい（±）",
      "鼓膜所見は正常（A型）"
    ]
  },
  {
    name: "耳硬化症",
    epidemiology: "有病率 ~0.3–0.4%。女性>男性。20–40歳に発症しやすい。",
    audiogram: "Stiffness curve（高音域に比べ低音域のAC/BC差が大きい）を示す、低音障害型の伝音難聴。Carhart notch（~2kHzで気骨差縮小）。",
    tympanometry: "A型またはAs型（コンプライアンス低）",
    stapedial_reflex: "消失が典型",
    oae: "伝音障害のためDPOAEはREFERになりやすい",
    ageRange: [20, 40],
    genderBias: 0.7,
    pattern: "otosclerosis",
    episodes: [
      "徐々に進行する聞こえの悪さ（若年〜中年女性に多い）",
      "家族歴あり（遺伝的素因）",
      "鼓膜所見はおおむね正常、As型、反射消失"
    ]
  },
  {
    name: "騒音性難聴",
    epidemiology: "騒音職場・ライブ等による長期暴露。8980Hz付近に障害。",
    audiogram: "C5 dip（4kHz付近が最も落ちる）",
    tympanometry: "A型",
    stapedial_reflex: "概ね保たれる",
    oae: "DPOAE は初期から低下 → 早期指標として有用",
    ageRange: [30, 60],
    genderBias: 0.3, // 男性が多い傾向
    pattern: "noise",
    episodes: [
      "工場・建設・重機・製造ラインなどの慢性騒音暴露",
      "両側性・同程度の聴力低下",
      "4kHz主体のC5 dip",
      "鼓膜所見は正常（A型）"
    ]
  },
  {
    name: "加齢性難聴（老聴）",
    epidemiology: "60歳以降で増加。4000〜8000Hzから低下。",
    audiogram: "高音障害型・緩徐進行。",
    tympanometry: "A型",
    stapedial_reflex: "保たれることが多いが高齢では減弱あり",
    oae: "高周波から消失（外有毛細胞機能低下）",
    ageRange: [60, 85],
    genderBias: 0.5,
    pattern: "presbycusis",
    episodes: [
      "徐々に聞こえが悪くなった（会話が聞き取りにくい）",
      "高音域から低下、両側性",
      "鼓膜所見は正常（A型）"
    ]
  },
  {
    name: "耳小骨離断",
    epidemiology: "外傷（鼓膜穿孔/側頭骨骨折）後に発生。",
    audiogram: "伝音難聴。気骨差が大きい。",
    tympanometry: "Ad型（コンプライアンス増大）",
    stapedial_reflex: "消失しやすい",
    oae: "外耳伝達不良のため測定不能または異常",
    ageRange: [5, 70],
    genderBias: 0.4,
    pattern: "ossicular_discontinuity",
    episodes: [
      "殴打・転倒・スポーツで耳部を打撲",
      "耳掃除中にぶつかられた後から聞こえが悪い",
      "鼓膜所見は基本正常、Ad型、ABG大"
    ]
  },
  {
    name: "音響外傷（銃声・爆発・ライブ等）",
    epidemiology: "急性強大音暴露。若年層に多い。",
    audiogram: "C5 dip（4kHz）を主体とした急性障害",
    tympanometry: "A型",
    stapedial_reflex: "通常保たれる",
    oae: "DPOAE 低下は純音より早く出ることがある",
    ageRange: [15, 40],
    genderBias: 0.5,
    pattern: "acoustic_trauma",
    episodes: [
      "昨日/数日前のライブ・銃声・爆発・耳元の大音後に発症",
      "一側性になりやすい",
      "急性の耳鳴り・難聴",
      "鼓膜所見は正常（A型）"
    ]
  },
  {
    name: "ムンプス難聴",
    epidemiology: "小児〜若年に一側性。高度〜ろう型。回復しにくい。",
    audiogram: "高度感音難聴〜ろう型（多くは一側）",
    tympanometry: "A型",
    stapedial_reflex: "消失",
    oae: "消失（外有毛細胞不可逆障害）",
    ageRange: [3, 25],
    genderBias: 0.5,
    pattern: "mumps",
    unilateral: true,
    severity: "severe", // 高度難聴
    episodes: [
      "おたふく風邪罹患後に片耳の高度難聴",
      "回復しにくい経過",
      "鼓膜所見は正常（A型）"
    ]
  },
  {
    name: "滲出性中耳炎",
    epidemiology: "小児に多い（特に2-7歳）。上気道炎・アレルギー性鼻炎に合併しやすい。",
    audiogram: "伝音難聴（軽度〜中等度）。低音域から中音域にかけての気骨差。",
    tympanometry: "B型（平坦型）またはC型（陰圧型）",
    stapedial_reflex: "消失または減弱（伝音障害のため）",
    oae: "伝音障害のためDPOAEはREFER（全周波数）",
    ageRange: [2, 12],
    genderBias: 0.5,
    pattern: "ome",
    episodes: [
      "上気道炎後より聞こえ低下を自覚、耳痛なし",
      "鼻閉継続、耳閉感、痛みなし",
      "感冒後から耳閉塞感と難聴",
      "アレルギー性鼻炎背景、徐々に悪化",
      "鼓膜混濁・光錐消失・液体貯留線",
      "鼓膜所見あり（滲出性/急性中耳炎を示唆）"
    ]
  },
  {
    name: "急性中耳炎",
    epidemiology: "小児に多い（特に6ヶ月〜3歳）。上気道炎・感冒後に合併しやすい。",
    audiogram: "伝音難聴（軽度〜中等度）。低音域から中音域にかけての気骨差。",
    tympanometry: "B型（平坦型）またはC型（陰圧型）",
    stapedial_reflex: "消失または減弱（伝音障害のため）",
    oae: "伝音障害のためDPOAEはREFER（全周波数）",
    ageRange: [1, 12],
    genderBias: 0.5,
    pattern: "aom",
    episodes: [
      "強い耳痛（夜間に増悪）",
      "発熱を伴うことが多い（38℃以上）",
      "感冒様症状に続いて耳痛が急速に増悪",
      "上気道炎後、耳痛と難聴",
      "鎮痛薬で一時軽快も再燃",
      "鼓膜発赤・膨隆、光錐消失、鼓膜拍動所見あり",
      "鼓膜充血・膨隆、鼓膜表面に血管怒張",
      "激しい耳痛の後に水様〜膿性耳漏出現",
      "鼓膜所見あり（急性中耳炎を示唆）"
    ]
  }
];


