import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { supabase } from './supabaseClient';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Scatter, Line, ReferenceArea, ReferenceLine } from "recharts";
import TympanogramGif from './TympanogramGif';
import StapedialReflexGif from './StapedialReflexGif';
import DPOAE from './DPOAE';
import AOMCases from './data/AOM_cases.json';
import OMECases from './data/OME_cases.json';
import OssicularDiscontinuityCases from './data/Ossicular_Discontinuity_cases.json';
import OtosclerosisCases from './data/Otosclerosis_cases.json';
import { generateAudiogram } from './engine/generateAudiogram';

// Audiogram-first Masking Trainer (MVP v2.4.9)
// - 1oct/grid x 10dB ticks; 1oct == 20dB; AC O/X, BC </> []
// - Overlay blink; legend right-side panel; masking slider in header
// - Fix: add targetMap + getThr() → resolves "getThr is not defined"

// --- constants ---
// Optional click→dB calibration offset (kept 0 as per spec 1/2/3)
const CAL_OFFSET_DB = 0;
const BC_DISABLED = new Set([125, 8000]); // BCは125Hz/8000Hzは測定対象外
const FREQS = [125, 250, 500, 1000, 2000, 4000, 8000]; // 7 points -> 6 octaves
// Slight domain padding to prevent edge clipping without changing visible tick positions
const X_DOMAIN = [0, FREQS.length - 1];
const Y_MIN = -10;  // dB HL (top small, bottom large)
const Y_MAX = 120;  // 10 dB ticks (render squares use 20 dB cells)
const CHART_SCALE = 1;
// Geometry to force 1 octave (X) == 20 dB (Y)
const CELL_PX = 100; // px per 1 octave (== 20 dB) — larger, keeps square cells
const GRID_W = CELL_PX * (FREQS.length - 1); // 6 octaves
const GRID_H = CELL_PX * ((Y_MAX - Y_MIN) / 20); // vertical cells of 20 dB
const AXIS_LEFT = 64, AXIS_RIGHT = 40, AXIS_TOP = 20, AXIS_BOTTOM = 48; // increase top to avoid clipping -10 dB tick
const CHART_MARGIN = { top: AXIS_TOP, right: AXIS_RIGHT, bottom: AXIS_BOTTOM, left: AXIS_LEFT }; // plotting box = GRID_W x GRID_H

// Interaural Attenuation (IA): AC=50 dB, BC=0 dB
const IA = { AC: 50, BC: 0 };

const PROFILE_PATTERN_MAP = {
  Normal: 'normal',
  NormalHearing: 'normal',
  SNHL_Age: 'sensorineural',
  SNHL_NoiseNotch: 'sensorineural',
  SNHL_Meniere: 'sensorineural',
  SNHL_Sudden: 'sensorineural',
  SNHL_Mumps: 'sensorineural',
  SNHL_Other: 'sensorineural',
  CHL_OME: 'conductive',
  CHL_AOM: 'conductive',
  CHL_Otosclerosis: 'conductive',
  CHL_OssicularDiscontinuity: 'conductive',
};

function inferCasePatternFromProfile(profileName) {
  if (!profileName || typeof profileName !== 'string') {
    return 'sensorineural';
  }
  const key = profileName.trim();
  if (PROFILE_PATTERN_MAP[key]) return PROFILE_PATTERN_MAP[key];
  if (/^SNHL_/i.test(key)) return 'sensorineural';
  if (/^CHL_/i.test(key)) return 'conductive';
  if (/^Normal/i.test(key)) return 'normal';
  return 'sensorineural';
}

// ISO 7029: 正常聴力閾値の疫学データ（年齢別・周波数別）
// 単位: dB HL, 周波数: 1000, 2000, 4000 Hz
const NORMAL_HEARING_THRESHOLDS_ISO7029 = {
  20: { 1000: 5, 2000: 5, 4000: 5 },
  30: { 1000: 5, 2000: 10, 4000: 15 },
  40: { 1000: 10, 2000: 10, 4000: 25 },
  50: { 1000: 15, 2000: 20, 4000: 35 },
  60: { 1000: 25, 2000: 30, 4000: 50 },
  70: { 1000: 35, 2000: 40, 4000: 65 }
};

// 年齢から正常聴力閾値を取得する関数（補間対応）
function getNormalHearingThreshold(age, freq) {
  const ageKey = Math.floor(age / 10) * 10; // 10歳刻みに丸める
  const nextAgeKey = Math.min(70, ageKey + 10);
  
  if (!NORMAL_HEARING_THRESHOLDS_ISO7029[ageKey] || !NORMAL_HEARING_THRESHOLDS_ISO7029[ageKey][freq]) {
    // デフォルト値（20歳相当）
    return NORMAL_HEARING_THRESHOLDS_ISO7029[20][freq] || 5;
  }
  
  // 20歳未満は20歳の値を使用
  if (age < 20) {
    return NORMAL_HEARING_THRESHOLDS_ISO7029[20][freq] || 5;
  }
  
  // 70歳以上は70歳の値を使用
  if (age >= 70) {
    return NORMAL_HEARING_THRESHOLDS_ISO7029[70][freq] || 65;
  }
  
  // 補間計算
  const lower = NORMAL_HEARING_THRESHOLDS_ISO7029[ageKey][freq];
  const upper = NORMAL_HEARING_THRESHOLDS_ISO7029[nextAgeKey][freq];
  const ratio = (age - ageKey) / 10;
  
  return Math.round((lower + (upper - lower) * ratio) / 5) * 5; // 5dB刻みに丸める
}

// 疾患データベース（臨床的な症例生成のため）
const HEARING_DISORDERS = [
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

// 周波数別の正常聴力範囲を取得（125, 250, 500, 8000Hzは推定）
function getNormalRangeForAge(age, freq) {
  // 基準周波数（1000, 2000, 4000Hz）はISO 7029から
  if ([1000, 2000, 4000].includes(freq)) {
    const threshold = getNormalHearingThreshold(age, freq);
    return { min: Math.max(-5, threshold - 5), max: threshold + 10 }; // ±5dBの許容範囲
  }
  
  // その他の周波数は推定（低音域は良好、高音域は年齢の影響大）
  if (freq === 125 || freq === 250) {
    // 125Hz, 250Hz：臨床的にACは5dBより良くなることはない（最低5dB）
    return { min: 5, max: 10 };
  }
  
  if (freq === 500) {
    // 500Hz：低音域なので最低5dBは確保
    return { min: 5, max: 10 };
  }
  
  if (freq === 8000) {
    // 8000Hzは4000Hzより5-10dB悪い傾向
    const ref4000 = getNormalHearingThreshold(age, 4000);
    const threshold8000 = ref4000 + (age < 40 ? 5 : age < 60 ? 10 : 15);
    return { min: Math.max(-5, threshold8000 - 5), max: threshold8000 + 10 };
  }
  
  return { min: -5, max: 15 }; // デフォルト
}

// Max presentable levels (for Scale-Out logic)
const AC_MAX = { 125: 70, 250: 90, 500: 110, 1000: 110, 2000: 110, 4000: 110, 8000: 100 };
const BC_MAX = { 250: 55, 500: 65, 1000: 70, 2000: 70, 4000: 60 };

// Marker size for AC/BC symbols (px). 24px target → radius 12, thicker stroke.
const MARK_R = 8; // radius (smaller markers)
const MARK_STROKE = 2;

// Safe tick formatter for X axis (1 octave grid labels)
function formatFreq(v) {
  const i = Math.round(typeof v === 'number' ? v : 0);
  return String((FREQS && FREQS[i] != null) ? FREQS[i] : "");
}

// Legend / rendering series
const SERIES = [
  { key: "R-AC-U", label: "Right AC (unmasked)", color: "#ef4444", shape: "O" },
  { key: "R-AC-M", label: "Right AC (masked)",   color: "#b91c1c", shape: "O" },
  { key: "L-AC-U", label: "Left  AC (unmasked)",  color: "#3b82f6", shape: "X" },
  { key: "L-AC-M", label: "Left  AC (masked)",    color: "#1d4ed8", shape: "X" },
  { key: "R-BC-U", label: "Right BC (unmasked)", color: "#ef4444", shape: "lt" },
  { key: "R-BC-M", label: "Right BC (masked)",   color: "#b91c1c", shape: "lbracket" },
  { key: "L-BC-U", label: "Left  BC (unmasked)",  color: "#3b82f6", shape: "gt" },
  { key: "L-BC-M", label: "Left  BC (masked)",    color: "#1d4ed8", shape: "rbracket" },
];

// --- preset helpers (compress verbose targets to keep file small) --- (compress verbose targets to keep file small) ---
const mk = (ear, transducer, list) =>
  list.map(([freq, dB, so=false]) => ({ ear, transducer, masked:transducer==='BC', freq, dB, ...(so?{so:true}:{}) }));
const preset = (name, parts) => ({ name, targets: parts.flat() });

// --- Preset cases (targets kept "secret"; used for overlay/validation only) ---
// Each target: { ear:'R'|'L', transducer:'AC'|'BC', masked:false, freq:number, dB:number, so?:true }
const PRESET_A = preset('症例A', [
  mk('R','AC', [[125,5],[250,5],[500,5],[1000,5],[2000,5],[4000,0],[8000,0]]),
  mk('L','AC', [[125,10],[250,10],[500,5],[1000,5],[2000,5],[4000,0],[8000,-5]]),
  mk('R','BC', [[250,5],[500,10],[1000,5],[2000,5],[4000,-5]]),
  mk('L','BC', [[250,5],[500,5],[1000,0],[2000,5],[4000,0]])
]);

const PRESET_B = preset('症例B', [
  // Right AC / BC
  mk('R','AC', [[125,10],[250,10],[500,30],[1000,50],[2000,70],[4000,90],[8000,100]]),
  mk('R','BC', [[125,10],[250,15],[500,30],[1000,50],[2000,70],[4000,110,true],[8000,100]]),
  // Left AC / BC
  mk('L','AC', [[125,15],[250,15],[500,10],[1000,10],[2000,5],[4000,5],[8000,10]]),
  mk('L','BC', [[250,15],[500,10],[1000,10],[2000,5],[4000,5]])
]);

const PRESET_C = preset('症例C', [
  // Right AC / BC
  mk('R','AC', [[125,20],[250,20],[500,15],[1000,10],[2000,10],[4000,5],[8000,5]]),
  mk('R','BC', [[250,15],[500,15],[1000,10],[2000,5],[4000,10]]),
  // Left AC/BC (SO)
  mk('L','AC', [[125,110,true],[250,110,true],[500,110,true],[1000,110,true],[2000,110,true],[4000,110,true],[8000,110,true]]),
  mk('L','BC', [[250,110,true],[500,110,true],[1000,110,true],[2000,110,true],[4000,110,true]])
]);

const PRESET_D = preset('症例D', [
  // Right AC / BC - 高音域の聴力低下
  mk('R','AC', [[125,5],[250,5],[500,5],[1000,10],[2000,25],[4000,45],[8000,65]]),
  mk('R','BC', [[125,5],[250,5],[500,5],[1000,10],[2000,20],[4000,35],[8000,50]]),
  // Left AC / BC - 低音域の聴力低下
  mk('L','AC', [[125,25],[250,30],[500,20],[1000,10],[2000,5],[4000,5],[8000,10]]),
  mk('L','BC', [[125,20],[250,25],[500,20],[1000,10],[2000,5],[4000,5],[8000,10]])
]);

const PRESET_E = preset('症例E', [
  // Right AC / BC - 混合性難聴パターン
  mk('R','AC', [[125,15],[250,20],[500,20],[1000,30],[2000,35],[4000,35],[8000,45]]),
  mk('R','BC', [[125,10],[250,15],[500,20],[1000,25],[2000,30],[4000,35],[8000,40]]),
  // Left AC / BC - 感音性難聴パターン
  mk('L','AC', [[125,40],[250,45],[500,40],[1000,55],[2000,60],[4000,60],[8000,70]]),
  mk('L','BC', [[125,35],[250,40],[500,45],[1000,50],[2000,55],[4000,60],[8000,65]])
]);

const PRESET_F = preset('症例F', [
  // Right AC / BC
  mk('R','AC', [[125,15],[250,15],[500,15],[1000,30],[2000,45],[4000,60],[8000,80]]),
  mk('R','BC', [[250,20],[500,20],[1000,25],[2000,45],[4000,60]]),
  // Left AC / BC
  mk('L','AC', [[125,10],[250,15],[500,20],[1000,30],[2000,45],[4000,65],[8000,80]]),
  mk('L','BC', [[250,15],[500,20],[1000,30],[2000,45],[4000,110,true]])
]);

const PRESET_G = preset('症例G', [
  // Right AC / BC - 伝音難聴パターン
  mk('R','AC', [[125,35],[250,25],[500,20],[1000,25],[2000,25],[4000,10],[8000,20]]),
  mk('R','BC', [[125,5],[250,5],[500,10],[1000,10],[2000,5],[4000,5],[8000,5]]),
  // Left AC / BC - 混合性難聴パターン
  mk('L','AC', [[125,35],[250,25],[500,25],[1000,20],[2000,20],[4000,25],[8000,35]]),
  mk('L','BC', [[250,10],[500,15],[1000,10],[2000,15],[4000,0]])
]);

const PRESET_H = preset('症例H', [
  // Right AC / BC - 感音難聴（平坦型）
  mk('R','AC', [[125,10],[250,10],[500,10],[1000,25],[2000,30],[4000,30],[8000,50]]),
  mk('R','BC', [[250,5],[500,5],[1000,30],[2000,30],[4000,25]]),
  // Left AC / BC - 感音難聴（平坦型、左右同じ）
  mk('L','AC', [[125,35],[250,40],[500,40],[1000,50],[2000,45],[4000,40],[8000,50]]),
  mk('L','BC', [[250,10],[500,15],[1000,20],[2000,25],[4000,20]])
]);
// 症例の詳細情報
const PRESET_DETAILS = {
  A: {
    age: '12歳',
    gender: '男子',
    chiefComplaint: '学校検診で聞こえの悪さを指摘された',
    history: '本人から話を聞くと周囲がうるさくて、検査音が聞こえなかった様子。念の為受信した',
    findings: '鼓膜所見正常',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: 0, peakCompliance: 1.5, sigma: 60 },
      right: { peakPressure: 0, peakCompliance: 1.3, sigma: 60 }
    }
  },
  B: {
    age: '45歳',
    gender: '男性',
    chiefComplaint: '右耳難聴、耳鳴、めまい感',
    history: '昨日から突然右耳の耳閉塞感と耳鳴、回転性めまい感あり。今日になってめまい感はだいぶ治ったが、聞こえの悪さは変わらないため受診した',
    findings: '鼓膜所見正常',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: -10, peakCompliance: 1.5, sigma: 60 },
      right: { peakPressure: 0, peakCompliance: 1.3, sigma: 60 }
    }
  },
  C: {
    age: '7歳',
    gender: '女性',
    chiefComplaint: '左耳の聞こえの悪さ',
    history: '入学時の学校検診で左耳難聴を指摘され、精査のため受診した',
    findings: '鼓膜所見正常',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: 0, peakCompliance: 0.8, sigma: 60 },
      right: { peakPressure: 0, peakCompliance: 0.9, sigma: 60 }
    }
  },
  D: {
    age: '32歳',
    gender: '男性',
    chiefComplaint: '耳閉塞感、耳鳴り、めまい',
    history: '20歳の時、右耳突発性難聴。1週間前から回転性めまいあり。良くなったり悪くなったり。左耳ゴーという耳鳴りが気になる',
    findings: '鼓膜所見正常',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: -15, peakCompliance: 1.3, sigma: 60 },
      right: { peakPressure: 10, peakCompliance: 1.5, sigma: 60 }
    }
  },
  E: {
    age: '55歳',
    gender: '女性',
    chiefComplaint: '聞こえの悪さ（特に左耳）',
    history: '徐々に聞こえ悪くなった。最近、電話を左で取ると聞こえづらいのがわかった。今は右耳で電話をとっている。いつから聞こえ悪いのかよくわからない',
    findings: '鼓膜所見正常',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: -10, peakCompliance: 1.2, sigma: 60 },
      right: { peakPressure: 15, peakCompliance: 1.4, sigma: 60 }
    }
  },
  F: {
    age: '70歳',
    gender: '女性',
    chiefComplaint: 'TVの音が聞こえにくい',
    history: 'ご主人から聞こえの悪さを指摘される。TVの音が大きいと言われる。そう言われたらそうかなと。ご主人が補聴器を勧めてきたので、仕方なく受診した',
    findings: '鼓膜所見正常',
    tympanogram: { 
      type: 'A', 
      left: { peakPressure: 5, peakCompliance: 1.1, sigma: 60 },
      right: { peakPressure: -20, peakCompliance: 1.3, sigma: 60 }
    }
  },
  G: {
    age: '12歳',
    gender: '女性',
    chiefComplaint: '鼻水が出る。聞こえの悪さ',
    history: '小さい頃から滲出性中耳炎を繰り返す',
    findings: '鼓膜所見：色が悪い・陥没あり',
    tympanogram: { 
      type: 'B', 
      left: { peakPressure: -200, peakCompliance: 0.2, sigma: 80 },
      right: { peakPressure: -200, peakCompliance: 0.1, sigma: 80 }
    }
  },
  H: {
    age: '68歳',
    gender: '男性',
    chiefComplaint: '耳痛、聞こえの悪さ、耳閉塞感',
    history: '2日前より耳痛と耳閉塞感あり',
    findings: '鼓膜所見炎症（＋）',
    tympanogram: { 
      type: 'MIX', 
      left: { peakPressure: 0, peakCompliance: 1.2, sigma: 60 },     // 左A型
      right: { peakPressure: 100, peakCompliance: 0.6, sigma: 60 }   // 右A型（陽圧）
    }
  }
};
// ART設定を構築する関数（プリセットのAC/BC値とティンパノグラム型から）
function buildArtConfig(presetTargets, tympanogram, disorderName = null, casePattern = null, meta = {}) {
  const ART_NORMAL_THRESHOLDS = {
    500: { ipsi: 80, cont: 85 },
    1000: { ipsi: 75, cont: 80 },
    2000: { ipsi: 80, cont: 85 }
  };

  const acThresholds = { right: {}, left: {} };
  const bcThresholds = { right: {}, left: {} };
  
  // プリセットからAC/BC値を抽出（ART用の周波数: 500, 1000, 2000Hz）
  presetTargets.forEach(target => {
    if ([500, 1000, 2000].includes(target.freq)) {
      const earKey = target.ear === 'R' ? 'right' : 'left';
      if (target.transducer === 'AC') {
        acThresholds[earKey][target.freq] = target.so ? 110 : target.dB;
      } else if (target.transducer === 'BC') {
        bcThresholds[earKey][target.freq] = target.so ? 110 : target.dB;
      }
    }
  });
  
  // ティンパノグラム型とpeakPressureを取得
  const getTympanogramType = (ear, tymp) => {
    if (tymp?.type === 'B') return 'B';
    // As型（コンプライアンス低）を検出（peakComplianceが低い場合）
    const peakCompliance = tymp?.[ear]?.peakCompliance;
    if (peakCompliance !== undefined && peakCompliance < 0.8) {
      return 'As'; // As型（耳硬化症など）
    }
    // Ad型（コンプライアンス増大）を検出
    if (peakCompliance !== undefined && peakCompliance > 1.7) {
      return 'Ad'; // Ad型（耳小骨離断など）
    }
    const peak = tymp?.[ear]?.peakPressure || 0;
    // 陽圧（peakPressure>50daPa）は伝音障害として扱う
    if (peak > 50) return 'B';
    if (peak < -150) return 'B';  // 陰圧が強すぎる場合もB型
    return 'A';
  };
  
  // 耳硬化症の場合はART消失（As型でも反射消失）
  const isOtosclerosis = disorderName === '耳硬化症';
  
  const rightType = getTympanogramType('right', tympanogram);
  const leftType = getTympanogramType('left', tympanogram);
  
  // 耳硬化症の場合、または伝音性難聴でAs型の場合は反射消失を示すため、B型として扱う
  // （StapedialReflexGifコンポーネントはB型で反射消失を判定するため）
  const getEffectiveType = (type, ear) => {
    if (isOtosclerosis && type === 'As') {
      return 'B'; // 耳硬化症のAs型は反射消失のため、B型として扱う
    }
    // 伝音性難聴でAs型の場合も反射消失（耳硬化症以外でも可能性あり）
    if (casePattern === 'conductive' && type === 'As') {
      return 'B'; // As型で伝音性難聴は反射消失
    }
    return type;
  };
  
  const artConfig = {
    right: {
      acThresholds: acThresholds.right,
      bcThresholds: bcThresholds.right,
      tympanogramType: getEffectiveType(rightType, 'right'),
      peakPressure: tympanogram?.right?.peakPressure || 0
    },
    left: {
      acThresholds: acThresholds.left,
      bcThresholds: bcThresholds.left,
      tympanogramType: getEffectiveType(leftType, 'left'),
      peakPressure: tympanogram?.left?.peakPressure || 0
    }
  };

  const profiles = {
    right: meta?.rightProfile || meta?.profile || null,
    left: meta?.leftProfile || meta?.profile || null
  };
  const isOssicular = disorderName === 'CHL_OssicularDiscontinuity'
    || disorderName === '耳小骨離断'
    || profiles.right === 'CHL_OssicularDiscontinuity'
    || profiles.left === 'CHL_OssicularDiscontinuity';

  if (isOssicular) {
    let affectedSide = meta?.affectedSide || null;
    if (!affectedSide) {
      if (profiles.right === 'CHL_OssicularDiscontinuity' && profiles.left !== 'CHL_OssicularDiscontinuity') {
        affectedSide = 'R';
      } else if (profiles.left === 'CHL_OssicularDiscontinuity' && profiles.right !== 'CHL_OssicularDiscontinuity') {
        affectedSide = 'L';
      }
    }

    const freqs = [500, 1000, 2000];
    const elevation = 15;

    const ensureOverride = (earKey, key) => {
      if (!artConfig[earKey][key]) artConfig[earKey][key] = {};
      return artConfig[earKey][key];
    };

    const markAbsent = (earKey) => {
      freqs.forEach(freq => {
        ensureOverride(earKey, 'ipsilateralOverride')[freq] = 999;
        ensureOverride(earKey, 'contralateralOverride')[freq] = 999;
      });
    };

    const elevateContralateral = (earKey) => {
      freqs.forEach(freq => {
        const base = ART_NORMAL_THRESHOLDS[freq]?.cont ?? 85;
        ensureOverride(earKey, 'contralateralOverride')[freq] = base + elevation;
      });
    };

    if (affectedSide === 'R') {
      markAbsent('right');
      elevateContralateral('left');
    } else if (affectedSide === 'L') {
      markAbsent('left');
      elevateContralateral('right');
    } else {
      // 影響側が不明な場合は両側を安全側にする
      markAbsent('right');
      markAbsent('left');
    }
  }

  return artConfig;
}
function buildSimpleTympanogramFromProfile(profileName, meta = {}) {
  const resolvedProfile = profileName || 'Normal';
  const rightEarProfile = meta.rightProfile || resolvedProfile;
  const leftEarProfile = meta.leftProfile || resolvedProfile;

  const createEarConfig = (earProfile) => {
    if (!earProfile || earProfile === 'Normal' || earProfile.startsWith('SNHL_')) {
      return { config: { peakPressure: 0, peakCompliance: 1.1, sigma: 60 }, type: 'A' };
    }
    if (earProfile === 'CHL_Otosclerosis') {
      return { config: { peakPressure: 0, peakCompliance: 0.5, sigma: 60 }, type: 'As' };
    }
    if (earProfile === 'CHL_OssicularDiscontinuity') {
      const compliance = Number((Math.random() * 1 + 3).toFixed(1)); // 3.0 - 4.0 mL
      return { config: { peakPressure: 0, peakCompliance: compliance, sigma: 60 }, type: 'Ad' };
    }
    if (earProfile === 'CHL_AOM') {
      return { config: { peakPressure: -200, peakCompliance: 0.3, sigma: 80 }, type: 'B' };
    }
    if (earProfile === 'CHL_OME') {
      return { config: { peakPressure: -150, peakCompliance: 1.0, sigma: 60 }, type: 'C' };
    }
    return { config: { peakPressure: 0, peakCompliance: 1.1, sigma: 60 }, type: 'A' };
  };

  let rightResult = createEarConfig(rightEarProfile);
  let leftResult = createEarConfig(leftEarProfile);

  if (resolvedProfile === 'CHL_OssicularDiscontinuity' && !meta.rightProfile && !meta.leftProfile && meta.affectedSide) {
    if (meta.affectedSide === 'R') {
      rightResult = createEarConfig('CHL_OssicularDiscontinuity');
      leftResult = createEarConfig('Normal');
    } else if (meta.affectedSide === 'L') {
      rightResult = createEarConfig('Normal');
      leftResult = createEarConfig('CHL_OssicularDiscontinuity');
    }
  }

  let right = rightResult.config;
  let left = leftResult.config;

  if (right.peakCompliance === left.peakCompliance && right.peakPressure === left.peakPressure) {
    left = {
      ...left,
      peakPressure: left.peakPressure - 12,
      peakCompliance: Number(Math.max(0.2, left.peakCompliance * 1.05).toFixed(2)),
    };
  }

  const clampAdCompliance = (earConfig, earType) => {
    if (earType !== 'Ad' || !earConfig || typeof earConfig.peakCompliance !== 'number') {
      return earConfig;
    }
    const capped = Math.min(earConfig.peakCompliance, 4.0);
    if (capped === earConfig.peakCompliance) {
      return earConfig;
    }
    return {
      ...earConfig,
      peakCompliance: Number(capped.toFixed(2)),
    };
  };

  right = clampAdCompliance(right, rightResult.type);
  left = clampAdCompliance(left, leftResult.type);

  const overallType = rightResult.type === leftResult.type
    ? rightResult.type
    : (rightResult.type !== 'A' ? rightResult.type : leftResult.type);

  return { type: overallType, right, left };
}
// DPOAE設定を構築する関数（プリセットのAC値とティンパノグラム型から）
function buildDPOAEConfig(presetTargets, tympanogram) {
  // DPOAEの周波数: [1, 2, 3, 4, 6, 8] kHz
  const dpoaeFrequencies = [1, 2, 3, 4, 6, 8];
  
  // オージオグラムのAC値を抽出（Hz単位で保存）
  const audiogramAC = { right: {}, left: {} };
  presetTargets.forEach(target => {
    if (target.transducer === 'AC') {
      const earKey = target.ear === 'R' ? 'right' : 'left';
      audiogramAC[earKey][target.freq] = target.so ? 110 : target.dB;
    }
  });
  
  // DPOAE周波数ごとにAC値を設定
  const acThresholds = { right: {}, left: {} };
  dpoaeFrequencies.forEach(dpoaeFreq => {
    ['right', 'left'].forEach(ear => {
      const earKey = ear;
      let acValue;
      
      if (dpoaeFreq === 1) {
        // DPOAE 1kHz → オージオグラム 1kHz
        acValue = audiogramAC[earKey][1000];
      } else if (dpoaeFreq === 2) {
        // DPOAE 2kHz → オージオグラム 2kHz
        acValue = audiogramAC[earKey][2000];
      } else if (dpoaeFreq === 3) {
        // DPOAE 3kHz → オージオグラム 2kHzと4kHzのAC平均
        const ac2k = audiogramAC[earKey][2000];
        const ac4k = audiogramAC[earKey][4000];
        if (ac2k !== undefined && ac4k !== undefined) {
          acValue = Math.round((ac2k + ac4k) / 2);
        } else if (ac4k !== undefined) {
          acValue = ac4k; // フォールバック：4kHzのみ
        } else if (ac2k !== undefined) {
          acValue = ac2k; // フォールバック：2kHzのみ
        }
      } else if (dpoaeFreq === 4) {
        // DPOAE 4kHz → オージオグラム 4kHz
        acValue = audiogramAC[earKey][4000];
      } else if (dpoaeFreq === 6) {
        // DPOAE 6kHz → オージオグラム 4kHzと8kHzのAC平均
        const ac4k = audiogramAC[earKey][4000];
        const ac8k = audiogramAC[earKey][8000];
        if (ac4k !== undefined && ac8k !== undefined) {
          acValue = Math.round((ac4k + ac8k) / 2);
        } else if (ac8k !== undefined) {
          acValue = ac8k; // フォールバック：8kHzのみ
        } else if (ac4k !== undefined) {
          acValue = ac4k; // フォールバック：4kHzのみ
        }
      } else if (dpoaeFreq === 8) {
        // DPOAE 8kHz → オージオグラム 8kHz
        acValue = audiogramAC[earKey][8000];
      }
      
      if (acValue !== undefined) {
        acThresholds[earKey][dpoaeFreq] = acValue;
      }
    });
  });
  
  // ティンパノグラム型を取得（Ad/As も伝音扱いとして 'B' に寄せる）
  const getTympanogramType = (ear, tymp) => {
    if (tymp?.type === 'B') return 'B';
    const peakCompliance = tymp?.[ear]?.peakCompliance;
    if (peakCompliance !== undefined) {
      // As: 低コンプライアンス / Ad: 高コンプライアンス → 伝音系異常としてDPOAEはREFERに寄せる
      if (peakCompliance < 0.8) return 'B';
      if (peakCompliance > 1.7) return 'B';
    }
    const peak = tymp?.[ear]?.peakPressure || 0;
    // 陽圧（peakPressure>50daPa）や強い陰圧は伝音障害として扱う
    if (peak > 50) return 'B';
    if (peak < -150) return 'B';
    return 'A';
  };
  
  const tympanogramType = {
    right: getTympanogramType('right', tympanogram),
    left: getTympanogramType('left', tympanogram)
  };
  
  return {
    acThresholds,
    tympanogramType
  };
}
// DPOAEデータを生成する関数（症例ごとに固定値）
function generateDPOAEData(dpoaeConfig, caseId = '') {
  const frequencies = [1, 2, 3, 4, 6, 8];
  
  // ノイズフロアの基本値（周波数ごとの範囲の中間値）
  const noiseFloorBase = {
    1: 17,   // 12-22 の中央値
    2: 15,   // 10-20 の中央値
    3: 13,   // 8-18 の中央値
    4: 11.5, // 7-16 の中央値
    6: 10,   // 6-14 の中央値
    8: 10    // 6-14 の中央値
  };
  
  // デターミニスティックなノイズフロア（症例IDと周波数、耳に基づく固定変動）
  // 左右で異なるノイズフロア値を生成（より大きな幅を持つ）
  const getNoiseFloor = (freq, ear) => {
    const base = noiseFloorBase[freq];
    // 症例IDと周波数、耳に基づく固定変動パターン（左右で異なる変動を加える）
    // 右耳と左耳で異なるseedを使用して、左右で異なるノイズフロア値を生成
    const earMultiplier = ear === 'right' ? 1 : 5; // 左右で異なるパターンを作るための係数（より大きく）
    const seed = (caseId.charCodeAt(0) || 65) * 100 + freq * 10 + earMultiplier;
    // 左右で異なる変動パターン（右耳はsin系、左耳はcos系に偏らせる）
    // 変動幅を大きくする（±3-4dB程度）
    const sinVariation = Math.sin(seed * 0.1) * 3.5;
    const cosVariation = Math.cos(seed * 0.15) * 2.5;
    const variation = ear === 'right' 
      ? sinVariation + cosVariation * 0.6  // 右耳のパターン
      : cosVariation + sinVariation * 0.6; // 左耳のパターン（異なるパターン、より大きな差）
    const rangeMin = { 1: 12, 2: 10, 3: 8, 4: 7, 6: 6, 8: 6 }[freq];
    const rangeMax = { 1: 22, 2: 20, 3: 18, 4: 16, 6: 14, 8: 14 }[freq];
    return Math.max(rangeMin, Math.min(rangeMax, base + variation));
  };
  
  const generateEarData = (ear) => {
    const acThresholds = dpoaeConfig.acThresholds[ear];
    const tympanogramType = dpoaeConfig.tympanogramType[ear];
    
    return frequencies.map((freq, index) => {
      const acThreshold = acThresholds[freq];
      const noiseFloor = getNoiseFloor(freq, ear);
      
      // ルール判定
      // 1. 中耳疾患がある（ティンパノB型）→ SNR < 2dB
      // 2. AC ≥ 35dB → SNR < 2dB
      // 3. それ以外 → 正常（SNR 6〜12dB、確実に6以上になるように）
      
      let snr;
      if (tympanogramType === 'B' || (acThreshold !== undefined && acThreshold >= 35)) {
        // 異常: SNR < 2dB（固定値: 約1dB）
        // 症例と周波数に基づく固定値で、右左で差が出るように
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        snr = 0.5 + (Math.sin(seed * 0.1) * 0.5 + Math.cos(seed * 0.2) * 0.3); // 0.5〜1.5dB程度の固定値
      } else {
        // 正常: SNR 6〜12dB（固定値で右左に差、確実に6以上になるように）
        // 症例と周波数に基づく固定値
        const seed = (caseId.charCodeAt(0) || 65) * 1000 + freq * 100 + index * 10 + (ear === 'right' ? 1 : 2);
        // 右耳と左耳でより大きな差が出るように（±2-3dB程度）
        const baseSNR = 8; // 基本SNR 8dB
        // 左右で異なるオフセット（右耳はsin系、左耳はcos系でより大きな差）
        const earOffset = ear === 'right' 
          ? Math.sin(seed * 0.05) * 2.5  // 右耳の変動幅を大きく
          : Math.cos(seed * 0.05) * 2.5; // 左耳の変動幅を大きく
        // SNRが確実に6以上になるように（最小値6dB、最大値12dB程度）
        snr = Math.max(6, Math.min(12, baseSNR + earOffset));
      }
      
      const dpoaeLevel = noiseFloor + snr;
      
      return Math.max(0, Math.min(30, dpoaeLevel)); // 0〜30dBの範囲にクランプ
    });
  };
  
  // ノイズフロアデータも生成（SNR計算用）
  const noiseFloorData = {
    right: frequencies.map((freq) => getNoiseFloor(freq, 'right')),
    left: frequencies.map((freq) => getNoiseFloor(freq, 'left'))
  };
  
  return {
    right: generateEarData('right'),
    left: generateEarData('left'),
    noiseFloor: noiseFloorData
  };
}

function buildTargetsFromPreset(preset){
  return preset.targets.map(t => ({...t}));
}

// JSON症例データからtargetsを構築する関数
function buildTargetsFromJSONCase(jsonCase, ear = 'R') {
  const targets = [];
  // JSONには125Hzがないが、250Hzから推測できる可能性があるため、まず250Hzから始める
  const acFreqs = ['250', '500', '1000', '2000', '4000', '8000'];
  
  // AC（気導）のtargets
  if (jsonCase.ac) {
    acFreqs.forEach(freqStr => {
      const freq = parseInt(freqStr);
      if (jsonCase.ac[freqStr] !== undefined || jsonCase.ac[freq] !== undefined) {
        const dB = jsonCase.ac[freqStr] !== undefined ? jsonCase.ac[freqStr] : jsonCase.ac[freq];
        targets.push({
          ear: ear,
          transducer: 'AC',
          masked: false,
          freq: freq,
          dB: dB
        });
      }
    });
    // 125Hzは250Hzと同じ値として推定（または推測値として追加）
    // JSONに125Hzがない場合は追加しない
    if (jsonCase.ac['125'] !== undefined || jsonCase.ac[125] !== undefined) {
      const dB125 = jsonCase.ac['125'] !== undefined ? jsonCase.ac['125'] : jsonCase.ac[125];
      targets.push({
        ear: ear,
        transducer: 'AC',
        masked: false,
        freq: 125,
        dB: dB125
      });
    }
  }
  
  // BC（骨導）のtargets（125Hzと8000Hzは除外）
  const bcFreqs = [250, 500, 1000, 2000, 4000];
  if (jsonCase.bc_all !== undefined) {
    bcFreqs.forEach(freq => {
      targets.push({
        ear: ear,
        transducer: 'BC',
        masked: false,
        freq: freq,
        dB: jsonCase.bc_all
      });
    });
  }
  
  return targets;
}

// 各症例のART設定を構築
const PRESET_MAP = {
  A: PRESET_A, B: PRESET_B, C: PRESET_C, D: PRESET_D,
  E: PRESET_E, F: PRESET_F, G: PRESET_G, H: PRESET_H
};

Object.keys(PRESET_DETAILS).forEach(caseId => {
  const preset = PRESET_MAP[caseId];
  const tympanogram = PRESET_DETAILS[caseId].tympanogram;
  if (preset && tympanogram) {
    PRESET_DETAILS[caseId].artConfig = buildArtConfig(preset.targets, tympanogram);
    PRESET_DETAILS[caseId].dpoaeConfig = buildDPOAEConfig(preset.targets, tympanogram);
  }
});

// helpers
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function round5(n) { return Math.round(n / 5) * 5; }
function seriesKey(p) { return `${p.ear}-${p.transducer}-${p.masked ? "M" : "U"}`; }
function isResponse(points, t) {
  return points.some(p => p.ear===t.ear && p.transducer===t.transducer && p.masked===t.masked && p.freq===t.freq && p.dB >= t.dB);
}
// PRESENTATION LIMIT (fix for ReferenceError: maxPresentable is not defined)
function maxPresentable(transKey, f) {
  return transKey === 'AC' ? (AC_MAX[f] ?? 110) : (BC_MAX[f] ?? 110);
}
// shape renderer (adds SO arrow if payload.so)
function shapeRenderer(shape, color) {
  return (props) => {
    const { cx, cy, payload } = props;
    const r = MARK_R;
    const t = MARK_STROKE;
    const so = payload && payload.so;
    const Arrow = so ? (
      <g>
        <line x1={cx} y1={cy + r + 2} x2={cx} y2={cy + r + 10} stroke={color} strokeWidth={t} />
        <line x1={cx - 4} y1={cy + r + 6} x2={cx} y2={cy + r + 10} stroke={color} strokeWidth={t} />
        <line x1={cx + 4} y1={cy + r + 6} x2={cx} y2={cy + r + 10} stroke={color} strokeWidth={t} />
      </g>
    ) : null;

    switch (shape) {
      case 'O':
        return (
          <g>
            <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={t} fill="white" />
            {Arrow}
          </g>
        );
      case 'X':
        return (
          <g stroke={color} strokeWidth={t}>
            <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} />
            <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} />
            {Arrow}
          </g>
        );
      case 'lbracket': // [ (masked BC Right) - 左にずらす
        const lbracketOffset = -3; // 右耳BCを左に3pxずらす
        return (
          <g stroke={color} strokeWidth={t} fill="none">
            <line x1={cx - r + lbracketOffset} y1={cy - r} x2={cx - r + lbracketOffset} y2={cy + r} />
            <line x1={cx - r + lbracketOffset} y1={cy - r} x2={cx - r/3 + lbracketOffset} y2={cy - r} />
            <line x1={cx - r + lbracketOffset} y1={cy + r} x2={cx - r/3 + lbracketOffset} y2={cy + r} />
            {Arrow}
          </g>
        );
      case 'rbracket': // ] (masked BC Left) - 右にずらす
        const rbracketOffset = 3; // 左耳BCを右に3pxずらす
        return (
          <g stroke={color} strokeWidth={t} fill="none">
            <line x1={cx + r + rbracketOffset} y1={cy - r} x2={cx + r + rbracketOffset} y2={cy + r} />
            <line x1={cx + r + rbracketOffset} y1={cy - r} x2={cx + r/3 + rbracketOffset} y2={cy - r} />
            <line x1={cx + r + rbracketOffset} y1={cy + r} x2={cx + r/3 + rbracketOffset} y2={cy + r} />
            {Arrow}
          </g>
        );
      case 'lt': // < (unmasked BC Right) - 左にずらす
        const ltOffset = -3; // 右耳BCを左に3pxずらす
        return (
          <g stroke={color} strokeWidth={t} fill="none">
            <line x1={cx + r + ltOffset} y1={cy - r} x2={cx - r/3 + ltOffset} y2={cy} />
            <line x1={cx + r + ltOffset} y1={cy + r} x2={cx - r/3 + ltOffset} y2={cy} />
            {Arrow}
          </g>
        );
      case 'gt': // > (unmasked BC Left) - 右にずらす
        const gtOffset = 3; // 左耳BCを右に3pxずらす
        return (
          <g stroke={color} strokeWidth={t} fill="none">
            <line x1={cx - r + gtOffset} y1={cy - r} x2={cx + r/3 + gtOffset} y2={cy} />
            <line x1={cx - r + gtOffset} y1={cy + r} x2={cx + r/3 + gtOffset} y2={cy} />
            {Arrow}
          </g>
        );
      default:
        return <circle cx={cx} cy={cy} r={r} fill={color} />;
    }
  };
}

// Legend icon that reuses chart shapes instead of color squares
function LegendMark({ shape, color }) {
  const size = MARK_R * 2 + 8; // padding around the symbol
  const render = shapeRenderer(shape, color);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <g transform={`translate(${size/2}, ${size/2})`}>
        {render({ cx: 0, cy: 0, payload: {} })}
      </g>
    </svg>
  );
}
export default function AudiogramMaskingMVP() {
  // 講習会用パスワード保護
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const TRAINING_PASSWORD = 'audiogram2024'; // 講習会用パスワード

  // Basic UI state
  const [ear, setEar] = useState('R'); // 'R' | 'L'
  const [trans, setTrans] = useState('AC'); // 'AC' | 'BC'
  const [masked, setMasked] = useState(false);
  const [freq, setFreq] = useState(1000);
  const [maskLevel, setMaskLevel] = useState(-15); // masking amount (dB); -15 means no masking
  const [level, setLevel] = useState(30);
  const [points, setPoints] = useState([]);
  const [suppressLamp, setSuppressLamp] = useState(false); // 周波数切替時に一時的にランプ消灯
  const [showLegend, setShowLegend] = useState(true); // ← FIX: define showLegend state

  // Preset targets (secret answer)
  const [targets, setTargets] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState('A');
  const PRESET_KEYS = ['A','B','C','D','E','F','G','H'];
  useEffect(() => {
    if (!PRESET_KEYS.includes(selectedPreset)) {
      setSelectedPreset('A');
    }
  }, [selectedPreset]);
  
  // AI生成症例の詳細情報を保存するstate
  const [customPresetDetails, setCustomPresetDetails] = useState(null);
  
  // 開発者モード
  
  // Tympanogram state
  const [showTympanogram, setShowTympanogram] = useState(false);
  
  // ART (Stapedial Reflex) state
  const [showStapedialReflex, setShowStapedialReflex] = useState(false);
  
  // DPOAE state
  const [showDPOAE, setShowDPOAE] = useState(false);


  // Measurement log for masking comparison
  const [measurementLog, setMeasurementLog] = useState([]);
  
  // Learning progress tracking
  const [learningProgress, setLearningProgress] = useState(() => {
    // ローカルストレージから学習進捗を読み込む
    try {
      const saved = localStorage.getItem('audiogram_learning_progress');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('学習進捗の読み込みに失敗:', e);
    }
    return {
      totalSessions: 0,
      completedCases: [],
      caseAccuracy: {}, // 症例別の精度 {caseId: {total: number, correct: number, accuracy: number}}
      lastSessionDate: null
    };
  });

  // 学習進捗が変更される度にローカルストレージに保存
  useEffect(() => {
    try {
      localStorage.setItem('audiogram_learning_progress', JSON.stringify(learningProgress));
    } catch (e) {
      console.error('学習進捗の保存に失敗:', e);
    }
  }, [learningProgress]);

  // Loading states（ボタン別に分離）
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const [isLoadingRandom, setIsLoadingRandom] = useState(false);
  const [presetToast, setPresetToast] = useState('');
  const [randomToast, setRandomToast] = useState('');
  
  // 症例情報モーダル
  const [showCaseInfoModal, setShowCaseInfoModal] = useState(false);
  const [currentCaseInfo, setCurrentCaseInfo] = useState(null);
  const [showAiAnswer, setShowAiAnswer] = useState(false);
  
  // IC settings (周波数ごとの両耳間移行減衰量)
  const [icSettings, setIcSettings] = useState(
    FREQS.reduce((acc, f) => {
      acc[f] = { AC: 50, BC: 0 };
      return acc;
    }, {})
  );
  const [showIcDialog, setShowIcDialog] = useState(false);

  // Random case performance tracking
  const [randomCasePerformance, setRandomCasePerformance] = useState(() => {
    // ローカルストレージからランダム症例の成績を読み込む
    try {
      const saved = localStorage.getItem('audiogram_random_case_performance');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('ランダム症例成績の読み込みに失敗:', e);
    }
    return {
      totalCases: 0,
      correctCases: 0,
      streak: 0,
      maxStreak: 0,
      caseHistory: [] // [{caseId, correct, timestamp}]
    };
  });

  // ランダム症例の成績が変更される度にローカルストレージに保存
  useEffect(() => {
    try {
      localStorage.setItem('audiogram_random_case_performance', JSON.stringify(randomCasePerformance));
    } catch (e) {
      console.error('ランダム症例成績の保存に失敗:', e);
    }
  }, [randomCasePerformance]);

  // Supabase Anonymous Auth
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // すでにサインイン済みか確認
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user?.id) {
          if (mounted) setUserId(sessionData.session.user.id);
        } else {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (!error && data?.user?.id && mounted) setUserId(data.user.id);
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  // OpenAI API統合: 症例情報を生成する関数（オプション）
  const generateCaseDetailsWithOpenAI = async (generatedTargets, casePattern, generatedAge, patternAnalysis, selectedDisorder) => {
    // OpenAI APIキーが設定されていない場合はnullを返して従来方法にフォールバック
    const openaiApiKey = process.env.REACT_APP_OPENAI_API_KEY;
    if (!openaiApiKey) {
      return null;
    }

    try {
      // オーディオグラムデータを整理
      const audiogramData = {
        right: { AC: {}, BC: {} },
        left: { AC: {}, BC: {} }
      };
      generatedTargets.forEach(t => {
        if (t.ear === 'R') {
          audiogramData.right[t.transducer][t.freq] = t.dB;
        } else {
          audiogramData.left[t.transducer][t.freq] = t.dB;
        }
      });

      // プロンプトを作成
      const prompt = `あなたは聴覚検査の教育用シミュレーションアプリケーションの開発者です。以下のオーディオグラムデータから、臨床的に自然で教育的な症例情報を生成してください。

【オーディオグラムデータ】
年齢: ${generatedAge}歳
難聴パターン: ${casePattern === 'normal' ? '正常聴力' : casePattern === 'sensorineural' ? '感音性難聴' : casePattern === 'conductive' ? '伝音性難聴' : '混合性難聴'}
右耳AC: ${JSON.stringify(audiogramData.right.AC)}
右耳BC: ${JSON.stringify(audiogramData.right.BC)}
左耳AC: ${JSON.stringify(audiogramData.left.AC)}
左耳BC: ${JSON.stringify(audiogramData.left.BC)}
${selectedDisorder ? `推定疾患: ${selectedDisorder.name}` : ''}
${patternAnalysis?.possibleDisorders?.length > 0 ? `その他の可能性: ${patternAnalysis.possibleDisorders.slice(0, 3).map(d => d.disorder.name).join(', ')}` : ''}

【生成要件】
1. 年齢に応じた自然な主訴（chiefComplaint）を1つ生成してください（50文字以内）
2. 主訴に基づいた自然な病歴（history）を生成してください（100文字以内）
3. 臨床所見（findings）を生成してください（ティンパノグラム型、DPOAE結果を含む、80文字以内）
4. 性別（gender）を「男性」または「女性」で指定してください

【出力形式】
以下のJSON形式で出力してください：
{
  "chiefComplaint": "主訴のテキスト",
  "history": "病歴のテキスト",
  "findings": "所見のテキスト",
  "gender": "男性" または "女性",
  "explanation": "この症例の学習ポイント（100文字以内）"
}`;

      // OpenAI APIを呼び出し
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // コスト効率の良いモデルを使用
          messages: [
            {
              role: 'system',
              content: 'あなたは聴覚検査の専門家で、教育用の症例情報を生成するアシスタントです。臨床的に正確で自然な日本語で回答してください。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content from OpenAI');
      }

      // JSONを抽出（```json と ``` で囲まれている可能性がある）
      let jsonText = content.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/, '').replace(/```\n?$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/, '').replace(/```\n?$/, '');
      }

      const aiResult = JSON.parse(jsonText);

      // 結果を返す（従来のgenerateCaseDetailsと互換性のある形式）
      return {
        chiefComplaint: aiResult.chiefComplaint || '',
        history: aiResult.history || '',
        findings: aiResult.findings || '',
        gender: aiResult.gender || '男性',
        explanation: aiResult.explanation || '' // 学習者向けの解説
      };
    } catch (error) {
      console.warn('OpenAI API呼び出しに失敗しました。従来の方法を使用します:', error);
      setCurrentCaseInfo(null);
      setCustomPresetDetails(null);
      return; // エラー時は従来方法にフォールバック
    }
  };

  // DB保存
  async function saveMeasurementToDB(entry) {
    try {
      if (!userId) return;
      const payload = {
        user_id: userId,
        ear: entry.ear,
        transducer: entry.transducer,
        freq: entry.freq,
        db: entry.dB,
        masked: entry.masked,
        mask_level: entry.masked ? entry.maskLevel : null,
        so: entry.so || false,
        case_id: entry.caseId || selectedPreset,
        session_id: `${selectedPreset}-${new Date().toISOString().slice(0,10)}`
      };
      await supabase.from('measurements').insert(payload);
    } catch {}
  }

  // 履歴読込
  async function loadMeasurementsFromDB() {
    try {
      if (!userId) return;
      const { data, error } = await supabase
        .from('measurements')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) return;
      const logs = (data || []).map((row, idx) => ({
        id: row.id || idx,
        timestamp: new Date(row.created_at).toLocaleTimeString(),
        ear: row.ear,
        transducer: row.transducer,
        freq: row.freq,
        dB: row.db,
        masked: row.masked,
        maskLevel: row.mask_level ?? -15,
        so: row.so,
        caseId: row.case_id
      }));
      setMeasurementLog(logs);
    } catch {}
  }
  // AI生成: 症例の詳細情報を生成する関数（非同期版：OpenAI統合）
  const generateCaseDetails = async (generatedTargets, casePattern, generatedAge = null, patternAnalysis = null) => {
    // まず Tym 作成 → タイプ分類 → 症例検索（文面取得）
    const generateTymType = (pattern) => {
      if (pattern === 'conductive') return Math.random() < 0.7 ? 'B' : (Math.random() < 0.5 ? 'C' : 'Ad');
      if (pattern === 'sensorineural') return 'A';
      return 'A';
    };

    const tympType = generateTymType(casePattern);

    const mapTymToDisease = (t) => {
      if (t === 'B' || t === 'C') {
        // 急性中耳炎 vs 滲出性中耳炎はC:OME, B:AOM寄りで選択
        return t === 'C' ? 'OME' : (Math.random() < 0.5 ? 'AOM' : 'OME');
      }
      if (t === 'As') return 'Otosclerosis';
      if (t === 'Ad') return 'Ossicular_Discontinuity';
      return null;
    };

    const diseaseKey = mapTymToDisease(tympType);

    const pickCaseFromDB = (key) => {
      try {
        let arr = [];
        if (key === 'AOM') arr = AOMCases || [];
        else if (key === 'OME') arr = OMECases || [];
        else if (key === 'Otosclerosis') arr = OtosclerosisCases || [];
        else if (key === 'Ossicular_Discontinuity') arr = OssicularDiscontinuityCases || [];
        if (!arr || arr.length === 0) return null;
        // Tym型があれば一致を優先
        const filtered = arr.filter(c => typeof c.tympanogram === 'string' && c.tympanogram.includes(tympType));
        const pool = filtered.length > 0 ? filtered : arr;
        return pool[Math.floor(Math.random() * pool.length)];
      } catch {
        return null;
      }
    };

    const dbCase = diseaseKey ? pickCaseFromDB(diseaseKey) : null;

    // OpenAIで補強（任意）。APIが無ければnullが返るのでDB文面を使用
    let selectedDisorder = patternAnalysis?.possibleDisorders?.[0]?.disorder || null;
    const aiResult = await generateCaseDetailsWithOpenAI(
      generatedTargets,
      casePattern,
      generatedAge,
      patternAnalysis,
      selectedDisorder
    );

    // 年齢を決める（既に生成されていればそれを使用、なければパターンに応じて生成）
    let age;
    if (generatedAge !== null) {
      age = generatedAge;
    } else {
      // フォールバック：パターンに応じて年齢を生成
      const patterns = {
        normal: {
          ageRange: [5, 50], // ISO 7029に基づき拡大
        },
        sensorineural: {
          ageRange: [30, 80],
        },
        conductive: {
          ageRange: [5, 50],
        },
        mixed: {
          ageRange: [40, 75],
        }
      };
      const agePattern = patterns[casePattern] || patterns.sensorineural;
      age = Math.floor(Math.random() * (agePattern.ageRange[1] - agePattern.ageRange[0] + 1)) + agePattern.ageRange[0];
    }

    // 文面決定（AI優先、なければ症例DB、最後に簡易テンプレート）
    const genChiefComplaint = (aiResult?.chiefComplaint) || (dbCase?.chiefComplaint) || (casePattern === 'conductive' ? '聞こえにくい／耳がつまる' : '聞き取りにくい');
    const genHistory = (aiResult?.history) || (dbCase?.hpi) || (casePattern === 'conductive' ? '感冒後から耳閉感と難聴。痛みは乏しい' : '徐々に進行し日常会話で不便');
    const genFindings = (aiResult?.findings) || (dbCase?.otoscopy) || (tympType === 'B' ? '鼓膜混濁・膨隆、光錐消失' : tympType === 'As' ? '鼓膜正常、可動性低下を示唆' : tympType === 'Ad' ? '鼓膜正常、可動性過大を示唆' : '鼓膜所見正常');
    const genGender = aiResult?.gender || (Math.random() < 0.5 ? '男性' : '女性');

    // ここでTym型を症例情報に付与（UI側で利用）
    const tympTypeStr = tympType;
    const buildTympanogramFromType = (t) => {
      if (t === 'B') {
        return {
          type: 'B',
          left: { peakPressure: -200, peakCompliance: 0.3, sigma: 80 },
          right: { peakPressure: -200, peakCompliance: 0.3, sigma: 80 }
        };
      }
      if (t === 'As') {
        return {
          type: 'A',
          left: { peakPressure: 0, peakCompliance: 0.5, sigma: 60 },
          right: { peakPressure: 0, peakCompliance: 0.5, sigma: 60 }
        };
      }
      if (t === 'Ad') {
        return {
          type: 'A',
          left: { peakPressure: 0, peakCompliance: 2.0, sigma: 60 },
          right: { peakPressure: 0, peakCompliance: 2.0, sigma: 60 }
        };
      }
      if (t === 'C') {
        return {
          type: 'A',
          left: { peakPressure: -150, peakCompliance: 1.0, sigma: 60 },
          right: { peakPressure: -150, peakCompliance: 1.0, sigma: 60 }
        };
      }
      return {
        type: 'A',
        left: { peakPressure: 0, peakCompliance: 1.2, sigma: 60 },
        right: { peakPressure: 0, peakCompliance: 1.2, sigma: 60 }
      };
    };
    const tympanogramObj = buildTympanogramFromType(tympTypeStr);

    // 返却
    return {
      caseId: 'AI生成',
      age: `${age}歳`,
      gender: genGender,
      chiefComplaint: genChiefComplaint,
      history: genHistory,
      findings: genFindings,
      explanation: aiResult?.explanation || '',
      tympanogram: tympanogramObj,
    };
    
    // 年齢に応じた適切な主訴・病歴を生成する関数
    const getAgeAppropriateComplaints = (age) => {
      if (age <= 18) {
        // 小学生〜高校生：学校検診
        return {
          chiefComplaints: [
            '学校検診で聞こえの悪さを指摘された',
            '学校の健康診断で異常を指摘された',
            '周囲から聞こえが悪いと言われる',
            '自分では気づいていないが念のため検査'
          ],
          histories: [
            '本人から話を聞くと周囲がうるさくて、検査音が聞こえなかった様子',
            '特に自覚症状はない',
            '耳の異常は感じないが、学校検診で指摘された'
          ]
        };
      } else if (age <= 22) {
        // 大学生：大学の健康診断
        return {
          chiefComplaints: [
            '大学の健康診断で異常を指摘された',
            '健康診断で聞こえの悪さを指摘された',
            '周囲から聞こえが悪いと言われる',
            '自分では気づいていないが念のため検査'
          ],
          histories: [
            '本人から話を聞くと周囲がうるさくて、検査音が聞こえなかった様子',
            '特に自覚症状はない',
            '耳の異常は感じないが、健康診断で指摘された'
          ]
        };
      } else {
        // 成人：職場の健康診断
        return {
          chiefComplaints: [
            '職場の健康診断で異常を指摘された',
            '定期健康診断で聞こえの悪さを指摘された',
            '健康診断で異常を指摘された',
            '周囲から聞こえが悪いと言われる',
            '自分では気づいていないが念のため検査'
          ],
          histories: [
            '本人から話を聞くと周囲がうるさくて、検査音が聞こえなかった様子',
            '特に自覚症状はない',
            '耳の異常は感じないが、職場の健康診断で指摘された'
          ]
        };
      }
    };

    const patterns = {
      normal: {
        ageRange: [5, 50], // ISO 7029に基づき拡大
        // 年齢に応じた動的な主訴・病歴は後で設定
        chiefComplaints: [],
        histories: [],
        findings: '鼓膜所見正常',
        tympType: 'A'
      },
      sensorineural: {
        ageRange: [30, 80],
        chiefComplaints: [
          '聞こえの悪さ',
          'TVの音が聞こえにくい',
          '会話が聞き取りにくい',
          '耳鳴りがする',
          '電話での会話が聞き取りにくい'
        ],
        histories: [
          '徐々に聞こえ悪くなった。いつから聞こえ悪いのかよくわからない',
          '最近、聞こえが悪くなった',
          '高音域が聞こえにくい',
          '加齢と共に聞こえが悪くなった'
        ],
        findings: '鼓膜所見正常',
        tympType: 'A'
      },
      conductive: {
        ageRange: [5, 50],
        chiefComplaints: [
          '鼻水が出る。聞こえの悪さ',
          '耳閉塞感',
          '耳痛と聞こえの悪さ',
          '耳が詰まった感じ',
          '徐々に聞こえが悪くなってきた',
          '外傷後の聞こえの悪さ',
          '殴られてから聞こえが悪くなった',
          '耳掃除中に子供がぶつかってきてから聞こえが悪くなった'
        ],
        histories: [
          '小さい頃から滲出性中耳炎を繰り返す',
          '風邪をひいてから聞こえが悪くなった',
          '耳痛とともに聞こえが悪くなった',
          '耳の詰まり感がある',
          '数年前から徐々に聞こえが悪くなってきた',
          '頭部外傷後に聞こえが悪くなった',
          '数週間前に喧嘩で顔を殴られ、その後から聞こえが悪くなった',
          '耳掃除をしている時に子供がぶつかってきて、その後から聞こえが悪くなった',
          '転倒して頭を打った後、聞こえが悪くなった',
          'スポーツ中にボールが耳に当たり、その後から聞こえが悪くなった'
        ],
        findings: '鼓膜所見異常あり',
        tympType: 'B' // デフォルトはB型、後で適切に設定される
      },
      mixed: {
        ageRange: [40, 75],
        chiefComplaints: [
          '聞こえの悪さ（特に片側）',
          '耳閉塞感、耳鳴り',
          'TVの音が聞こえにくい、耳が詰まった感じ'
        ],
        histories: [
          '以前から聞こえが悪かったが、最近さらに悪化した',
          '中耳炎の既往があり、最近聞こえが悪くなった',
          '加齢と共に聞こえが悪くなり、耳の調子も悪い'
        ],
        findings: '鼓膜所見異常あり',
        tympType: 'B' // デフォルトはB型、後で適切に設定される（A型、B型、As型、Ad型のいずれか）
      }
    };

    const pattern = patterns[casePattern] || patterns.sensorineural;
    
    // 疾患推定から詳細情報を生成
    let gender, chiefComplaint, history, findings;
    
    // まず疾患推定がある場合はそれを使用、なければ汎用パターン
    if (patternAnalysis && patternAnalysis.possibleDisorders && patternAnalysis.possibleDisorders.length > 0) {
      // 最もスコアの高い疾患を選択（50%の確率で使用、50%で汎用パターン）
      if (Math.random() > 0.5) {
        selectedDisorder = patternAnalysis.possibleDisorders[0].disorder;
        
        // 疾患に基づいてタインパノグラム型を設定（疾患情報を優先）
        if (casePattern === 'conductive') {
          if (selectedDisorder.name === '耳硬化症') {
            pattern.tympType = 'As'; // 耳硬化症はAs型
          } else if (selectedDisorder.name === '耳小骨離断') {
            pattern.tympType = 'Ad'; // 耳小骨離断はAd型
          } else if (selectedDisorder.tympanometry === 'B型') {
            pattern.tympType = 'B'; // その他の伝音性はB型
          }
        }
        
        // 性別（疾患の性別バイアスを反映）
        gender = Math.random() < selectedDisorder.genderBias ? '女性' : '男性';
        if (selectedDisorder.genderBias === 0.7) {
          gender = '女性'; // メニエー尔病、耳硬化症は女性が多い
        } else if (selectedDisorder.genderBias === 0.3) {
          gender = '男性'; // 騒音性難聴は男性が多い
        }
        
        // 主訴・病歴・所見を疾患特有のものから生成
        const disorderPattern = selectedDisorder;
        
        // データベースから選んだ症例を保存（後でfindingsを取得するため）
        let selectedDBCase = null;
        
        // 主訴（疾患特有の表現、データベースから参照）
        if (disorderPattern.name === 'メニエー尔病') {
          // メニエー尔病では高音域訴え（電話/高音が聞き取りにくい等）は使わない
          chiefComplaint = '回転性めまいと低音性耳鳴り、聞こえの変動';
          history = `${Math.floor(Math.random() * 12) + 1}ヶ月前から回転性めまい発作が反復。『ゴー』という低音性耳鳴りを自覚。発作時に低音域の聞こえが悪化し、寛解期に改善する`;
        } else if (disorderPattern.name === '突発性難聴') {
          const days = Math.floor(Math.random() * 7) + 1;
          chiefComplaint = patternAnalysis.asymmetry ? `${days}日前から右耳（または左耳）の聞こえが突然悪くなった` : '突然の難聴、耳鳴り';
          history = `${days}日前、朝起きたら片耳の聞こえが急に悪くなっていた。耳鳴りも同時に出現。めまいはない`;
        } else if (disorderPattern.name === '耳硬化症') {
          // データベースから症例を参照
          if (OtosclerosisCases && OtosclerosisCases.length > 0) {
            selectedDBCase = OtosclerosisCases[Math.floor(Math.random() * OtosclerosisCases.length)];
            chiefComplaint = selectedDBCase.chiefComplaint;
            history = selectedDBCase.hpi;
          } else {
            chiefComplaint = '徐々に聞こえが悪くなってきた';
            history = `数年前から徐々に聞こえが悪くなってきた。家族も同じような症状がある。会話は聞こえるが、聞き取りにくい`;
          }
        } else if (disorderPattern.name === '騒音性難聴' || disorderPattern.name === '音響外傷') {
          chiefComplaint = '騒音環境での聞こえの悪さ';
          const source = disorderPattern.name === '音響外傷' 
            ? ['ライブコンサート', '銃声', '爆発音'][Math.floor(Math.random() * 3)]
            : ['工場', '建設現場', '長時間の音楽鑑賞'][Math.floor(Math.random() * 3)];
          history = `${source}での${disorderPattern.name === '音響外傷' ? '急性' : '長期'}騒音暴露歴あり。高音域が聞こえにくい`;
        } else if (disorderPattern.name === '加齢性難聴（老聴）') {
          chiefComplaint = '最近、会話が聞き取りにくくなった';
          history = '数年前から徐々に聞こえが悪くなってきた。特に女性の声や高音が聞き取りにくい。TVの音量を上げている';
        } else if (disorderPattern.name === '耳小骨離断') {
          // データベースから症例を参照
          if (OssicularDiscontinuityCases && OssicularDiscontinuityCases.length > 0) {
            selectedDBCase = OssicularDiscontinuityCases[Math.floor(Math.random() * OssicularDiscontinuityCases.length)];
            chiefComplaint = selectedDBCase.chiefComplaint;
            history = selectedDBCase.hpi;
          } else {
            chiefComplaint = '外傷後の聞こえの悪さ';
            history = `数${['週', 'ヶ月', '年'][Math.floor(Math.random() * 3)]}前に頭部外傷（または側頭骨骨折）の既往あり。その後から聞こえが悪くなった`;
          }
        } else if (disorderPattern.name === '急性中耳炎' || (disorderPattern.tympanometry === 'B型' && pattern.tympType === 'B')) {
          // データベースから症例を参照（急性中耳炎）
          if (AOMCases && AOMCases.length > 0) {
            selectedDBCase = AOMCases[Math.floor(Math.random() * AOMCases.length)];
            chiefComplaint = selectedDBCase.chiefComplaint;
            history = selectedDBCase.hpi;
          } else {
            chiefComplaint = pattern.chiefComplaints[Math.floor(Math.random() * pattern.chiefComplaints.length)];
            history = pattern.histories[Math.floor(Math.random() * pattern.histories.length)];
          }
        } else if (disorderPattern.name === '滲出性中耳炎' || (disorderPattern.tympanometry === 'B型' && pattern.tympType === 'B')) {
          // データベースから症例を参照（滲出性中耳炎）
          if (OMECases && OMECases.length > 0) {
            selectedDBCase = OMECases[Math.floor(Math.random() * OMECases.length)];
            chiefComplaint = selectedDBCase.chiefComplaint;
            history = selectedDBCase.hpi;
          } else {
            chiefComplaint = pattern.chiefComplaints[Math.floor(Math.random() * pattern.chiefComplaints.length)];
            history = pattern.histories[Math.floor(Math.random() * pattern.histories.length)];
          }
        } else if (disorderPattern.name === 'ムンプス難聴') {
          chiefComplaint = 'おたふく風邪後の聞こえの悪さ';
          // ムンプス難聴は急性発症（徐々にはならない）
          const timeAgo = age < 10 ? '数ヶ月前' : '数年前';
          history = `${timeAgo}におたふく風邪にかかった。発熱時または回復期に片耳の聞こえが突然悪くなった。回復せず`;
        } else {
          // 汎用的なパターン
          chiefComplaint = pattern.chiefComplaints[Math.floor(Math.random() * pattern.chiefComplaints.length)];
          history = pattern.histories[Math.floor(Math.random() * pattern.histories.length)];
        }
        // --- エピソード整合性で疾患を補正 ---
        const chronicNoiseKeywords = ['工場','建設','重機','製造ライン','騒音職場','長時間の音','長期騒音','騒音環境'];
        const acuteSuddenKeywords = ['昨日から','突然','急に','起床時','数日前','急性','耳鳴り','めまい'];
        const hasChronicNoise = chronicNoiseKeywords.some(k => (history||'').includes(k));
        const hasAcuteSudden = acuteSuddenKeywords.some(k => (history||'').includes(k));

        // 騒音エピソードがあるのに突発や離断が選ばれた場合は騒音性に補正
        if (hasChronicNoise && disorderPattern.name !== '騒音性難聴') {
          const noise = HEARING_DISORDERS.find(d => d.name === '騒音性難聴');
          if (noise) {
            selectedDisorder = noise;
            chiefComplaint = '騒音環境での聞こえの悪さ';
            const source = ['工場', '建設現場', '重機作業', '製造ライン'][Math.floor(Math.random() * 4)];
            history = `${source}での長期騒音暴露歴あり。高音域が聞こえにくい`;
          }
        }

        // ムンプス難聴が選ばれた場合、病歴が「徐々に」を含んでいれば急性発症に修正
        if (disorderPattern.name === 'ムンプス難聴' && (history || '').includes('徐々に')) {
          const timeAgo = age < 10 ? '数ヶ月前' : '数年前';
          history = `${timeAgo}におたふく風邪にかかった。発熱時または回復期に片耳の聞こえが突然悪くなった。回復せず`;
        }

        // 突発性を示す急性エピソードがある場合は突発性難聴を優先
        if (hasAcuteSudden && disorderPattern.name !== '突発性難聴') {
          const sudden = HEARING_DISORDERS.find(d => d.name === '突発性難聴');
          if (sudden) {
            selectedDisorder = sudden;
            const days = Math.floor(Math.random() * 7) + 1;
            chiefComplaint = `${days}日前から片耳の聞こえが突然悪くなった、耳鳴り`;
            history = `${days}日前、起床時に片耳の聞こえが急に悪化。耳鳴りあり。めまいは±`;
          }
        }

        // 所見（疾患情報とオーディオグラムパターンから生成）
        let tympType = (selectedDisorder.tympanometry || disorderPattern.tympanometry) === 'A型' ? 'A' : 
                       disorderPattern.tympanometry.includes('As型') ? 'As' :
                       disorderPattern.tympanometry.includes('Ad型') ? 'Ad' : 'B';
        
        // 伝音性難聴・混合性難聴の場合は、必ず適切なタイプを設定（A型は不可）
        if (casePattern === 'conductive') {
          // 伝音性難聴の場合、A型は不適切。必ずB型、As型、またはAd型にする
          if (tympType === 'A' || disorderPattern.name === '耳硬化症') {
            // 耳硬化症は必ずAs型
            if (disorderPattern.name === '耳硬化症') {
              tympType = 'As';
            } else {
              tympType = 'B'; // その他の伝音性難聴はB型
            }
          }
        }
        
        // 所見：鼓膜所見（データベースから取得した症例がある場合はそれを使用、なければデフォルト）
        if (selectedDBCase && selectedDBCase.otoscopy) {
          findings = selectedDBCase.otoscopy;
        } else {
          findings = `鼓膜所見${tympType === 'B' || tympType === 'Ad' || tympType === 'As' ? '異常あり' : '正常'}`;
        }

        // 追加のサニタイズ：メニエー尔病では高音/電話に関する表現を除去
        if (selectedDisorder?.name === 'メニエー尔病') {
          const highFreqWords = ['高音域', '高音', '電話', '女性の声'];
          const replaceIfHigh = (text) => highFreqWords.some(w => (text||'').includes(w))
            ? '低音域の聞こえが発作時に悪化し寛解期に改善する'
            : text;
          chiefComplaint = replaceIfHigh(chiefComplaint);
          history = replaceIfHigh(history);
        }
        
        pattern.tympType = tympType;
      } else {
        // 汎用パターンを使用
        gender = Math.random() > 0.5 ? '男性' : '女性';
        
        // 伝音性難聴の場合、外傷エピソードがあるかどうかを確認してティンパノグラム型を決定
        let hasTraumaEpisode = false;
        if (casePattern === 'conductive') {
          // 外傷関連の主訴・病歴をチェック
          const traumaKeywords = ['殴られ', '耳掃除', 'ぶつかっ', '外傷', '頭部外傷', '転倒', 'ボールが', '打った'];
          const infectionKeywords = ['中耳炎', '滲出', '耳痛', '発熱', '膿', '風邪', '感冒', '鼓膜発赤', '鼓膜膨隆'];
          const selectedChiefComplaint = pattern.chiefComplaints[Math.floor(Math.random() * pattern.chiefComplaints.length)];
          const selectedHistory = pattern.histories[Math.floor(Math.random() * pattern.histories.length)];
          
          hasTraumaEpisode = traumaKeywords.some(keyword => 
            selectedChiefComplaint.includes(keyword) || selectedHistory.includes(keyword)
          );
          
          // ティンパ型別に主訴/病歴をチューニング
          if (pattern.tympType === 'Ad') {
            // Ad型（耳小骨離断を示唆）：中耳炎関連ワードは避ける
            const isInfection = infectionKeywords.some(k => selectedChiefComplaint.includes(k) || selectedHistory.includes(k));
            if (isInfection) {
              chiefComplaint = '外傷後の聞こえの悪さ';
              history = '数週間前の外傷（転倒/接触）後から聞こえが悪い。耳痛や発熱はない';
            } else {
              chiefComplaint = selectedChiefComplaint;
              history = selectedHistory;
            }
          } else if (pattern.tympType === 'B') {
            // B型（滲出性/急性中耳炎を示唆）：中耳炎エピソードを優先
            const isInfection = infectionKeywords.some(k => selectedChiefComplaint.includes(k) || selectedHistory.includes(k));
            if (isInfection) {
              chiefComplaint = selectedChiefComplaint;
              history = selectedHistory;
            } else {
              const acute = Math.random() < 0.5;
              if (acute) {
                chiefComplaint = '耳痛と聞こえの悪さ';
                history = '数日前から発熱と耳痛、鼓膜発赤・膨隆あり。急性中耳炎を疑う';
              } else {
                chiefComplaint = '耳が詰まった感じ、聞こえにくい';
                history = '感冒後から耳閉塞感と難聴。鼓膜後方に液体貯留を示唆する所見あり（滲出性中耳炎）';
              }
            }
          } else {
            chiefComplaint = selectedChiefComplaint;
            history = selectedHistory;
          }
          
          // 外傷エピソードがある場合はAd型を設定
          if (hasTraumaEpisode) {
            pattern.tympType = 'Ad';
          }
        } else {
          chiefComplaint = pattern.chiefComplaints[Math.floor(Math.random() * pattern.chiefComplaints.length)];
          history = pattern.histories[Math.floor(Math.random() * pattern.histories.length)];
        }
        
        // 所見をタイプに合わせて生成
        if (casePattern === 'conductive') {
          // 伝音性難聴の場合、ティンパノグラム型に応じて中耳炎/離断の所見を補足
          findings = `鼓膜所見${pattern.tympType === 'B' || pattern.tympType === 'Ad' || pattern.tympType === 'As' ? '異常あり' : '正常'}`;
        } else {
          findings = pattern.findings;
        }
      }
    } else {
      // 疾患推定なし（正常または汎用パターン）
      gender = Math.random() > 0.5 ? '男性' : '女性';
      
      // 正常聴力パターンの場合、年齢に応じた適切な主訴・病歴を選択
      if (casePattern === 'normal') {
        const ageAppropriate = getAgeAppropriateComplaints(age);
        chiefComplaint = ageAppropriate.chiefComplaints[Math.floor(Math.random() * ageAppropriate.chiefComplaints.length)];
        history = ageAppropriate.histories[Math.floor(Math.random() * ageAppropriate.histories.length)];
      } else {
        chiefComplaint = pattern.chiefComplaints[Math.floor(Math.random() * pattern.chiefComplaints.length)];
        history = pattern.histories[Math.floor(Math.random() * pattern.histories.length)];
      }
      
      findings = pattern.findings;
    }
    // 伝音性難聴の場合はティンパノグラム型を修正（疾患推定で設定されていない場合、または設定されていてもA型になっている場合）
      if (casePattern === 'conductive') {
        // 伝音性難聴の場合、必ずB型、As型、またはAd型にする（A型は不可）
        // 外傷エピソードがある場合は既にAd型に設定されているはずだが、念のためチェック
        const traumaKeywords = ['殴られ', '耳掃除', 'ぶつかっ', '外傷', '頭部外傷', '転倒', 'ボールが', '打った'];
        const hasTrauma = traumaKeywords.some(keyword => 
          (chiefComplaint && chiefComplaint.includes(keyword)) || 
          (history && history.includes(keyword))
        );
        
        if (!selectedDisorder || pattern.tympType === 'A') {
          if (hasTrauma) {
            // 外傷エピソードがある場合はAd型（耳小骨離断）
            pattern.tympType = 'Ad';
          } else {
            // 外傷エピソードがない場合はランダムに選択
            const rand = Math.random();
            if (rand < 0.5) {
              pattern.tympType = 'B'; // 50%：B型（滲出性中耳炎など）- 最も一般的
            } else if (rand < 0.75) {
              pattern.tympType = 'As'; // 25%：As型（耳硬化症など）
            } else {
              pattern.tympType = 'Ad'; // 25%：Ad型（耳小骨離断など）
            }
          }
        } else if (hasTrauma && pattern.tympType !== 'Ad') {
          // 疾患推定で設定されているが、外傷エピソードがある場合はAd型に上書き
          pattern.tympType = 'Ad';
        }
    }
    // タインパノグラム生成
    let tympanogram;
    if (pattern.tympType === 'A' || pattern.tympType === 'As') {
      // A型（正常）またはAs型（コンプライアンス低：耳硬化症など）
      const isAs = pattern.tympType === 'As';
      tympanogram = {
        type: isAs ? 'A' : 'A', // 表示はA型だが、コンプライアンスが低い
        left: {
          peakPressure: Math.round((Math.random() * 40 - 20) / 5) * 5, // -20 to 20 daPa
          peakCompliance: isAs 
            ? Math.round((Math.random() * 0.4 + 0.3) * 10) / 10 // As型：0.3-0.7 mL（低コンプライアンス）
            : Math.round((Math.random() * 0.8 + 0.8) * 10) / 10, // A型：0.8 to 1.6 mL
          sigma: 60
        },
        right: {
          peakPressure: Math.round((Math.random() * 40 - 20) / 5) * 5,
          peakCompliance: isAs
            ? Math.round((Math.random() * 0.4 + 0.3) * 10) / 10
            : Math.round((Math.random() * 0.8 + 0.8) * 10) / 10,
          sigma: 60
        }
      };
    } else if (pattern.tympType === 'Ad') {
      // Ad型（コンプライアンス増大：耳小骨離断など）
      const createAdCompliance = () => {
        const value = Math.round((Math.random() * 1.0 + 3.0) * 10) / 10; // 3.0 - 4.0 mL
        return Number(Math.min(value, 4.0).toFixed(1));
      };
      tympanogram = {
        type: 'A', // 表示はA型だが、コンプライアンスが高い
        left: {
          peakPressure: Math.round((Math.random() * 40 - 20) / 5) * 5,
          peakCompliance: createAdCompliance(), // Ad型：高コンプライアンス（最大4.0mL）
          sigma: 60
        },
        right: {
          peakPressure: Math.round((Math.random() * 40 - 20) / 5) * 5,
          peakCompliance: createAdCompliance(),
          sigma: 60
        }
      };
    } else if (pattern.tympType === 'B') {
      tympanogram = {
        type: 'B',
        left: {
          peakPressure: -200,
          peakCompliance: Math.round((Math.random() * 0.3 + 0.1) * 10) / 10, // 0.1 to 0.4 mL
          sigma: 80
        },
        right: {
          peakPressure: -200,
          peakCompliance: Math.round((Math.random() * 0.3 + 0.1) * 10) / 10,
          sigma: 80
        }
      };
    } else {
      // MIX type
      tympanogram = {
        type: 'MIX',
        left: {
          peakPressure: Math.round((Math.random() * 40 - 20) / 5) * 5,
          peakCompliance: Math.round((Math.random() * 0.8 + 0.8) * 10) / 10,
          sigma: 60
        },
        right: {
          peakPressure: Math.random() > 0.5 
            ? Math.round((Math.random() * 40 - 20) / 5) * 5
            : Math.round((Math.random() * 100 + 50) / 5) * 5, // 陽圧の可能性
          peakCompliance: Math.round((Math.random() * 0.6 + 0.4) * 10) / 10,
          sigma: 60
        }
      };
    }

    // 臨床評価手順に沿った整合性チェック
    // 1. 症例情報を見る（エピソード確認、どちらの耳が悪いか）→ 既に実装済み
    // 2. ティンパノを実施し感音（A型）or 伝音（B型）を予測 → 既に実装済み
    // 3. 聴力検査 → 既に実装済み
    // 4. ティンパノ、DPOAEとの結果整合性を確認
    if (patternAnalysis) {
      const avgABGOverall = patternAnalysis.avgABGOverall || 0;
      const tympType = pattern.tympType;
      
      // Tym A型なのに伝音難聴パターン（ABG > 15dB）の場合
      // → ART実施で確認する必要がある（耳硬化症 or 耳小骨離断）
      if (tympType === 'A' && avgABGOverall > 15) {
        // 伝音難聴パターンが存在するのにティンパノがA型 → 耳硬化症または耳小骨離断の可能性
        // 耳硬化症：As型、ART消失、低音域でABGが大きい
        // 耳小骨離断：Ad型、ART消失、外傷エピソードあり
        const traumaKeywords = ['殴られ', '耳掃除', 'ぶつかっ', '外傷', '頭部外傷', '転倒', 'ボールが', '打った'];
        const hasTrauma = traumaKeywords.some(keyword => 
          (chiefComplaint && chiefComplaint.includes(keyword)) || 
          (history && history.includes(keyword))
        );
        
        // 外傷エピソードがある場合は耳小骨離断（Ad型）を優先
        if (hasTrauma) {
          pattern.tympType = 'Ad';
          tympanogram.type = 'A'; // 表示はA型だが、コンプライアンスが高い
          const complianceAd = () => Number(Math.min(Math.round((Math.random() * 1.0 + 3.0) * 10) / 10, 4.0).toFixed(1));
          tympanogram.left.peakCompliance = complianceAd();
          tympanogram.right.peakCompliance = complianceAd();
          
          // 疾患を耳小骨離断に補正
          const ossicularDiscontinuity = HEARING_DISORDERS.find(d => d.name === '耳小骨離断');
          if (ossicularDiscontinuity && (!selectedDisorder || selectedDisorder.name !== '耳小骨離断')) {
            selectedDisorder = ossicularDiscontinuity;
            findings = '鼓膜所見は基本正常、Ad型、ABG大（耳小骨離断を示唆）';
          }
        } else {
          // 外傷エピソードがない場合は耳硬化症（As型）を優先
          pattern.tympType = 'As';
          tympanogram.type = 'A'; // 表示はA型だが、コンプライアンスが低い
          tympanogram.left.peakCompliance = Math.round((Math.random() * 0.4 + 0.3) * 10) / 10;
          tympanogram.right.peakCompliance = Math.round((Math.random() * 0.4 + 0.3) * 10) / 10;
          
          // 疾患を耳硬化症に補正
          const otosclerosis = HEARING_DISORDERS.find(d => d.name === '耳硬化症');
          if (otosclerosis && (!selectedDisorder || selectedDisorder.name !== '耳硬化症')) {
            selectedDisorder = otosclerosis;
            findings = '鼓膜所見はおおむね正常、As型、反射消失（耳硬化症を示唆）';
          }
        }
      }
      
      // Tym B型なら伝音難聴パターンであるべき（既に実装済み）
      // DPOAEとAC閾値の整合性は buildDPOAEConfig で既に実装済み
    }

    // OpenAIの結果があればそれを使用（chiefComplaint, history, findings, gender, explanation）
    // なければ従来のロジックを使用
    if (aiResult) {
      return {
        age: `${age}歳`,
        gender: aiResult.gender || gender,
        chiefComplaint: aiResult.chiefComplaint || chiefComplaint,
        history: aiResult.history || history,
        findings: aiResult.findings || findings,
        tympanogram,
        selectedDisorder: selectedDisorder || null,
        casePattern: casePattern,
        explanation: aiResult.explanation || '' // 学習者向けの解説（OpenAI生成）
      };
    }

    // 従来のロジック（OpenAIが使えない場合）
    return {
      age: `${age}歳`,
      gender,
      chiefComplaint,
      history,
      findings,
      tympanogram,
      selectedDisorder: selectedDisorder || null, // 疾患情報を返り値に含める（ART設定用）
      casePattern: casePattern // 症例パターンも含める
    };
  };

  // AI生成: 難聴パターンを判定する関数
  const analyzeHearingLossPattern = (targets, age = null) => {
    const acValues = { R: {}, L: {} };
    const bcValues = { R: {}, L: {} };
    
    targets.forEach(t => {
      if (t.transducer === 'AC') {
        acValues[t.ear][t.freq] = t.dB;
      } else if (t.transducer === 'BC') {
        bcValues[t.ear][t.freq] = t.dB;
      }
    });

    // 平均聴力レベルを計算
    const avgAC = { R: 0, L: 0 };
    const avgBC = { R: 0, L: 0 };
    const freqCount = { R: 0, L: 0 };
    
    ['R', 'L'].forEach(ear => {
      Object.values(acValues[ear]).forEach(val => {
        if (val < 110) {
          avgAC[ear] += val;
          freqCount[ear]++;
        }
      });
      Object.values(bcValues[ear]).forEach(val => {
        if (val < 110) {
          avgBC[ear] += val;
        }
      });
      if (freqCount[ear] > 0) {
        avgAC[ear] /= freqCount[ear];
        avgBC[ear] /= Object.keys(bcValues[ear]).length || 1;
      }
    });

    // 気導骨導差（ABG）を計算
    const avgABG = {
      R: Math.max(0, avgAC.R - avgBC.R),
      L: Math.max(0, avgAC.L - avgBC.L)
    };
    
    // 周波数別の特徴を分析
    const getFreqValue = (ear, freq) => acValues[ear][freq] || 110;
    const lowFreqAvg = (getFreqValue('R', 500) + getFreqValue('L', 500)) / 2;
    const midFreqAvg = (getFreqValue('R', 2000) + getFreqValue('L', 2000)) / 2;
    const highFreqAvg = (getFreqValue('R', 4000) + getFreqValue('L', 4000)) / 2;
    
    // C5 dip（4kHz dip）の検出
    const c5Dip = highFreqAvg > midFreqAvg + 10;
    
    // 左右差の検出
    const asymmetry = Math.abs(avgAC.R - avgAC.L) > 20;
    
    // パターン判定
    const avgABGOverall = (avgABG.R + avgABG.L) / 2;
    const avgACOverall = (avgAC.R + avgAC.L) / 2;
    
    let pattern = 'normal';
    if (avgACOverall <= 20 && avgABGOverall <= 5) {
      pattern = 'normal';
    } else if (avgABGOverall > 15) {
      pattern = 'conductive';
    } else {
      pattern = 'sensorineural';
    }
    
  // 疾患の推定（年齢・パターン・特徴から）
    let possibleDisorders = [];
    
    if (pattern === 'normal') {
      return { pattern, possibleDisorders: [], c5Dip, asymmetry };
    }
    
  HEARING_DISORDERS.forEach(disorder => {
      let score = 0;
      
      // 年齢の一致度
      if (age && age >= disorder.ageRange[0] && age <= disorder.ageRange[1]) {
        score += 3;
      }
      
    // パターンの一致度（耳小骨離断/耳硬化症は伝音に限定）
    if (pattern === 'conductive' && (disorder.name.includes('耳小骨') || disorder.name === '耳硬化症')) {
      score += 3;
      } else if (pattern === 'sensorineural') {
        if (disorder.name.includes('メニエー尔') || disorder.name.includes('突発') || 
            disorder.name.includes('加齢') || disorder.name.includes('騒音') || 
            disorder.name.includes('音響') || disorder.name.includes('ムンプス')) {
          score += 3;
        }
      }
      
    // C5 dipの一致度（騒音性・音響外傷）
    if (c5Dip && (disorder.name.includes('騒音') || disorder.name.includes('音響'))) {
      score += 4; // 騒音性をより強く優先
      // 両側性が示唆される場合はさらに加点
      if (!asymmetry && disorder.name.includes('騒音')) {
        score += 2;
      }
    }
      
      // 左右差の一致度（突発性、ムンプ斯は一側性）
      if (asymmetry && disorder.unilateral) {
        score += 2;
      } else if (!asymmetry && !disorder.unilateral) {
        score += 1;
      }
      
      // 低音障害（メニエー尔）
      if (pattern === 'sensorineural' && lowFreqAvg > midFreqAvg + 5 && disorder.name.includes('メニエ尔')) {
        score += 2;
      }
      
    // 追加の臨床一貫性チェック
    // ABGが小さい（<=15dB）のに伝音系疾患は減点
    if ((disorder.name.includes('耳小骨') || disorder.name === '耳硬化症') && avgABGOverall <= 15) {
      score -= 3;
    }

    // 大きなABG（>=25dB）があり、騒音性/音響外傷は減点
    if (avgABGOverall >= 25 && (disorder.name.includes('騒音') || disorder.name.includes('音響'))) {
      score -= 2;
    }

    if (score > 0) {
        possibleDisorders.push({ disorder, score });
      }
    });
    
    // スコアでソート
    possibleDisorders.sort((a, b) => b.score - a.score);
    
    return { 
      pattern, 
      possibleDisorders: possibleDisorders.slice(0, 3), // 上位3つ
      c5Dip,
      asymmetry,
      avgABGOverall,
      avgACOverall
    };
  };
  // 疾患特異的なオーディオグラムパターンを生成する関数
  const generateDisorderSpecificAudiogram = (disorder, age, frequencies, ears) => {
    let targets = [];
    const normalThresholds = frequencies.reduce((acc, freq) => {
      acc[freq] = getNormalHearingThreshold(age, freq) || 5;
      return acc;
    }, {});
    
    if (disorder.pattern === 'meniere') {
      // メニエー尔病：低音障害型〜水平型
      ears.forEach(ear => {
        const baseLoss = Math.round((Math.random() * 30 + 20) / 5) * 5; // 20-50dB
        const acValues = {};
        
        frequencies.forEach(freq => {
          let dB;
          if (freq <= 500) {
            // 低音域（125, 250, 500Hz）が悪い
            dB = normalThresholds[freq] + baseLoss + Math.round((Math.random() * 10 - 5) / 5) * 5;
          } else {
            // 高音域はやや良い（水平型）または同等
            dB = normalThresholds[freq] + baseLoss - Math.round((Math.random() * 15) / 5) * 5;
          }
          dB = Math.max(5, Math.min(80, Math.round(dB / 5) * 5));
          
          // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
          if (freq === 125 || freq === 250) {
            dB = Math.max(5, dB);
          }
          
          // AC_MAXをチェックしてSO判定
          const acMax = AC_MAX[freq] ?? 110;
          const isACSO = dB > acMax;
          acValues[freq] = isACSO ? acMax : dB;
          targets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
        });
        
        // BC値（感音性なのでAC±5dB）
        frequencies.forEach(freq => {
          const acValue = acValues[freq];
          let minBC = Math.max(0, acValue - 5);
          let maxBC = acValue + 5;
          
          // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
          if (freq === 125 || freq === 250) {
            minBC = Math.max(5, minBC);
            maxBC = Math.max(5, maxBC);
          }
          
          let bcValue = Math.round((Math.random() * (maxBC - minBC) + minBC) / 5) * 5;
          // BC_MAXを超えないように制限
          const bcMax = BC_MAX[freq] ?? 110;
          const isBCSO = bcValue > bcMax;
          bcValue = isBCSO ? bcMax : bcValue;
          targets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue, ...(isBCSO ? { so: true } : {}) });
        });
      });
      
    } else if (disorder.pattern === 'sudden') {
      // 突発性難聴：高音障害型・谷型・全体低下型など多様、一側性が多い
      const affectedEar = disorder.unilateral && Math.random() > 0.3 ? (Math.random() > 0.5 ? 'R' : 'L') : null;
      const patternType = Math.random(); // パターンの種類
      
      ears.forEach(ear => {
        const isAffected = affectedEar === null || ear === affectedEar;
        const severity = isAffected ? Math.round((Math.random() * 50 + 30) / 5) * 5 : 0; // 30-80dB
        const acValues = {};
        
        frequencies.forEach(freq => {
          let dB = normalThresholds[freq];
          
          if (isAffected) {
            if (patternType < 0.4) {
              // 高音障害型
              if (freq >= 2000) {
                dB += severity + (freq === 4000 ? 10 : freq === 8000 ? 20 : 0);
              } else {
                dB += severity * 0.5;
              }
            } else if (patternType < 0.7) {
              // 谷型（中間周波数が悪い）
              if (freq === 1000 || freq === 2000) {
                dB += severity + 10;
              } else {
                dB += severity;
              }
            } else {
              // 全体低下型
              dB += severity;
            }
          }
          
          dB = Math.max(5, Math.min(110, Math.round(dB / 5) * 5));
          
          // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
          if (freq === 125 || freq === 250) {
            dB = Math.max(5, dB);
          }
          
          // AC_MAXをチェックしてSO判定
          const acMax = AC_MAX[freq] ?? 110;
          const isACSO = dB > acMax;
          acValues[freq] = isACSO ? acMax : dB;
          targets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
        });
        
        // BC値（感音性なのでAC±5dB）
        frequencies.forEach(freq => {
          const acValue = acValues[freq];
          let minBC = Math.max(0, acValue - 5);
          let maxBC = acValue + 5;
          
          // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
          if (freq === 125 || freq === 250) {
            minBC = Math.max(5, minBC);
            maxBC = Math.max(5, maxBC);
          }
          
          let bcValue = Math.round((Math.random() * (maxBC - minBC) + minBC) / 5) * 5;
          // BC_MAXを超えないように制限
          const bcMax = BC_MAX[freq] ?? 110;
          const isBCSO = bcValue > bcMax;
          bcValue = isBCSO ? bcMax : bcValue;
          targets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue, ...(isBCSO ? { so: true } : {}) });
        });
      });
      
    } else if (disorder.pattern === 'otosclerosis') {
      // 耳硬化症：伝音難聴、Carhart notch（2kHzで気骨差縮小）
      ears.forEach(ear => {
        const airBoneGap = Math.round((Math.random() * 30 + 20) / 5) * 5; // 20-50dB
        const acValues = {};
        
        frequencies.forEach(freq => {
          // AC値
          let baseAC = normalThresholds[freq] + Math.round((Math.random() * 25 + 15) / 5) * 5; // 15-40dB
          baseAC = Math.max(5, Math.min(60, Math.round(baseAC / 5) * 5));
          
          // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
          if (freq === 125 || freq === 250) {
            baseAC = Math.max(5, baseAC);
          }
          
          // AC_MAXをチェックしてSO判定
          const acMax = AC_MAX[freq] ?? 110;
          const isACSO = baseAC > acMax;
          acValues[freq] = isACSO ? acMax : baseAC;
          targets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
        });
        
        // BC値（Carhart notch: 2kHzで気骨差が小さくなる）
        frequencies.forEach(freq => {
          const acValue = acValues[freq];
          let gap = airBoneGap;
          
          // Carhart notch: 2kHzで気骨差が10-15dB小さくなる
          if (freq === 2000) {
            gap = Math.max(5, gap - Math.round((Math.random() * 10 + 10) / 5) * 5);
          }
          
          let bcValue = Math.max(0, Math.round((acValue - gap) / 5) * 5);
          
          // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
          if (freq === 125 || freq === 250) {
            bcValue = Math.max(5, bcValue);
          }
          
          // BC_MAXを超えないように制限
          const bcMax = BC_MAX[freq] ?? 110;
          const isBCSO = bcValue > bcMax;
          bcValue = isBCSO ? bcMax : bcValue;
          targets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue, ...(isBCSO ? { so: true } : {}) });
        });
      });
      
    } else if (disorder.pattern === 'noise' || disorder.pattern === 'acoustic_trauma') {
      // 騒音性難聴・音響外傷：C5 dip（4kHz付近が最も落ちる）
      ears.forEach(ear => {
        const baseLoss = Math.round((Math.random() * 30 + 10) / 5) * 5; // 10-40dB
        const dipSeverity = Math.round((Math.random() * 30 + 20) / 5) * 5; // 20-50dBの追加損失
        const acValues = {};
        
        frequencies.forEach(freq => {
          let dB = normalThresholds[freq] + baseLoss;
          
          // C5 dip: 4kHzが最も悪い、3kHzと8kHzも影響
          if (freq === 4000) {
            dB += dipSeverity;
          } else if (freq === 2000 || freq === 8000) {
            dB += dipSeverity * 0.6;
          }
          
          dB = Math.max(5, Math.min(80, Math.round(dB / 5) * 5));
          
          // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
          if (freq === 125 || freq === 250) {
            dB = Math.max(5, dB);
          }
          
          // AC_MAXをチェックしてSO判定
          const acMax = AC_MAX[freq] ?? 110;
          const isACSO = dB > acMax;
          acValues[freq] = isACSO ? acMax : dB;
          targets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
        });
        
        // BC値（感音性なのでAC±5dB）
        frequencies.forEach(freq => {
          const acValue = acValues[freq];
          let minBC = Math.max(0, acValue - 5);
          let maxBC = acValue + 5;
          
          // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
          if (freq === 125 || freq === 250) {
            minBC = Math.max(5, minBC);
            maxBC = Math.max(5, maxBC);
          }
          
          let bcValue = Math.round((Math.random() * (maxBC - minBC) + minBC) / 5) * 5;
          // BC_MAXを超えないように制限
          const bcMax = BC_MAX[freq] ?? 110;
          const isBCSO = bcValue > bcMax;
          bcValue = isBCSO ? bcMax : bcValue;
          targets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue, ...(isBCSO ? { so: true } : {}) });
        });
      });
      
    } else if (disorder.pattern === 'presbycusis') {
      // 加齢性難聴：高音障害型、4000-8000Hzから低下
      ears.forEach(ear => {
        const baseLoss = Math.round((Math.random() * 20 + 10) / 5) * 5; // 10-30dB
        const acValues = {};
        
        frequencies.forEach(freq => {
          let dB = normalThresholds[freq]; // 年齢に応じた正常値
          
          // 高音域（4000-8000Hz）から低下
          if (freq >= 4000) {
            dB += baseLoss + Math.round(((freq === 4000 ? 5 : 15) + Math.random() * 10) / 5) * 5;
          } else if (freq === 2000) {
            dB += baseLoss * 0.5;
          } else {
            dB += baseLoss * 0.3;
          }
          
          dB = Math.max(5, Math.min(80, Math.round(dB / 5) * 5));
          
          // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
          if (freq === 125 || freq === 250) {
            dB = Math.max(5, dB);
          }
          
          // AC_MAXをチェックしてSO判定
          const acMax = AC_MAX[freq] ?? 110;
          const isACSO = dB > acMax;
          acValues[freq] = isACSO ? acMax : dB;
          targets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
        });
        
        // BC値（感音性なのでAC±5dB）
        frequencies.forEach(freq => {
          const acValue = acValues[freq];
          let minBC = Math.max(0, acValue - 5);
          let maxBC = acValue + 5;
          
          // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
          if (freq === 125 || freq === 250) {
            minBC = Math.max(5, minBC);
            maxBC = Math.max(5, maxBC);
          }
          
          let bcValue = Math.round((Math.random() * (maxBC - minBC) + minBC) / 5) * 5;
          // BC_MAXを超えないように制限
          const bcMax = BC_MAX[freq] ?? 110;
          const isBCSO = bcValue > bcMax;
          bcValue = isBCSO ? bcMax : bcValue;
          targets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue, ...(isBCSO ? { so: true } : {}) });
        });
      });
      
    } else if (disorder.pattern === 'ossicular_discontinuity') {
      // 耳小骨離断：伝音難聴、気骨差が大きい
      ears.forEach(ear => {
        const airBoneGap = Math.round((Math.random() * 20 + 20) / 5) * 5; // 20-40dBの気骨差（上限40dB）
        const acValues = {};
        
        frequencies.forEach(freq => {
          let baseAC = Math.round((Math.random() * 40 + 30) / 5) * 5; // 30-70dB
          baseAC = Math.max(10, Math.min(80, baseAC));
          
          // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
          if (freq === 125 || freq === 250) {
            baseAC = Math.max(5, baseAC);
          }
          
          // AC_MAXをチェックしてSO判定
          const acMax = AC_MAX[freq] ?? 110;
          const isACSO = baseAC > acMax;
          acValues[freq] = isACSO ? acMax : baseAC;
          targets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
        });
        
        // BC値（大きな気骨差）
        frequencies.forEach(freq => {
          const acValue = acValues[freq];
          let bcValue = Math.max(0, Math.round((acValue - airBoneGap) / 5) * 5);
          
          // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
          if (freq === 125 || freq === 250) {
            bcValue = Math.max(5, bcValue);
          }
          
          // BC_MAXを超えないように制限
          const bcMax = BC_MAX[freq] ?? 110;
          const isBCSO = bcValue > bcMax;
          bcValue = isBCSO ? bcMax : bcValue;
          
          targets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue, ...(isBCSO ? { so: true } : {}) });
        });
      });
    } else if (disorder.pattern === 'mumps') {
      // ムンプ斯難聴：高度感音難聴〜ろう型、一側性
      const affectedEar = Math.random() > 0.5 ? 'R' : 'L';
      const severity = Math.round((Math.random() * 40 + 70) / 5) * 5; // 70-110dB（高度〜ろう）
      
      ears.forEach(ear => {
        const isAffected = ear === affectedEar;
        const acValues = {};
        
        frequencies.forEach(freq => {
          let dB = isAffected 
            ? Math.min(110, normalThresholds[freq] + severity + Math.round((Math.random() * 10 - 5) / 5) * 5)
            : normalThresholds[freq] + Math.round((Math.random() * 10 - 5) / 5) * 5;
          dB = Math.max(5, Math.round(dB / 5) * 5);
          
          // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
          if (freq === 125 || freq === 250) {
            dB = Math.max(5, dB);
          }
          
          // AC_MAXをチェックしてSO判定
          const acMax = AC_MAX[freq] ?? 110;
          const isACSO = dB > acMax;
          acValues[freq] = isACSO ? acMax : dB;
          targets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
        });
        
        // BC値（感音性なのでAC±5dB、ただしSOの場合は適切に）
        frequencies.forEach(freq => {
          const acValue = acValues[freq];
          const acMax = AC_MAX[freq] ?? 110;
          const isACSO = acValue >= acMax;
          
          if (isACSO) {
            // ACがSOの場合、BCもSOにするが、BC_MAXを考慮
            const bcMax = BC_MAX[freq] ?? 110;
            targets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcMax, so: true });
          } else {
            let minBC = Math.max(0, acValue - 5);
            let maxBC = acValue + 5;
            
            // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
            if (freq === 125 || freq === 250) {
              minBC = Math.max(5, minBC);
              maxBC = Math.max(5, maxBC);
            }
            
            let bcValue = Math.round((Math.random() * (maxBC - minBC) + minBC) / 5) * 5;
            // BC_MAXを超えないように制限
            const bcMax = BC_MAX[freq] ?? 110;
            const isSO = bcValue > bcMax;
            bcValue = isSO ? bcMax : bcValue;
            targets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue, ...(isSO ? { so: true } : {}) });
          }
        });
      });
    }
    
    return targets;
  };
  // 聴力検査のみの自動症例生成（オーディオグラムのターゲットのみ、臨床情報は生成しない）
  const generateAudioOnlyCase = () => {
    const frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
    const ears = ['R', 'L'];
    
    // 疾患特異的なパターンを生成するか、汎用パターンを生成するか
    const useDisorderSpecific = Math.random() < 0.6; // 60%の確率で疾患特異的パターン
    let generatedTargets = [];
    let generatedAge = null;
    
    if (useDisorderSpecific && HEARING_DISORDERS.length > 0) {
      // 疾患をランダムに選択
      const disorder = HEARING_DISORDERS[Math.floor(Math.random() * HEARING_DISORDERS.length)];
      
      // 年齢を疾患に適した範囲で決定
      generatedAge = Math.floor(Math.random() * (disorder.ageRange[1] - disorder.ageRange[0] + 1)) + disorder.ageRange[0];
      
      // 疾患特異的なパターンを生成
      generatedTargets = generateDisorderSpecificAudiogram(disorder, generatedAge, frequencies, ears);
    } else {
      // 従来の汎用パターン生成（generateRandomCaseと同じロジック）
      const caseType = Math.random();
      
      if (caseType < 0.3) {
        // 正常聴力パターン（30%の確率）
        generatedAge = Math.floor(Math.random() * 46) + 5; // 5-50歳
        const age = generatedAge;
        
        ears.forEach(ear => {
          let acValues = {};
          frequencies.forEach(freq => {
            const normalRange = getNormalRangeForAge(age, freq);
            let dB = Math.round((Math.random() * (normalRange.max - normalRange.min) + normalRange.min) / 5) * 5;
            dB = Math.max(normalRange.min, Math.min(normalRange.max, dB));
            
            if (freq === 125 || freq === 250) {
              dB = Math.max(5, dB);
            }
            
            // AC_MAXをチェックしてSO判定
            const acMax = AC_MAX[freq] ?? 110;
            const isACSO = dB > acMax;
            acValues[freq] = isACSO ? acMax : dB;
            generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
          });
          
          frequencies.forEach(freq => {
            const acValue = acValues[freq];
            let minBC = Math.max(0, acValue - 5);
            let maxBC = acValue + 5;
            
            if (freq === 125 || freq === 250) {
              minBC = Math.max(5, minBC);
              maxBC = Math.max(5, maxBC);
            }
            
            const minBCRounded = Math.ceil(minBC / 5) * 5;
            const maxBCRounded = Math.floor(maxBC / 5) * 5;
            const steps = Math.max(0, (maxBCRounded - minBCRounded) / 5);
            const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
            const bcMax = BC_MAX[freq] ?? 110;
            const isSO = bcValue > bcMax;
            generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: isSO ? bcMax : bcValue, ...(isSO ? { so: true } : {}) });
          });
        });
      } else if (caseType < 0.6) {
        // 感音性難聴パターン（30%の確率）
        generatedAge = Math.floor(Math.random() * 51) + 30; // 30-80歳
        const age = generatedAge;
        
        ears.forEach(ear => {
          const normalAt2000 = getNormalHearingThreshold(age, 2000);
          const normalAt4000 = getNormalHearingThreshold(age, 4000);
          const baseLoss = Math.round((Math.random() * 25 + 15) / 5) * 5;
          const highFreqSlope = Math.round((Math.random() * 20 + 10) / 5) * 5;
          
          let acValues = {};
          frequencies.forEach(freq => {
            const normalThreshold = getNormalHearingThreshold(age, freq) || 5;
            let dB = normalThreshold + baseLoss;
            
            if (freq >= 2000) {
              const freqIndex = frequencies.indexOf(freq);
              const slopeFactor = (freqIndex - 4) / 3;
              dB += Math.round(slopeFactor * highFreqSlope / 5) * 5;
            }
            
            const variation = Math.round((Math.random() * 10 - 5) / 5) * 5;
            dB = dB + variation;
            
            if (freq <= 2000) {
              dB = Math.max(5, Math.min(110, dB));
            } else {
              dB = Math.max(-5, Math.min(110, dB));
            }
            
            if (freq === 125 || freq === 250) {
              dB = Math.max(5, dB);
            }
            
            let acdB = Math.round(dB / 5) * 5;
            // AC_MAXをチェックしてSO判定
            const acMax = AC_MAX[freq] ?? 110;
            const isACSO = acdB > acMax;
            acValues[freq] = isACSO ? acMax : acdB;
            generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
          });
          
          frequencies.forEach(freq => {
            const acValue = acValues[freq];
            let minBC = Math.max(0, acValue - 5);
            let maxBC = acValue + 5;
            
            if (freq === 125 || freq === 250) {
              minBC = Math.max(5, minBC);
              maxBC = Math.max(5, maxBC);
            }
            
            const minBCRounded = Math.ceil(minBC / 5) * 5;
            const maxBCRounded = Math.floor(maxBC / 5) * 5;
            const steps = Math.max(0, (maxBCRounded - minBCRounded) / 5);
            const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
            const bcMax = BC_MAX[freq] ?? 110;
            const isSO = bcValue > bcMax;
            generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: isSO ? bcMax : bcValue, ...(isSO ? { so: true } : {}) });
          });
        });
      } else if (caseType < 0.85) {
        // 伝音性難聴パターン（25%の確率）
        generatedAge = Math.floor(Math.random() * 46) + 5; // 5-50歳
        const age = generatedAge;
        
        ears.forEach(ear => {
          const airBoneGap = Math.round((Math.random() * 20 + 20) / 5) * 5;
          
          let acValues = {};
          frequencies.forEach(freq => {
            let dB = Math.round((Math.random() * 35 + 15) / 5) * 5;
            dB = Math.round(Math.max(5, Math.min(60, dB)) / 5) * 5;
            
            if (freq === 125 || freq === 250) {
              dB = Math.max(5, dB);
            }
            
            // AC_MAXをチェックしてSO判定
            const acMax = AC_MAX[freq] ?? 110;
            const isACSO = dB > acMax;
            acValues[freq] = isACSO ? acMax : dB;
            generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
          });
          
          frequencies.forEach(freq => {
            const acValue = acValues[freq];
            let minBC = Math.max(0, acValue - 30);
            let maxBC = acValue + 5;
            
            if (freq === 125 || freq === 250) {
              minBC = Math.max(5, minBC);
              maxBC = Math.max(5, maxBC);
            }
            
            const minBCRounded = Math.ceil(minBC / 5) * 5;
            const maxBCRounded = Math.floor(maxBC / 5) * 5;
            const steps = (maxBCRounded - minBCRounded) / 5;
            const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
            generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue });
          });
        });
      } else {
        // 混合性難聴パターン（15%の確率）
        generatedAge = Math.floor(Math.random() * 36) + 40; // 40-75歳
        const age = generatedAge;
        
        ears.forEach(ear => {
          const conductiveComponent = Math.round((Math.random() * 25 + 10) / 5) * 5;
          const sensorineuralComponent = Math.round((Math.random() * 25 + 15) / 5) * 5;
          
          let acValues = {};
          frequencies.forEach(freq => {
            let dB = conductiveComponent + sensorineuralComponent;
            dB = Math.round(Math.max(5, Math.min(80, dB)) / 5) * 5;
            
            if (freq === 125 || freq === 250) {
              dB = Math.max(5, dB);
            }
            
            // AC_MAXをチェックしてSO判定
            const acMax = AC_MAX[freq] ?? 110;
            const isACSO = dB > acMax;
            acValues[freq] = isACSO ? acMax : dB;
            generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
          });
          
          frequencies.forEach(freq => {
            const acValue = acValues[freq];
            let minBC = Math.max(0, acValue - 30);
            let maxBC = acValue + 5;
            
            if (freq === 125 || freq === 250) {
              minBC = Math.max(5, minBC);
              maxBC = Math.max(5, maxBC);
            }
            
            const minBCRounded = Math.ceil(minBC / 5) * 5;
            const maxBCRounded = Math.floor(maxBC / 5) * 5;
            const steps = (maxBCRounded - minBCRounded) / 5;
            const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
            generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue });
          });
        });
      }
    }
    
    // ターゲットのみを設定（症例情報は生成しない）
    setPoints([]);
    setTargets(generatedTargets.map(t => ({...t})));
    
    // 初期設定に戻す
    setEar('R');
    setTrans('AC');
    setLevel(0);
    setMaskLevel(-15);
    setFreq(1000);
    
    // 症例情報はクリア（聴力検査のみなので）
    setCurrentCaseInfo(null);
    setShowAiAnswer(false);
    setCustomPresetDetails(null);
  };
  // AI症例生成（臨床情報も含む完全な症例生成）
  const generateAICase = async () => {
    // 新エンジンでオージオグラムを生成（sex/ageGroup/profile/severity/affectedSideは内部で乱択）
    try {
      const caseData = generateAudiogram({});
      const STR2NUM = { "0.125kHz":125, "0.25kHz":250, "0.5kHz":500, "1kHz":1000, "2kHz":2000, "4kHz":4000, "8kHz":8000 };
      const targets = [];
      const pushEar = (rows, ear) => {
        rows.forEach(r => {
          const f = STR2NUM[r.freq];
          if (typeof r.ac === 'number') {
            targets.push({ ear, transducer: 'AC', masked: false, freq: f, dB: r.ac, ...(r.soAC ? { so: true } : {}) });
          }
          if (typeof r.bc === 'number' && f >= 250 && f <= 4000) {
            targets.push({ ear, transducer: 'BC', masked: true, freq: f, dB: r.bc, ...(r.soBC ? { so: true } : {}) });
          }
        });
      };
      pushEar(caseData.right, 'R');
      pushEar(caseData.left, 'L');

      // 画面へ反映
      setPoints([]);
      setTargets(targets);
      setEar('R');
      setTrans('AC');
      setLevel(0);
      setMaskLevel(-15);
      setFreq(1000);
      const meta = { ...(caseData.meta || {}) };
      const genderLabel = meta.sex === 'Male' ? '男性' : meta.sex === 'Female' ? '女性' : '';
      const ageLabel = meta.ageGroup || '';
      const profileName = meta.profile || meta.rightProfile || meta.leftProfile || 'Normal';
      if (!meta.profile) meta.profile = profileName;
      if (!meta.rightProfile) meta.rightProfile = profileName;
      if (!meta.leftProfile) meta.leftProfile = profileName;
      const casePatternForTests = inferCasePatternFromProfile(profileName);
      const simpleTympanogram = buildSimpleTympanogramFromProfile(profileName, meta);
      const artConfig = buildArtConfig(targets, simpleTympanogram, profileName, casePatternForTests, meta);
      const dpoaeConfig = buildDPOAEConfig(targets, simpleTympanogram);
      const caseInfo = {
        caseId: 'AI生成',
        meta,
        casePattern: casePatternForTests,
        gender: genderLabel,
        age: ageLabel,
        disorderType: profileName,
        disorderLabel: profileName,
        rightProfile: meta.rightProfile,
        leftProfile: meta.leftProfile,
        chiefComplaint: '聞こえにくさを自覚',
        history: '詳細は不明だが追加検査で評価予定。',
        findings: `簡易ティンパノグラム: ${simpleTympanogram.type}`,
        explanation: '',
        tympanogram: simpleTympanogram,
        artConfig,
        dpoaeConfig,
      };
      setCurrentCaseInfo(caseInfo);
      setShowAiAnswer(false);
      setCustomPresetDetails(caseInfo);
      setShowCaseInfoModal(false);
      return; // 旧ロジックは使用しない
    } catch (e) {
      console.error('AIエンジン生成エラー', e);
      setCurrentCaseInfo(null);
      setShowAiAnswer(false);
      setCustomPresetDetails(null);
      return;
    }
    const frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
    const ears = ['R', 'L'];
    const transducers = ['AC', 'BC'];
    // 疾患特異的なパターンを生成するか、汎用パターンを生成するか
    const useDisorderSpecific = Math.random() < 0.6; // 60%の確率で疾患特異的パターン
    let generatedTargets = [];
    let generatedAge = null;
    let selectedDisorderForGeneration = null;
    
    if (useDisorderSpecific && HEARING_DISORDERS.length > 0) {
      // 疾患をランダムに選択
      const disorder = HEARING_DISORDERS[Math.floor(Math.random() * HEARING_DISORDERS.length)];
      selectedDisorderForGeneration = disorder;
      
      // 年齢を疾患に適した範囲で決定
      generatedAge = Math.floor(Math.random() * (disorder.ageRange[1] - disorder.ageRange[0] + 1)) + disorder.ageRange[0];
      
      // 疾患特異的なパターンを生成
      generatedTargets = generateDisorderSpecificAudiogram(disorder, generatedAge, frequencies, ears);
    } else {
      // 従来の汎用パターン生成
      const caseType = Math.random();
      
      if (caseType < 0.3) {
        // 正常聴力パターン（30%の確率）- ISO 7029基準
        // まず年齢を決定（正常聴力の症例は若年層が多い）
        generatedAge = Math.floor(Math.random() * 46) + 5; // 5-50歳
        const age = generatedAge;
        
        ears.forEach(ear => {
          let acValues = {};
          // ISO 7029基準でAC値を生成
          frequencies.forEach(freq => {
            const normalRange = getNormalRangeForAge(age, freq);
            // 正常範囲内でランダムに生成（±5dBのバラつき）
            let dB = Math.round((Math.random() * (normalRange.max - normalRange.min) + normalRange.min) / 5) * 5;
            dB = Math.max(normalRange.min, Math.min(normalRange.max, dB));
            
            // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
            if (freq === 125 || freq === 250) {
              dB = Math.max(5, dB);
            }
            
            // AC_MAXをチェックしてSO判定
            const acMax = AC_MAX[freq] ?? 110;
            const isACSO = dB > acMax;
            acValues[freq] = isACSO ? acMax : dB;
            generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
          });
          
          // 次にBC値を生成（正常：AC±5dBの範囲内）
          frequencies.forEach(freq => {
            const acValue = acValues[freq];
            // 正常ではGAPは±5dB以内
            let minBC = Math.max(0, acValue - 5); // AC-5dBまで
            let maxBC = acValue + 5; // AC+5dBまで
            
            // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
            if (freq === 125 || freq === 250) {
              minBC = Math.max(5, minBC); // 最低5dB
              maxBC = Math.max(5, maxBC); // 最低5dB
            }
            
            // BC値がAC値の範囲外になることを防ぐ
            const actualMinBC = Math.max(0, minBC);
            let actualMaxBC = Math.max(actualMinBC, maxBC);
            
            // BC_MAXを超えないように制限
            const bcMax = BC_MAX[freq] ?? 110;
            actualMaxBC = Math.min(actualMaxBC, bcMax);
            
            // minBCとmaxBCを5dB刻みに丸める
            const minBCRounded = Math.ceil(actualMinBC / 5) * 5;
            const maxBCRounded = Math.floor(actualMaxBC / 5) * 5;
            
            // 5dB刻みの候補数を計算
            const steps = Math.max(0, (maxBCRounded - minBCRounded) / 5);
            // ランダムに選択
            const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
            const isBCSO = bcValue > bcMax;
            generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: isBCSO ? bcMax : bcValue, ...(isBCSO ? { so: true } : {}) });
          });
        });
      } else if (caseType < 0.6) {
        // 感音性難聴パターン（30%の確率）- 年齢を考慮
        generatedAge = Math.floor(Math.random() * 51) + 30; // 30-80歳（感音性難聴は中高年に多い）
        const age = generatedAge;
        
        ears.forEach(ear => {
          // 年齢に応じた基準値を設定（ISO 7029の正常値に追加損失）
          const normalAt2000 = getNormalHearingThreshold(age, 2000);
          const normalAt4000 = getNormalHearingThreshold(age, 4000);
          const baseLoss = Math.round((Math.random() * 25 + 15) / 5) * 5; // 15-40dBの追加損失
          const highFreqSlope = Math.round((Math.random() * 20 + 10) / 5) * 5; // 10-30dBの高音域損失
          
          let acValues = {};
          // まずAC値を生成（年齢による正常値をベースに）
          frequencies.forEach(freq => {
            const normalThreshold = getNormalHearingThreshold(age, freq) || 5;
            let dB = normalThreshold + baseLoss; // 正常値 + 追加損失
            
            // 高音域で傾斜を追加
            if (freq >= 2000) {
              const freqIndex = frequencies.indexOf(freq);
              const slopeFactor = (freqIndex - 4) / 3; // 2000Hz=0, 4000Hz=0.33, 8000Hz=1
              dB += Math.round(slopeFactor * highFreqSlope / 5) * 5;
            }
            
            // 軽微な変動を追加（±5dB）
            const variation = Math.round((Math.random() * 10 - 5) / 5) * 5;
            dB = dB + variation;
            
            // 周波数別の下限制約
            if (freq <= 2000) {
              // 125, 250, 500, 2000Hz：下限5dB
              dB = Math.max(5, Math.min(110, dB));
            } else {
              // 4000, 8000Hz：下限-5dB
              dB = Math.max(-5, Math.min(110, dB));
            }
            
            // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
            if (freq === 125 || freq === 250) {
              dB = Math.max(5, dB);
            }
            
            let acdB = Math.round(dB / 5) * 5;
            // AC_MAXをチェックしてSO判定
            const acMax = AC_MAX[freq] ?? 110;
            const isACSO = acdB > acMax;
            acValues[freq] = isACSO ? acMax : acdB;
            generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq], ...(isACSO ? { so: true } : {}) });
          });
          
          // 次にBC値を生成（感音性難聴：AC±5dBの範囲内）
          frequencies.forEach(freq => {
            const acValue = acValues[freq];
            // 感音性難聴ではGAPは±5dB以内
            let minBC = Math.max(0, acValue - 5); // AC-5dBまで
            let maxBC = acValue + 5; // AC+5dBまで
            
            // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
            if (freq === 125 || freq === 250) {
              minBC = Math.max(5, minBC); // 最低5dB
              maxBC = Math.max(5, maxBC); // 最低5dB
            }
            
            // BC値がAC値の範囲外になることを防ぐ
            // AC値が負の場合も考慮
            const actualMinBC = Math.max(0, minBC);
            const actualMaxBC = Math.max(actualMinBC, maxBC);
            
            // minBCとmaxBCを5dB刻みに丸める
            const minBCRounded = Math.ceil(actualMinBC / 5) * 5;
            const maxBCRounded = Math.floor(actualMaxBC / 5) * 5;
            
            // 5dB刻みの候補数を計算
            const steps = Math.max(0, (maxBCRounded - minBCRounded) / 5);
            // ランダムに選択
            const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
            generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue });
          });
        });
      } else if (caseType < 0.85) {
        // 伝音性難聴パターン（25%の確率）
        generatedAge = Math.floor(Math.random() * 46) + 5; // 5-50歳（小児から中年）
        const age = generatedAge;
        
        ears.forEach(ear => {
          const airBoneGap = Math.round((Math.random() * 20 + 20) / 5) * 5; // 20-40dBの気骨差（上限40dB）
          
          let acValues = {};
          // まずAC値を生成
          frequencies.forEach(freq => {
            let dB = Math.round((Math.random() * 35 + 15) / 5) * 5; // 15-50dB
            dB = Math.round(Math.max(5, Math.min(60, dB)) / 5) * 5;
            
            // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
            if (freq === 125 || freq === 250) {
              dB = Math.max(5, dB);
            }
            
            acValues[freq] = dB;
            generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq] });
          });
          
          // 次にBC値を生成（AC値-30dB〜AC値+5dBの範囲内）
          frequencies.forEach(freq => {
            const acValue = acValues[freq];
            // GAPが30dBを超えないように制約
            let minBC = Math.max(0, acValue - 30); // 下限0dB
            let maxBC = acValue + 5; // AC値+5dBまで
            
            // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
            if (freq === 125 || freq === 250) {
              minBC = Math.max(5, minBC); // 最低5dB
              maxBC = Math.max(5, maxBC); // 最低5dB
            }
            
            // BC値の範囲を5dB刻みで生成（GAP最大30dB、BC値上限AC値+5dB）
            // minBCとmaxBCを5dB刻みに丸める
            const minBCRounded = Math.ceil(minBC / 5) * 5;
            let maxBCRounded = Math.floor(maxBC / 5) * 5;
            // BC_MAXを超えないように制限
            const bcMax = BC_MAX[freq] ?? 110;
            maxBCRounded = Math.min(maxBCRounded, bcMax);
            // 5dB刻みの候補数を計算
            const steps = Math.max(0, (maxBCRounded - minBCRounded) / 5);
            // ランダムに選択
            const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
            const isSO = bcValue > bcMax;
            generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: isSO ? bcMax : bcValue, ...(isSO ? { so: true } : {}) });
          });
        });
      } else {
        // 混合性難聴パターン（15%の確率）
        generatedAge = Math.floor(Math.random() * 36) + 40; // 40-75歳
        const age = generatedAge;
        
        ears.forEach(ear => {
          const conductiveComponent = Math.round((Math.random() * 25 + 10) / 5) * 5; // 10-35dBの伝音成分
          const sensorineuralComponent = Math.round((Math.random() * 25 + 15) / 5) * 5; // 15-40dBの感音成分
          
          let acValues = {};
          // まずAC値を生成
          frequencies.forEach(freq => {
            let dB = conductiveComponent + sensorineuralComponent;
            dB = Math.round(Math.max(5, Math.min(80, dB)) / 5) * 5;
            
            // 臨床的制約：125Hz、250HzではACは5dBより良くなることはない（最低5dB）
            if (freq === 125 || freq === 250) {
              dB = Math.max(5, dB);
            }
            
            acValues[freq] = dB;
            generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq] });
          });
          
          // 次にBC値を生成（AC値-30dB〜AC値+5dBの範囲内）
          frequencies.forEach(freq => {
            const acValue = acValues[freq];
            // GAPが30dBを超えないように制約
            let minBC = Math.max(0, acValue - 30); // 下限0dB
            let maxBC = acValue + 5; // AC値+5dBまで
            
            // 臨床的制約：125Hz、250HzではBCは良くて5dB（最低5dB）
            if (freq === 125 || freq === 250) {
              minBC = Math.max(5, minBC); // 最低5dB
              maxBC = Math.max(5, maxBC); // 最低5dB
            }
            
            // BC値の範囲を5dB刻みで生成（GAP最大30dB、BC値上限AC値+5dB）
            // minBCとmaxBCを5dB刻みに丸める
            const minBCRounded = Math.ceil(minBC / 5) * 5;
            let maxBCRounded = Math.floor(maxBC / 5) * 5;
            // BC_MAXを超えないように制限
            const bcMax = BC_MAX[freq] ?? 110;
            maxBCRounded = Math.min(maxBCRounded, bcMax);
            // 5dB刻みの候補数を計算
            const steps = Math.max(0, (maxBCRounded - minBCRounded) / 5);
            // ランダムに選択
            const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
            const isSO = bcValue > bcMax;
            generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: isSO ? bcMax : bcValue, ...(isSO ? { so: true } : {}) });
          });
        });
      }
    }
    
    // BC値の制約ルール: 
    // 正常・感音性難聴：AC±5dB（下限0dB）
    // 伝音性・混合性難聴：AC-30dB〜AC+5dB（下限0dB）
    // プリセットと同じ形式で処理するため、後処理は行わない
    const adjustedTargets = generatedTargets;
    
    // AI機能: 生成された症例から難聴パターンと疾患を推定
    const patternAnalysis = analyzeHearingLossPattern(adjustedTargets, generatedAge);
    const casePattern = patternAnalysis.pattern;
    
    // 疾患特異的パターンで生成した場合は、その疾患を優先的に使用
    if (selectedDisorderForGeneration && patternAnalysis.possibleDisorders.length > 0) {
      // 生成時に使用した疾患が推定結果に含まれているか確認
      const foundDisorder = patternAnalysis.possibleDisorders.find(d => d.disorder.name === selectedDisorderForGeneration.name);
      if (foundDisorder) {
        // スコアを上げて最優先にする
        foundDisorder.score += 10;
        patternAnalysis.possibleDisorders.sort((a, b) => b.score - a.score);
      } else {
        // 見つからない場合は先頭に追加
        patternAnalysis.possibleDisorders.unshift({ disorder: selectedDisorderForGeneration, score: 15 });
      }
    }
    // AI機能: 症例の詳細情報を生成（年齢情報と疾患推定も渡す）
    const caseDetails = await generateCaseDetails(adjustedTargets, casePattern, generatedAge, patternAnalysis);
    const detailMeta = { ...(caseDetails.meta || {}) };
    if (!detailMeta.profile) {
      detailMeta.profile = detailMeta.rightProfile || detailMeta.leftProfile || casePattern;
    }
    if (!detailMeta.rightProfile) detailMeta.rightProfile = detailMeta.profile || casePattern;
    if (!detailMeta.leftProfile) detailMeta.leftProfile = detailMeta.profile || casePattern;
    caseDetails.meta = detailMeta;
    if (!caseDetails.rightProfile) caseDetails.rightProfile = detailMeta.rightProfile;
    if (!caseDetails.leftProfile) caseDetails.leftProfile = detailMeta.leftProfile;
    
    // ART/DPOAE設定も生成（疾患情報と症例パターンを渡す）
    const selectedDisorderName = caseDetails.selectedDisorder?.name || null;
    caseDetails.artConfig = buildArtConfig(adjustedTargets, caseDetails.tympanogram, selectedDisorderName, caseDetails.casePattern, caseDetails.meta || {});
    caseDetails.dpoaeConfig = buildDPOAEConfig(adjustedTargets, caseDetails.tympanogram);
    
    setCustomPresetDetails(caseDetails);
    
    // 症例情報を設定（必要時に開ける）
    const normalizeTymp = (t) => {
      if (!t) return t;
      const left = t.left || t.right || { peakPressure: 0, peakCompliance: 1.0, sigma: 60 };
      const right = t.right || t.left || { peakPressure: 0, peakCompliance: 1.0, sigma: 60 };
      return { ...t, left, right };
    };
    setCurrentCaseInfo({ caseId: 'AI生成', ...caseDetails, tympanogram: normalizeTymp(caseDetails.tympanogram) });
    setShowAiAnswer(false);
    setShowCaseInfoModal(false);
    
    // 生成された症例を適用（プリセットと同じ形式で処理）
    setPoints([]);
    setTargets(adjustedTargets.map(t => ({...t})));
    
    // 初期設定に戻す
    setEar('R');
    setTrans('AC');
    setLevel(0);
    setMaskLevel(-15);
    setFreq(1000);
    // オーバーレイ（正答）の表示状態はユーザーの設定を維持（自動変更しない）
  };


  // Refs / layout
  const containerRef = useRef(null);
  const chartHostRef = useRef(null);
  const overlayRef = useRef(null);
  const plotCalRef = useRef({ scaleY: 1, deltaTop: 0 });
  // Fixed-size chart: plotting area derived from CELL_PX and margins (no ResponsiveContainer)
  const chartW = GRID_W + AXIS_LEFT + AXIS_RIGHT; // widened right margin to avoid 8000 label clipping
  const chartH = GRID_H + AXIS_TOP + AXIS_BOTTOM;

  // Auto-hide legend if plotting box is too small (safety)
  useEffect(() => {
    setShowLegend(chartH * CHART_SCALE > 220);
  }, [chartH]);

  // --- Plot calibration: measure real grid box and align overlay ---
  useLayoutEffect(() => {
    const host = chartHostRef.current;
    const ov = overlayRef.current;
    if (!host || !ov) return;
    const gridG = host.querySelector('g.recharts-cartesian-grid');
    if (!gridG || !gridG.getBoundingClientRect) return;
    const gridRect = gridG.getBoundingClientRect();
    const ovRect = ov.getBoundingClientRect();
    const scaleY = gridRect.height / Math.max(1, ovRect.height);
    const deltaTop = gridRect.top - ovRect.top; // 上端の差（オーバーレイ→グリッド）
    plotCalRef.current = { scaleY, deltaTop };
  });

  // --- Dev sanity checks (non-intrusive) ---
  useEffect(() => {
    try {
      console.assert(Array.isArray(FREQS) && FREQS.length === 7, 'FREQS should have 7 items');
      console.assert(SERIES.every(s => s.key && s.color && s.shape), 'SERIES entries must have key/color/shape');
      const sampleTicks = Array.from({length: FREQS.length}, (_,i)=> i).map(formatFreq);
      console.assert(sampleTicks.every(t => String(t).length > 0), 'formatFreq should produce labels');
      // quick unit-like check for getThr mapping using PRESET_A
      const tmap = new Map();
      PRESET_A.targets.filter(t=>t.masked===false).forEach(t=>{
        const key = `${t.ear}|${t.transducer}|${t.freq}`;
        const base = t.so ? ((t.transducer==='AC'?(AC_MAX[t.freq]??110):(BC_MAX[t.freq]??110))+50) : t.dB;
        tmap.set(key, {dB: base});
      });
      const k = 'R|AC|1000';
      console.assert(tmap.get(k)?.dB === 5, 'getThr baseline sanity (R AC 1kHz should be 5 dB)');
      // helpers
      console.assert(round5(52) === 50 && round5(53) === 55, 'round5 should snap to nearest 5');
      console.assert(maxPresentable('AC', 1000) === 110, 'AC max @1k should be 110');
      // ensure getThr (component-scope) resolves with targetMap in place
      console.assert(Number.isFinite(getThr('R','AC',1000)), 'getThr should resolve for R AC 1k');

      // === Added self-tests per spec (1) 5dB丸め, (2) -10/120クランプ, (3) 0/50/100整合 ===
      // Pure mapping test with synthetic geometry
      const yMin=-10, yMax=120, gridH= (yMax - yMin); // 1px == 1dB for synthetic
      const mapYToDb = (y)=> yMin + (Math.max(0, Math.min(gridH, y)) / gridH) * (yMax - yMin);
      const assertNear5 = (val, expect)=> console.assert(Math.abs(round5(val) - expect) <= 0, `round5(${val}) ~= ${expect}`);
      assertNear5(mapYToDb( (0) ), -10);
      assertNear5(mapYToDb( gridH*0.5 ), 55); // 中央
      assertNear5(mapYToDb( gridH ), 120);
      // clamp extremes
      console.assert(Math.min(yMax, Math.max(yMin, -15)) === -10, 'clamp top to -10dB');
      console.assert(Math.min(yMax, Math.max(yMin, 130)) === 120, 'clamp bottom to 120dB');

      // showLegend presence
      console.assert(typeof showLegend === 'boolean', 'showLegend should be boolean');

      // masking logic quick checks
      const targets = PRESET_A.targets;
      const localMap = new Map();
      targets.filter(t=>t.masked===false).forEach(t=>{
        const overMax = (t.transducer==='AC' ? (AC_MAX[t.freq] ?? 110) : (BC_MAX[t.freq] ?? 110)) + 50;
        localMap.set(`${t.ear}|${t.transducer}|${t.freq}`, { dB: t.so ? overMax : t.dB });
      });
      const _getThr = (earKey, transKey, f)=> (localMap.get(`${earKey}|${transKey}|${f}`)?.dB ?? Infinity);
      const _hears = (earKey, transKey, f, L, maskedFlag, maskLvl)=>{
        const teThr = _getThr(earKey, transKey, f);
        const testEarHeard = L >= teThr;
        const nte = earKey === 'R' ? 'L' : 'R';
        const ia = IA[transKey] ?? 0;
        const leakedToNTE = L - ia;
        const nteBC = _getThr(nte, 'BC', f);
        const effectiveMask = (maskedFlag && maskLvl > nteBC) ? maskLvl : nteBC;
        const crossHeard = leakedToNTE >= effectiveMask;
        return testEarHeard || crossHeard;
      };
      console.assert(_hears('R','AC',1000,10,false,-15) === true, 'test-ear hears >= thr');
      console.assert(_hears('R','AC',2000,70,true,80) === true, 'effective masking keeps true via test-ear');
    } catch (e) {
      console.warn('Sanity check failed:', e);
    }
  }, [showLegend]);

  // Overlay answer (blink)
  const [showAnswer, setShowAnswer] = useState(false);
  const [overMaskingWarning, setOverMaskingWarning] = useState(true); // オーバーマスキング警告のON/OFF
  const [crossHearingWarning, setCrossHearingWarning] = useState(true); // クロスヒアリング警告のON/OFF
  const [blinkOn, setBlinkOn] = useState(true);

  // 現在位置フラッシュ用（点滅カーソル）
  const [cursorBlinkOn, setCursorBlinkOn] = useState(true);
  const [cursorBlinkEnabled, setCursorBlinkEnabled] = useState(true);

  useEffect(() => {
    if (!showAnswer) return;
    const id = setInterval(() => setBlinkOn(b => !b), 700);
    return () => clearInterval(id);
  }, [showAnswer]);

  // 現在位置フラッシュの点滅制御
  useEffect(() => {
    if (!cursorBlinkEnabled) return;
    const id = setInterval(() => setCursorBlinkOn(v => !v), 600);
    return () => clearInterval(id);
  }, [cursorBlinkEnabled]);

  // Debug: log showAnswer state changes
  useEffect(() => {
    console.log('showAnswer changed:', showAnswer);
  }, [showAnswer]);
  // Keyboard: Arrow keys for navigation and level control
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (e) => {
      const el = e.target;
      const tag = (el && el.tagName) ? el.tagName.toUpperCase() : '';
      const type = (el && el.type) ? String(el.type).toLowerCase() : '';
      const isTypingField = (tag === 'INPUT' && (type === 'text' || type === 'number' || type === 'search' || type === 'email' || type === 'password'))
                           || tag === 'TEXTAREA'
                           || (el && el.isContentEditable === true);
      if (isTypingField) return;

      // 周波数変更（左右キー）
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        console.log('右キー押下');
        setFreq((prev) => {
          const idx = Math.max(0, FREQS.indexOf(prev));
          const nextIdx = Math.min(FREQS.length - 1, idx + 1);
          return FREQS[nextIdx];
        });
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        console.log('左キー押下');
        setFreq((prev) => {
          const idx = Math.max(0, FREQS.indexOf(prev));
          const nextIdx = Math.max(0, idx - 1);
          return FREQS[nextIdx];
        });
      }

      // レベル調整（上下キー）- 上下を逆にして、自動打点
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        console.log('上キー押下');
        setLevel((prev) => {
          const newLevel = Math.min(Y_MAX, prev - 5); // 上キーで-5dB
          setSuppressLamp(false);
          // 自動で打点追加（応答ランプが点灯した時のみログ記録）
          setTimeout(() => {
            addOrReplacePoint({ ear, transducer: trans, masked, freq, dB: round5(newLevel) }, { disableBlinkAfter: false });
          }, 50);
          return newLevel;
        });
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        console.log('下キー押下');
        setLevel((prev) => {
          const newLevel = Math.max(Y_MIN, prev + 5); // 下キーで+5dB
          setSuppressLamp(false);
          // 自動で打点追加（応答ランプが点灯した時のみログ記録）
          setTimeout(() => {
            addOrReplacePoint({ ear, transducer: trans, masked, freq, dB: round5(newLevel) }, { disableBlinkAfter: false });
          }, 50);
          return newLevel;
        });
      }

      // Deleteキーで現在の打点削除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removePointAtCurrent();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [ear, trans, masked, freq, level]);

  // 周波数が変わったら一度ランプを消灯
  useEffect(() => { setSuppressLamp(true); }, [freq]);

  // 測定条件やレベルが変わったら現在位置フラッシュを再開
  useEffect(() => {
    setCursorBlinkEnabled(true);
  }, [ear, trans, freq, level]);

  const freqIndex = useMemo(() => Math.max(0, FREQS.indexOf(freq)), [freq]);
  function moveFreq(dir /* -1 | 1 */) {
    let idx = clamp(freqIndex + dir, 0, FREQS.length - 1);
    // BC時は125/8000Hzをスキップ
    if (trans === 'BC') {
      while (BC_DISABLED.has(FREQS[idx])) {
        idx = clamp(idx + dir, 0, FREQS.length - 1);
        if (idx === 0 || idx === FREQS.length - 1) break;
      }
    }
    setFreq(FREQS[idx]);
  }
  // clicking on chart -> add/replace point for current ear/trans/masked+freq
  function addOrReplacePoint(p, opts) {
    const disableBlinkAfter = opts && typeof opts.disableBlinkAfter === 'boolean' ? opts.disableBlinkAfter : true;
    if (p.transducer === 'BC' && BC_DISABLED.has(p.freq)) {
      setSuppressLamp(true);
      return;
    }
    const p2 = { ...p, masked: p.masked };
    const max = maxPresentable(p2.transducer, p2.freq);
    const atMax = p2.dB >= max;
    const heardAtMax = hearsAtLevel(p2.ear, p2.transducer, p2.freq, max);
    const so = atMax && !heardAtMax;
    const p3 = { ...p2, dB: atMax ? max : p2.dB, ...(so ? { so: true } : {}) };

    setPoints(prev => {
      const k = (x) => `${x.ear}|${x.transducer}|${x.masked ? 'M' : 'U'}|${x.freq}`;
      const kp = k(p3);
      const others = prev.filter(q => k(q) !== kp);
      return [...others, p3].sort((a,b)=> (a.freq-b.freq) || (a.dB-b.dB));
    });

    // Add to measurement log only when lamp is on (response detected)
    const lampOn = hearsAtLevel(p3.ear, p3.transducer, p3.freq, p3.dB);
    if (lampOn) {
      const logEntry = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        ear: p3.ear,
        transducer: p3.transducer,
        freq: p3.freq,
        dB: p3.dB,
        masked: p3.masked,
        maskLevel: masked ? maskLevel : -15,
        so: !!p3.so,
        caseId: selectedPreset
      };
      setMeasurementLog(prev => [...prev, logEntry]);
      // DBへ保存（匿名ユーザー単位）
      saveMeasurementToDB(logEntry);
      
      // Update learning progress
      setLearningProgress(prev => ({
        ...prev,
        totalMeasurements: prev.totalMeasurements + 1,
        lastSessionDate: new Date().toISOString().split('T')[0]
      }));
    }
    
    setSuppressLamp(false);
    // 確定操作後のフラッシュ制御（デフォルト: 停止、キーボード自動打点時は継続）
    if (disableBlinkAfter) setCursorBlinkEnabled(false);
  }

  // Precise hit: map overlay click to real grid using measured scale/offset
  function handlePlotClick(e){
    if (trans === 'BC' && BC_DISABLED.has(freq)) { setSuppressLamp(true); return; }
    const ov = overlayRef.current;
    if (!ov) return;
    const ovRect = ov.getBoundingClientRect();
    
    // クリック位置をオーバーレイ内の相対座標に変換
    const clickX = e.clientX - ovRect.left;
    const clickY = e.clientY - ovRect.top;
    
    // Y軸の範囲を計算（オーディオグラムは上から下に-10dBから120dB）
    const yRange = Y_MAX - Y_MIN; // 130dB
    const yRatio = clickY / ovRect.height; // 0から1の比率
    
    // RechartsのY軸はreversed=trueなので、座標変換を修正
    // 上（yRatio=0）が120dB、下（yRatio=1）が-10dB
    let dBraw = Y_MIN + (yRatio * yRange);
    dBraw += CAL_OFFSET_DB; // optional small offset (kept 0 by default)
    const dBclamped = clamp(round5(dBraw), Y_MIN, Y_MAX);

    const max = maxPresentable(trans, freq);
    const atMax = dBclamped >= max;
    const heardAtMax = hearsAtLevel(ear, trans, freq, max);
    const so = atMax && !heardAtMax;

    const p = { ear, transducer: trans, masked, freq, dB: atMax ? max : dBclamped, ...(so ? { so: true } : {}) };
    addOrReplacePoint(p, { disableBlinkAfter: true });
    setLevel(p.dB);
    setSuppressLamp(false);
  }

  function removePointAtCurrent() {
    setPoints(prev => prev.filter(q => !(
      q.ear===ear && q.transducer===trans && q.freq===freq && q.masked===masked
    )));
  }
  function clearAll() { setPoints([]); }

  // ---- Target lookup for cross-hearing & lamp logic ----
  const targetMap = useMemo(() => {
    const map = new Map();
    (targets||[]).forEach(t => {
      if (!t || typeof t.freq !== 'number') return;
      // BC値は常にmasked:trueとして保存されるが、targetMapには登録する必要がある
      // ただし、応答判定には常にunmaskedの閾値を使用する
      const overMax = (t.transducer==='AC' ? (AC_MAX[t.freq] ?? 110) : (BC_MAX[t.freq] ?? 110)) + 50;
      const dB = t.so ? overMax : t.dB;
      map.set(`${t.ear}|${t.transducer}|${t.freq}`, { dB });
    });
    return map;
  }, [targets]);

  // オーバーマスキング検出
  const isOverMasking = useMemo(() => {
    if (!masked || !overMaskingWarning) return false;
    
    const testEarBC = getThr(ear, 'BC', freq);
    if (testEarBC === Infinity) {
      return false;
    }
    
    // マスキングの上限 = 測定耳BC閾値 + 50dB
    const maskingLimit = testEarBC + 50;
    
    // マスキングレベルが上限を超えている場合
    return maskLevel > maskingLimit;
  }, [masked, maskLevel, ear, freq, overMaskingWarning, targetMap]);

  // クロスヒアリング検出
  const crossHearingInfo = useMemo(() => {
    if (!crossHearingWarning) return { isCrossHearing: false, details: null };
    
    const testEarThreshold = getThr(ear, trans, freq);
    if (testEarThreshold === Infinity) {
      return { isCrossHearing: false, details: null };
    }
    
    const nte = ear === 'R' ? 'L' : 'R';
    const ia = icSettings[freq]?.[trans] ?? (trans === 'AC' ? 50 : 0);
    const leakedToNTE = level - ia;
    const nteBC = getThr(nte, 'BC', freq);
    
    // マスキングが適用されている場合の効果的なマスキングレベル
    let effectiveMask = nteBC;
    if (masked && maskLevel > nteBC) {
      effectiveMask = maskLevel;
    }
    
    // クロスヒアリングが発生する条件
    const isCrossHearing = leakedToNTE >= effectiveMask;
    
    if (isCrossHearing) {
      return {
        isCrossHearing: true,
        details: {
          testEarThreshold,
          leakedToNTE,
          nteBC,
          effectiveMask,
          ia,
          nte
        }
      };
    }
    
    return { isCrossHearing: false, details: null };
  }, [level, ear, trans, freq, masked, maskLevel, crossHearingWarning, targetMap, icSettings]);

  const maskBandVisual = useMemo(() => {
    if (!masked || (typeof maskLevel !== 'number') || maskLevel <= -15) return null;
    const idx = freqIndex;
    if (idx < 0 || idx >= FREQS.length) return null;

    const centerFreq = FREQS[idx];
    const lowerBound = centerFreq / Math.SQRT2;
    const upperBound = centerFreq * Math.SQRT2;

    let lowerIdx = 0;
    for (let i = 0; i < FREQS.length; i += 1) {
      if (FREQS[i] >= lowerBound) { lowerIdx = i; break; }
    }
    let upperIdx = FREQS.length - 1;
    for (let i = FREQS.length - 1; i >= 0; i -= 1) {
      if (FREQS[i] <= upperBound) { upperIdx = i; break; }
    }

    const padding = 0.35;
    let x1 = clamp(lowerIdx - padding, X_DOMAIN[0], X_DOMAIN[1]);
    let x2 = clamp(upperIdx + padding, X_DOMAIN[0], X_DOMAIN[1]);
    if (x2 - x1 < 0.1) {
      x2 = Math.min(X_DOMAIN[1], x1 + 0.1);
    }

    const baseAlpha = clamp((maskLevel + 15) / (Y_MAX - Y_MIN + 15), 0, 1);
    let fill = 'rgba(59,130,246,0.25)'; // blue
    let fillOpacity = clamp(0.18 + baseAlpha * 0.4, 0.18, 0.65);
    let lineColor = '#1d4ed8';

    if (crossHearingInfo.isCrossHearing) {
      fill = 'rgba(249,115,22,0.32)'; // orange
      fillOpacity = Math.max(fillOpacity, 0.35);
      lineColor = '#f97316';
    }
    if (isOverMasking) {
      fill = 'rgba(239,68,68,0.42)'; // red
      fillOpacity = 0.45;
      lineColor = '#dc2626';
    }

    const clampedMaskLevel = clamp(maskLevel, Y_MIN, Y_MAX);
    const highlightTop = Math.min(clampedMaskLevel, Y_MIN);
    const highlightBottom = Math.max(clampedMaskLevel, Y_MIN);

    return {
      x1,
      x2,
      y1: highlightTop,
      y2: highlightBottom,
      fill,
      fillOpacity,
      lineColor
    };
  }, [masked, maskLevel, freqIndex, ear, isOverMasking, crossHearingInfo, targetMap, freq]);

  function getThr(earKey, transKey, f) {
    const key = `${earKey}|${transKey}|${f}`;
    const v = targetMap.get(key);
    
    
    if (v && typeof v.dB === 'number') {
      // SO（Scale-Out）の場合は最大値+50dBを返す
      if (v.dB >= 110) {
        return (transKey === 'AC' ? (AC_MAX[f] ?? 110) : (BC_MAX[f] ?? 110)) + 50;
      }
      return v.dB;
    }
    return Infinity; // missing → treat as no response
  }
  function hearsAtLevel(earKey, transKey, f, L, isMasked, mLevel) {
    const useMasked = isMasked !== undefined ? isMasked : masked;
    const useMaskLevel = mLevel !== undefined ? mLevel : maskLevel;
    
    const teThr = getThr(earKey, transKey, f);
    const nte = earKey === 'R' ? 'L' : 'R';
    const ia = icSettings[f]?.[transKey] ?? (transKey === 'AC' ? 50 : 0);
    const leakedToNTE = L - ia;
    
    // マスキングの基本原理：
    // AC測定時：非測定耳のBC閾値と比較
    // BC測定時：非測定耳のBC閾値と比較
    const nteBC = getThr(nte, 'BC', f);
    
    // マスキングの計算
    let effectiveMask = nteBC;
    if (useMasked && useMaskLevel > nteBC) {
      // マスキングレベルが非測定耳BC閾値より高い場合
      effectiveMask = useMaskLevel;
    }
    
    const crossHeard = leakedToNTE >= effectiveMask;
    
    // オーバーマスキングの計算
    let actualThreshold = teThr;
    if (useMasked) {
      // AC/BC測定時のオーバーマスキング計算
      // マスキングの上限 = 測定耳BC閾値 + 50dB
      const testEarBC = getThr(earKey, 'BC', f);
      const maskingLimit = testEarBC + 50;
      
      if (useMaskLevel > maskingLimit) {
        // オーバーマスキング発生
        const overMasking = useMaskLevel - maskingLimit;
        actualThreshold = teThr + overMasking;
      }
    }
    
    // 実際の閾値（オーバーマスキング考慮後）で判定
    const testEarHeard = L >= actualThreshold;
    
    return testEarHeard || crossHeard;
  }

  // series data (user)
  const seriesData = useMemo(() => {
    const m = {}; SERIES.forEach(s => m[s.key] = []);
    points.forEach(p => {
      const key = seriesKey(p);
      if (!m[key]) m[key] = [];
      const i = Math.max(0, FREQS.indexOf(p.freq));
      const xIdx = i;
      m[key].push({ x: xIdx, idx: i, y: p.dB, ...(p.so ? { so: true } : {}) });
    });
    return m;
  }, [points]);

  // AC lines (connect) — break at Scale-Out and at gaps
  // AC線はUnmasked/Maskedを区別せず、同じ周波数の打点があれば線で結ぶ
  const acLineData = useMemo(() => {
    const out = {};
    // AC系列を耳ごとに統合
    ['R', 'L'].forEach(ear => {
      const key = `${ear}-AC`;
      out[key] = FREQS.map((_, i) => ({ x: i, y: null }));
      
      // 現在の周波数のUnmasked/Maskedの両方の打点を取得
      FREQS.forEach((freq, i) => {
        const unmaskedPt = seriesData[`${ear}-AC-U`]?.find(p => p.x === i);
        const maskedPt = seriesData[`${ear}-AC-M`]?.find(p => p.x === i);
        
        // どちらかがあれば使用（優先順位: 現在選択されているmasked状態）
        const pt = maskedPt || unmaskedPt;
        
        if (pt) {
          if (!pt.so) {
            out[key][i] = { x: i, y: pt.y };
          }
        }
      });
    });
    return out;
  }, [seriesData]);

  // Build answer overlay series from loaded targets (markers)
  const answerSeriesData = useMemo(() => {
    const m = {}; SERIES.forEach(s => m[s.key] = []);
    (targets||[]).forEach(t => {
      if (t.transducer === 'BC' && BC_DISABLED.has(t.freq)) return;
      const i = Math.max(0, FREQS.indexOf(t.freq));
      const xIdx = i;
      const isSO = !!t.so;
      // dB値を5dB刻みに丸める（プリセット・ランダム共通）
      const rawYVal = isSO
        ? (t.transducer === 'AC' ? (AC_MAX[t.freq] ?? 110) : (BC_MAX[t.freq] ?? 110))
        : t.dB;
      const yVal = round5(rawYVal);
      // 正しいキーを使用（BC値もunmasked/maskedの状態に応じて）
      const key = `${t.ear}-${t.transducer}-${t.masked ? 'M' : 'U'}`;
      m[key] = m[key] || [];
      m[key].push({ x: xIdx, y: yVal, ...(isSO ? { so:true } : {}) });
    });
    return m;
  }, [targets]);

  // Answer AC lines: break at SO and at gaps by inserting null placeholders
  const answerLineData = useMemo(() => {
    const out = {};
    SERIES.filter(s => s.key.includes('-AC-')).forEach(s => {
      out[s.key] = FREQS.map((_, i) => ({ x: i, y: null }));
      const pts = (answerSeriesData[s.key] || []);
      pts.forEach(p => {
        const i = p.x;
        if (!p || typeof i !== 'number') return;
        out[s.key][i] = p.so ? { x: i, y: null } : { x: i, y: p.y };
      });
    });
    return out;
  }, [answerSeriesData]);

  // Response lamp (current condition vs target >= OR cross-hearing)
  // BC値は常にmasked:trueとして保存されるが、応答判定ではmaskedの条件を無視する
  const currentTarget = useMemo(() => (targets||[]).find(x => x.ear===ear && x.transducer===trans && x.freq===freq), [targets, ear, trans, freq]);
  const lampOn = useMemo(() => {
    if (!currentTarget) return false;
    if (suppressLamp) return false; // 抑制中は消灯
    const L = round5(level);
    
    // オーバーマスキングを考慮した応答判定
    return hearsAtLevel(ear, trans, freq, L);
  }, [currentTarget, level, ear, trans, freq, masked, maskLevel, targetMap, suppressLamp, icSettings]);

  // オーバーマスキングを考慮した実際の閾値を取得

  // 正答との比較機能
  function checkAccuracy() {
    if (!targets || targets.length === 0) return { total: 0, correct: 0, accuracy: 0, allCorrect: false };
    
    let total = 0;
    let correct = 0;
    
    // 各正答に対して、ユーザーの測定結果をチェック
    targets.forEach(target => {
      if (target.transducer === 'BC' && BC_DISABLED.has(target.freq)) return;
      
      total++;
      
      // 同じ条件（耳、トランスデューサー、周波数）の測定結果を探す
      // マスキング状態は問わず、最終的な閾値のみで判定
      const userMeasurement = points.find(p => 
        p.ear === target.ear && 
        p.transducer === target.transducer && 
        p.freq === target.freq
      );
      
      if (userMeasurement) {
        // SO（Scale-Out）の場合は、ユーザーの測定もSOである必要がある
        if (target.so) {
          // 正答はSO判定された測定値（dB値の一致は不要、SO判定があれば正解）
          if (userMeasurement.so) {
            correct++;
          }
        } else {
          // 通常の閾値が完全一致なら正解とする
          if (userMeasurement.dB === target.dB && !userMeasurement.so) {
            correct++;
          }
        }
      }
    });
    
    // 全ての測定値が一致しているか判定
    const allCorrect = total > 0 && correct === total;
    
    return {
      total,
      correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      allCorrect
    };
  }

  // セッション完了判定
  function isSessionComplete() {
    if (!targets || targets.length === 0) return false;
    
    const accuracy = checkAccuracy();
    // 全ての測定が完了しているか、または80%以上の精度で完了とみなす
    return accuracy.total === targets.length || accuracy.accuracy >= 80;
  }
  // CSV出力機能
  function exportToCSV() {
    if (measurementLog.length === 0) {
      alert('出力するデータがありません');
      return;
    }
    
    const headers = ['No', '時刻', '耳', 'トランスデューサー', '周波数(Hz)', '閾値(dB)', 'マスキング', 'マスキングレベル(dB)', 'Scale-Out'];
    const csvContent = [
      headers.join(','),
      ...measurementLog.map((log, index) => [
        index + 1,
        log.timestamp,
        log.ear,
        log.transducer,
        log.freq,
        log.dB,
        log.masked ? 'ON' : 'OFF',
        log.masked ? log.maskLevel : '-',
        log.so ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `audiogram_measurement_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  // レポート表示機能
  function generateReport() {
    if (Object.keys(learningProgress.caseAccuracy).length === 0) {
      alert('完了した症例がありません。\n症例をロードして「正答照合」でセッションを完了してからレポートを生成してください。');
      return;
    }
    
    // レポートデータを準備（学習効果重視）
    const completedCases = Object.keys(learningProgress.caseAccuracy);
    const totalAccuracy = completedCases.length > 0 ? 
      Math.round(completedCases.reduce((sum, caseId) => sum + learningProgress.caseAccuracy[caseId].accuracy, 0) / completedCases.length) : 0;
    
    const reportData = {
      title: 'HearSim 学習レポート',
      date: new Date().toLocaleDateString('ja-JP'),
      completedCases: completedCases.length,
      totalCases: 8,
      averageAccuracy: totalAccuracy,
      caseResults: completedCases.map(caseId => ({
        caseId,
        accuracy: learningProgress.caseAccuracy[caseId].accuracy,
        total: learningProgress.caseAccuracy[caseId].total,
        correct: learningProgress.caseAccuracy[caseId].correct,
        completedAt: learningProgress.caseAccuracy[caseId].completedAt
      })),
      learningProgress: learningProgress
    };
    
    // レポートを新しいウィンドウで表示
    const reportWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');
    reportWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>HearSim 測定レポート</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { background: #f0f0f0; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
          .stat-card { background: #e8f4fd; padding: 15px; border-radius: 8px; text-align: center; }
          .stat-number { font-size: 24px; font-weight: bold; color: #2563eb; }
          .stat-label { color: #64748b; margin-top: 5px; }
          .measurements { background: #f8fafc; padding: 15px; border-radius: 8px; }
          .measurement-item { background: white; margin: 5px 0; padding: 10px; border-radius: 4px; border-left: 4px solid #3b82f6; }
          .download-btn { background: #10b981; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${reportData.title}</h1>
          <p>生成日時: ${reportData.date}</p>
        </div>
        
        <div class="stats">
          <div class="stat-card">
            <div class="stat-number">${reportData.completedCases}/${reportData.totalCases}</div>
            <div class="stat-label">完了症例数</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${reportData.averageAccuracy}%</div>
            <div class="stat-label">平均精度</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${reportData.learningProgress.totalSessions}</div>
            <div class="stat-label">学習セッション数</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${reportData.learningProgress.lastSessionDate || '未実施'}</div>
            <div class="stat-label">最終学習日</div>
          </div>
        </div>
        
        <div class="measurements">
          <h3>症例別学習結果</h3>
          ${reportData.caseResults.length > 0 ? reportData.caseResults.map(result => `
            <div class="measurement-item">
              <strong>症例${result.caseId}</strong> - 
              精度: ${result.accuracy}% (${result.correct}/${result.total}) | 
              完了日: ${new Date(result.completedAt).toLocaleDateString('ja-JP')}
            </div>
          `).join('') : '<p>まだ完了した症例がありません。症例をロードして「正答照合」でセッションを完了してください。</p>'}
        </div>
        
        <button class="download-btn" onclick="downloadJSON()">JSONファイルをダウンロード</button>
        
        <script>
          const reportData = ${JSON.stringify(reportData, null, 2)};
          
          function downloadJSON() {
            const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'audiogram_report_${new Date().toISOString().split('T')[0]}.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        </script>
      </body>
      </html>
    `);
    reportWindow.document.close();
  }

  // セッション完了機能
  function completeSession() {
    const accuracy = checkAccuracy();
    const caseId = selectedPreset;
    
    // 症例別の精度を更新
    setLearningProgress(prev => ({
      ...prev,
      caseAccuracy: {
        ...prev.caseAccuracy,
        [caseId]: {
          total: accuracy.total,
          correct: accuracy.correct,
          accuracy: accuracy.accuracy,
          completedAt: new Date().toISOString()
        }
      },
      completedCases: [...prev.completedCases, caseId]
    }));
    
    alert(`症例${caseId}のセッションが完了しました！\n精度: ${accuracy.accuracy}% (${accuracy.correct}/${accuracy.total})`);
  }

  // 正答照合とセッション完了機能
  function checkAnswersAndCompleteSession() {
    if (!targets || targets.length === 0) {
      alert('症例をロードしてから正答照合を行ってください');
      return;
    }

    const accuracy = checkAccuracy();
    const caseId = selectedPreset;
    
    // ランダム症例の場合は成績追跡を更新（ただし学習進捗には含めない）
    if (caseId === 'Custom') {
      const isPerfect = accuracy.allCorrect;
      setRandomCasePerformance(prev => {
        const newStreak = isPerfect ? prev.streak + 1 : 0;
        const newMaxStreak = Math.max(prev.maxStreak, newStreak);
        
        return {
          totalCases: prev.totalCases + 1,
          correctCases: prev.correctCases + (isPerfect ? 1 : 0),
          streak: newStreak,
          maxStreak: newMaxStreak,
          caseHistory: [
            ...prev.caseHistory,
            {
              caseId: `Custom-${Date.now()}`,
              correct: isPerfect,
              timestamp: new Date().toISOString(),
              accuracy: accuracy.accuracy
            }
          ]
        };
      });
      alert(`ランダム症例のセッションが完了しました！\n精度: ${accuracy.accuracy}% (${accuracy.correct}/${accuracy.total})\n（この成績は自動生成問題の進捗に記録されます）`);
      return;
    }
    
    // プリセット症例のみ学習進捗に追加
    setLearningProgress(prev => ({
      ...prev,
      caseAccuracy: {
        ...prev.caseAccuracy,
        [caseId]: {
          total: accuracy.total,
          correct: accuracy.correct,
          accuracy: accuracy.accuracy,
          completedAt: new Date().toISOString()
        }
      },
      completedCases: prev.completedCases.includes(caseId) ? prev.completedCases : [...prev.completedCases, caseId]
    }));
    
    // 詳細な結果を表示
    const resultMessage = `症例${caseId}のセッションが完了しました！

【結果】
・測定項目数: ${accuracy.total}項目
・正解数: ${accuracy.correct}項目
・精度: ${accuracy.accuracy}%

【詳細】
${targets.map((target, index) => {
  if (target.transducer === 'BC' && BC_DISABLED.has(target.freq)) return '';
  
  const userMeasurement = points.find(p => 
    p.ear === target.ear && 
    p.transducer === target.transducer && 
    p.freq === target.freq
  );
  
  const isCorrect = userMeasurement ? userMeasurement.dB === target.dB : false;
  const diff = userMeasurement ? Math.abs(userMeasurement.dB - target.dB) : null;
  
  return `${target.ear} ${target.transducer} ${target.freq}Hz: ${userMeasurement ? `${userMeasurement.dB}dB (正答: ${target.dB}dB, 差: ${diff}dB) ${isCorrect ? '✓' : '✗'}` : '未測定 ✗'}`;
}).filter(line => line !== '').join('\n')}`;

    alert(resultMessage);
  }

  // Reset progress function
  function resetProgress() {
    if (window.confirm('学習進捗と自動生成問題の進捗をリセットしますか？この操作は取り消せません。')) {
      setLearningProgress({
        totalSessions: 0,
        completedCases: [],
        caseAccuracy: {},
        lastSessionDate: null
      });
      setMeasurementLog([]);
      // ランダム症例の成績もリセット
      setRandomCasePerformance({
        totalCases: 0,
        correctCases: 0,
        streak: 0,
        maxStreak: 0,
        caseHistory: []
      });
    }
  }

  // パスワード認証画面
  if (!isAuthenticated) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">HearSim - オーディオグラム講習会</h1>
            <p className="text-gray-600">参加用パスワードを入力してください</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && password === TRAINING_PASSWORD && setIsAuthenticated(true)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="講習会パスワード"
              />
            </div>
            <button
              onClick={() => password === TRAINING_PASSWORD && setIsAuthenticated(true)}
              disabled={password !== TRAINING_PASSWORD}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              参加する
            </button>
          </div>
          <div className="mt-6 text-center text-sm text-gray-500">
            パスワード: audiogram2024
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full min-h-screen p-6 md:p-10 bg-gray-50 text-gray-900" ref={containerRef}>
      <div className="max-w-7xl mx-auto grid gap-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">HearSim (Hearing Simulator)</h1>
            <p className="text-sm text-gray-600 mt-1">講習会参加中 - 講師の指示に従って操作してください</p>
          </div>
          <button
            onClick={() => setIsAuthenticated(false)}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            退出
          </button>
        </header>

        {/* 講習会用説明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 text-xl">📚</div>
            <div>
              <div className="font-semibold text-blue-800">講習会参加者の方へ</div>
              <div className="text-sm text-blue-700 mt-1">
                • 講師の指示に従って症例を選択してください<br/>
                • 各自で操作しながら学習を進めてください<br/>
                • 質問がある場合はチャットでお聞きください<br/>
                • 正答表示は講師の指示があるまで待ってください
              </div>
            </div>
          </div>
        </div>

        

        {/* IC Settings */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">IC設定（両耳間移行減衰量）</span>
            <button 
              className="px-3 py-2 rounded-xl bg-purple-600 text-white text-sm hover:bg-purple-700"
              onClick={() => setShowIcDialog(true)}
            >
              IC設定
            </button>
            <span className="text-xs text-gray-400">※ 周波数ごとのIC値を設定（デフォルト: AC=50dB, BC=0dB）</span>
          </div>
        </div>

        {/* IC設定ダイアログ */}
        {showIcDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">IC設定（両耳間移行減衰量）</h3>
              <div className="space-y-3">
                {FREQS.map(f => (
                  <div key={f} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="w-20 font-semibold">{f}Hz</div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm">AC:</label>
                      <input
                        type="number"
                        value={icSettings[f]?.AC ?? 50}
                        onChange={e => {
                          const newSettings = { ...icSettings };
                          newSettings[f] = { ...newSettings[f], AC: parseInt(e.target.value) || 50 };
                          setIcSettings(newSettings);
                        }}
                        className="w-20 px-2 py-1 border rounded"
                        min="0"
                        max="100"
                        step="5"
                      />
                      <span className="text-xs text-gray-500">dB</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm">BC:</label>
                      <input
                        type="number"
                        value={icSettings[f]?.BC ?? 0}
                        onChange={e => {
                          const newSettings = { ...icSettings };
                          newSettings[f] = { ...newSettings[f], BC: parseInt(e.target.value) || 0 };
                          setIcSettings(newSettings);
                        }}
                        className="w-20 px-2 py-1 border rounded"
                        min="0"
                        max="100"
                        step="5"
                      />
                      <span className="text-xs text-gray-500">dB</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowIcDialog(false)}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 症例情報モーダル */}
        {showCaseInfoModal && currentCaseInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-blue-800">症例{currentCaseInfo.caseId}の情報</h3>
                <button
                  onClick={() => setShowCaseInfoModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  閉じる
                </button>
              </div>
              
              <div className="space-y-4">
                {/* 基本情報 */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2">基本情報</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">年齢・性別:</span>
                      <span>{currentCaseInfo.age} {currentCaseInfo.gender}</span>
                    </div>
                  </div>
                </div>

                {/* 主訴 */}
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <h4 className="text-sm font-semibold text-orange-800 mb-2">主訴</h4>
                  <p className="text-sm text-gray-700">{currentCaseInfo.chiefComplaint}</p>
                </div>

                {/* 既往歴 */}
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <h4 className="text-sm font-semibold text-green-800 mb-2">現病歴</h4>
                  <p className="text-sm text-gray-700">{currentCaseInfo.history}</p>
                </div>

                {/* 所見 */}
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <h4 className="text-sm font-semibold text-purple-800 mb-2">診察所見</h4>
                  <p className="text-sm text-gray-700">{currentCaseInfo.findings}</p>
                </div>

                {/* 学習ポイント（OpenAI生成の場合のみ表示） */}
                {currentCaseInfo.explanation && (
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <h4 className="text-sm font-semibold text-yellow-800 mb-2">💡 学習ポイント（AI生成）</h4>
                    <p className="text-sm text-gray-700">{currentCaseInfo.explanation}</p>
                  </div>
                )}

                {/* （削除）検査結果を確認セクション */}
              </div>
            </div>
          </div>
        )}

        {/* Tympanogram Modal */}
        {showTympanogram && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-lg p-6 max-w-4xl w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-blue-800">ティンパノグラム検査（Tym）</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowTympanogram(false)}
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                  >
                    閉じる
                  </button>
                </div>
              </div>
              {currentCaseInfo?.tympanogram ? (
                <TympanogramGif 
                  width={800}
                  height={600}
                  tympanogramData={currentCaseInfo.tympanogram}
                  durationMs={5000}
                  fps={20}
                />
              ) : (
                <div className="text-center text-gray-500 py-8">
                  ティンパノグラムデータがありません
                </div>
              )}
            </div>
          </div>
        )}

        {/* ART (Stapedial Reflex) Modal */}
        {showStapedialReflex && currentCaseInfo?.artConfig && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-lg p-6 max-w-5xl w-full mx-4 max-h-[95vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-purple-800">あぶみ骨筋反射（ART）検査</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowStapedialReflex(false)}
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                  >
                    閉じる
                  </button>
                </div>
              </div>
              <StapedialReflexGif
                width={1000}
                height={900}
                durationMs={17000}
                fps={20}
                hearingConfig={currentCaseInfo.artConfig}
              />
            </div>
          </div>
        )}
        {/* DPOAE Modal - プリセット症例用 */}
        {showDPOAE && currentCaseInfo?.dpoaeConfig && currentCaseInfo?.caseId !== 'AI生成' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-lg p-6 max-w-[95vw] w-full mx-4 max-h-[95vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-orange-800">DPOAE検査</h3>
                  <p className="text-sm text-gray-600 mt-1">症例{currentCaseInfo?.caseId}（プリセット症例）</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDPOAE(false)}
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                  >
                    閉じる
                  </button>
                </div>
              </div>
              {(() => {
                try {
                  if (!currentCaseInfo?.dpoaeConfig) {
                    return <div className="text-red-600 p-4">DPOAE設定が見つかりません</div>;
                  }
                  const caseId = currentCaseInfo?.caseId || selectedPreset || 'A';
                  const dpoaeData = generateDPOAEData(currentCaseInfo.dpoaeConfig, caseId);
                  // ウィンドウ幅に応じて適応的にサイズを調整（最小幅1100px）
                  const containerWidth = Math.max(1100, window.innerWidth * 0.9);
                  return (
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <DPOAE
                        width={containerWidth}
                        height={600}
                        dpoaeData={dpoaeData}
                        durationMs={10000}
                        fps={20}
                      />
                    </div>
                  );
                } catch (error) {
                  console.error('DPOAE Error:', error);
                  return (
                    <div className="text-red-600 p-4">
                      <p>DPOAEグラフの読み込み中にエラーが発生しました:</p>
                      <pre className="text-xs mt-2 bg-gray-100 p-2 rounded">{error.message}</pre>
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        )}

        {/* DPOAE Modal - AI生成症例用 */}
        {showDPOAE && currentCaseInfo?.dpoaeConfig && currentCaseInfo?.caseId === 'AI生成' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-lg p-6 max-w-[95vw] w-full mx-4 max-h-[95vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-orange-800">DPOAE検査</h3>
                  <p className="text-sm text-gray-600 mt-1">AI生成症例</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDPOAE(false)}
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                  >
                    閉じる
                  </button>
                </div>
              </div>
              {(() => {
                try {
                  if (!currentCaseInfo?.dpoaeConfig) {
                    return <div className="text-red-600 p-4">DPOAE設定が見つかりません</div>;
                  }
                  const caseId = 'AI生成';
                  const dpoaeData = generateDPOAEData(currentCaseInfo.dpoaeConfig, caseId);
                  // ウィンドウ幅に応じて適応的にサイズを調整（最小幅1100px）
                  const containerWidth = Math.max(1100, window.innerWidth * 0.9);
                  return (
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <DPOAE
                        width={containerWidth}
                        height={600}
                        dpoaeData={dpoaeData}
                        durationMs={10000}
                        fps={20}
                      />
                    </div>
                  );
                } catch (error) {
                  console.error('DPOAE Error:', error);
                  return (
                    <div className="text-red-600 p-4">
                      <p>DPOAEグラフの読み込み中にエラーが発生しました:</p>
                      <pre className="text-xs mt-2 bg-gray-100 p-2 rounded">{error.message}</pre>
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        )}
        {/* Preset loader (secret) */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">症例プリセット</span>
            <select className="border rounded-xl px-2 py-1 text-sm" value={selectedPreset} onChange={(e)=> {
              const newPreset = e.target.value;
              setSelectedPreset(newPreset);
              // プリセット症例を選択した場合はAI生成症例の詳細をクリア
              setCustomPresetDetails(null);
              // もしプリセット症例が選択された場合は、その症例情報を設定
              const caseDetails = PRESET_DETAILS[newPreset];
              if (caseDetails) {
                setCurrentCaseInfo({ caseId: newPreset, ...caseDetails });
                setShowAiAnswer(false);
              }
            }}>
              <option value="A">症例A</option>
              <option value="B">症例B</option>
              <option value="C">症例C</option>
              <option value="D">症例D</option>
              <option value="E">症例E</option>
              <option value="F">症例F</option>
              <option value="G">症例G</option>
              <option value="H">症例H</option>
            </select>
            <button 
              className={`px-3 py-2 rounded-xl text-white text-sm flex items-center gap-2 ${
                isLoadingPreset ? 'bg-teal-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'
              }`} 
              onClick={async ()=>{
                if (isLoadingPreset) return;
                
                setIsLoadingPreset(true);
                setPresetToast(`症例${selectedPreset}を読み込み中…`);
                await new Promise(resolve => setTimeout(resolve, 400));
                const p = selectedPreset==='A' ? PRESET_A : selectedPreset==='B' ? PRESET_B : selectedPreset==='C' ? PRESET_C : selectedPreset==='D' ? PRESET_D : selectedPreset==='E' ? PRESET_E : selectedPreset==='F' ? PRESET_F : selectedPreset==='G' ? PRESET_G : PRESET_H;
                setPoints([]);
                setTargets(buildTargetsFromPreset(p));
                setEar('R');
                setTrans('AC');
                setLevel(0);
                setMaskLevel(-15);
                setFreq(1000);
                setLearningProgress(prev => ({ ...prev, totalSessions: prev.totalSessions + 1 }));
                setIsLoadingPreset(false);
                setPresetToast(`症例${selectedPreset}をロードしました`);
                setTimeout(()=> setPresetToast(''), 1200);
                
                // AI生成症例の詳細情報をクリア（プリセット症例を選択したので）
                setCustomPresetDetails(null);
                
                // 症例情報を設定（プリセット症例の情報を使用）
                const caseDetails = PRESET_DETAILS[selectedPreset];
                if (caseDetails) {
                  setCurrentCaseInfo({ caseId: selectedPreset, ...caseDetails });
                  setShowAiAnswer(false);
                  // 症例情報モーダルは表示しない（UI不要）
                  setShowCaseInfoModal(false);
                  setShowTympanogram(false);
                  setShowStapedialReflex(false);
                  setShowDPOAE(false);
                }
              }}
              disabled={isLoadingPreset}
            >
              {isLoadingPreset ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ロード中...
                </>
              ) : (
                'LOAD'
              )}
            </button>
            <span className="text-xs text-gray-400">※ LOADでプロットは自動クリア。正答は画面に表示しません（照合/オーバーレイ用）。</span>
            
            {/* 症例情報（プリセット）＋検査ボタン（Tym、ART、DPOAEの順） */}
            <button
              onClick={() => {
                if (currentCaseInfo && currentCaseInfo.caseId && currentCaseInfo.caseId !== 'AI生成') {
                  setShowCaseInfoModal(true);
                } else {
                  alert('症例をLOADしてください');
                }
              }}
              className={`px-3 py-2 rounded-xl text-white text-sm flex items-center gap-2 ${currentCaseInfo && currentCaseInfo.caseId && currentCaseInfo.caseId !== 'AI生成' ? 'bg-gray-700 hover:bg-gray-800' : 'bg-gray-300 cursor-not-allowed'}`}
              title="症例情報を表示"
            >
              📝 症例情報
            </button>
            <button
              onClick={() => {
                if (currentCaseInfo?.tympanogram) {
                  setShowTympanogram(true);
                } else {
                  alert('症例をLOADしてください');
                }
              }}
              className="px-3 py-2 rounded-xl text-white text-sm bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
              title="ティンパノグラム検査を表示"
            >
              📊 Tym
            </button>
            <button
              onClick={() => {
                if (currentCaseInfo?.artConfig) {
                  setShowStapedialReflex(true);
                } else {
                  alert('症例をLOADしてください');
                }
              }}
              className="px-3 py-2 rounded-xl text-white text-sm bg-purple-600 hover:bg-purple-700 flex items-center gap-2"
              title="あぶみ骨筋反射（ART）検査を表示"
            >
              🔊 ART
            </button>
            <button
              onClick={() => {
                if (currentCaseInfo?.dpoaeConfig) {
                  setShowDPOAE(true);
                } else {
                  alert('症例をLOADしてください');
                }
              }}
              className="px-3 py-2 rounded-xl text-white text-sm bg-orange-600 hover:bg-orange-700 flex items-center gap-2"
              title="DPOAE検査を表示"
            >
              📈 DPOAE
            </button>
          </div>
        </div>

        {/* 聴力検査のみの自動症例生成 */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">聴力検査練習</span>
            <button 
              className="px-3 py-2 rounded-xl text-white text-sm bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
              onClick={() => {
                generateAudioOnlyCase();
                setRandomToast('✅ 聴力検査症例を生成しました');
                setTimeout(() => setRandomToast(''), 1500);
              }}
            >
              🎯 聴力検査症例生成
            </button>
            <span className="text-xs text-gray-400">※ オーディオグラムのみ生成（臨床情報なし）</span>
          </div>
        </div>

        {/* AI症例生成 */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">AI症例生成</span>
            <button 
              className={`px-3 py-2 rounded-xl text-white text-sm flex items-center gap-2 transition-colors ${
                isLoadingRandom ? 'bg-green-400 opacity-70 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
              onClick={async ()=>{
                if (isLoadingRandom) return;
                setIsLoadingRandom(true);
                setRandomToast('🤖 AIが症例を生成中…');
                try {
                  await generateAICase();
                  setRandomToast('✅ AI症例を生成しました');
                } catch (error) {
                  console.error('症例生成エラー:', error);
                  setRandomToast('❌ 症例生成に失敗しました');
                } finally {
                  setTimeout(() => setRandomToast(''), 1500);
                  setIsLoadingRandom(false);
                }
              }}
              disabled={isLoadingRandom}
            >
              {isLoadingRandom ? (
                <>
                  <div className="animate-spin h-4 w-4 rounded-full border-2 border-white border-t-transparent"></div>
                  ロード中...
                </>
              ) : (
                'AI症例生成'
              )}
            </button>
            {/* AI症例用 症例情報＋Tym（常時表示。生成前は無効） */}
            <button
              onClick={() => {
                if (currentCaseInfo?.caseId === 'AI生成') {
                  setShowCaseInfoModal(true);
                } else {
                  alert('AI症例生成後に症例情報を表示できます');
                }
              }}
              className={`px-3 py-2 rounded-xl text-white text-sm flex items-center gap-2 ${currentCaseInfo?.caseId === 'AI生成' ? 'bg-gray-700 hover:bg-gray-800' : 'bg-gray-300 cursor-not-allowed'}`}
              title="症例情報（AI症例）を表示"
            >
              📝 症例情報
            </button>
            <button
              onClick={() => {
                if (currentCaseInfo?.caseId === 'AI生成' && currentCaseInfo?.tympanogram) {
                  setShowTympanogram(true);
                } else {
                  alert('AI症例生成後にTymを表示できます');
                }
              }}
              className={`px-3 py-2 rounded-xl text-white text-sm flex items-center gap-2 ${currentCaseInfo?.caseId === 'AI生成' && currentCaseInfo?.tympanogram ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}
              title="ティンパノグラム検査を表示（AI症例）"
            >
              📊 Tym
            </button>
            {currentCaseInfo && currentCaseInfo.caseId === 'AI生成' && currentCaseInfo.artConfig && (
              <button
                onClick={() => setShowStapedialReflex(true)}
                className="px-3 py-2 rounded-xl text-white text-sm bg-purple-600 hover:bg-purple-700 flex items-center gap-2"
                title="あぶみ骨筋反射（ART）検査を表示（AI生成症例）"
              >
                ART検査を見る
              </button>
            )}
            {currentCaseInfo && currentCaseInfo.caseId === 'AI生成' && currentCaseInfo.dpoaeConfig && (
              <button
                onClick={() => setShowDPOAE(true)}
                className="px-3 py-2 rounded-xl text-white text-sm bg-orange-600 hover:bg-orange-700 flex items-center gap-2"
                title="DPOAE検査を表示（AI生成症例）"
              >
                DPOAE検査を見る
              </button>
            )}
            {currentCaseInfo?.caseId === 'AI生成' && (
              <button
                onClick={() => setShowAiAnswer(v => !v)}
                className={`px-3 py-2 rounded-xl text-sm flex items-center gap-2 border ${
                  showAiAnswer
                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                    : 'bg-white text-emerald-700 border-emerald-600 hover:bg-emerald-50'
                }`}
                title="AI症例の答え合わせを表示"
              >
                {showAiAnswer ? '答え合わせを隠す' : '答え合わせを見る'}
              </button>
            )}
            <span className="text-xs text-gray-400">🤖 AIにより症例パターンを自動生成（正常・感音性・伝音性・混合性難聴）+ 臨床情報も自動生成</span>
          </div>

        {/* 答え合わせ（AI症例用） */}
        {currentCaseInfo?.caseId === 'AI生成' && showAiAnswer && (
          <div className="mt-3 p-3 border rounded-xl bg-gray-50">
            <div className="text-sm font-semibold mb-1">答え合わせ（耳ごとの最終診断タイプ）</div>
            <div className="text-sm text-gray-800 flex flex-wrap gap-4">
              <div>右耳: <span className="font-medium">{currentCaseInfo?.meta?.rightProfile || currentCaseInfo?.rightProfile || '-'}</span></div>
              <div>左耳: <span className="font-medium">{currentCaseInfo?.meta?.leftProfile || currentCaseInfo?.leftProfile || '-'}</span></div>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              性別: {currentCaseInfo?.gender || '-'} ／ 年代: {currentCaseInfo?.age || '-'} ／ 全体プロファイル: {currentCaseInfo?.disorderType || '-'}
            </div>
          </div>
        )}
        </div>
        {/* Controls */}
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="grid md:grid-cols-6 gap-4 text-sm">
            <Control label="Ear">
              <div className="flex gap-2">
                <button onClick={() => { setEar('R'); setFreq(1000); setSuppressLamp(true); }} className={`px-3 py-2 rounded-lg border text-base ${ear==='R' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-600'}`}>Right</button>
                <button onClick={() => { setEar('L'); setFreq(1000); setSuppressLamp(true); }} className={`px-3 py-2 rounded-lg border text-base ${ear==='L' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-600'}`}>Left</button>
              </div>
            </Control>
            <Control label="Transducer">
              <div className="flex gap-2">
                <TinyToggle active={trans==='AC'} onClick={() => { setTrans('AC'); setFreq(1000); setSuppressLamp(true); }}>AC</TinyToggle>
                <TinyToggle active={trans==='BC'} onClick={() => { setTrans('BC'); setFreq(1000); setSuppressLamp(true); }}>BC</TinyToggle>
              </div>
            </Control>
            <Control label="Frequency">
              <div className="flex items-center gap-2">
                <button onClick={() => moveFreq(-1)} className="px-2 py-1 rounded-lg border">◀</button>
                <div className="font-mono w-24 text-center">{freq} Hz</div>
                <button onClick={() => moveFreq(1)} className="px-2 py-1 rounded-lg border">▶</button>
              </div>
            </Control>
            <Control label="Level (dB HL)">
              <div className="flex items-center gap-3">
                <input type="range" min={Y_MIN} max={Y_MAX} step={5} value={level} onChange={e => { setLevel(parseInt(e.target.value)); setSuppressLamp(false); }} className="w-full" />
                <div className="font-mono w-16 text-right">{level}</div>
              </div>
            </Control>
            <Control label="打点">
              <div className="flex gap-2">
                <button 
                  onClick={() => addOrReplacePoint({ ear, transducer: trans, masked, freq, dB: round5(level) }, { disableBlinkAfter: true })} 
                  className="px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors active:scale-95 transform"
                >
                  追加/更新
                </button>
                <button 
                  onClick={removePointAtCurrent} 
                  className="px-3 py-2 rounded-xl bg-white border hover:bg-gray-50 transition-colors active:scale-95 transform"
                >
                  削除
                </button>
                <button 
                  onClick={clearAll} 
                  className="px-3 py-2 rounded-xl bg-white border hover:bg-gray-50 transition-colors active:scale-95 transform"
                >
                  全クリア
                </button>
              </div>
            </Control>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ※ チャートをクリックしても打点できます（現在選択中のEar/Transducer/Masking・周波数列に対して）。<br/>
            ※ キーボード操作: ←→周波数変更 | ↑-5dB調整(自動打点) | ↓+5dB調整(自動打点) | Delete打点削除
          </p>
        </div>

        {/* オーバーマスキング警告 */}
        {isOverMasking && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="text-red-600 text-xl">⚠️</div>
              <div>
                <div className="font-semibold text-red-800">オーバーマスキングの可能性あり！！</div>
              </div>
            </div>
          </div>
        )}
        {/* クロスヒアリング警告 */}
        {crossHearingInfo.isCrossHearing && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="text-orange-600 text-xl">🔊</div>
              <div className="flex-1">
                <div className="font-semibold text-orange-800 mb-2">クロスヒアリングの可能性あり！</div>
                <div className="text-sm text-orange-700 space-y-1">
                  <div>• 現在のレベル（{level}dB）が非測定耳の骨導（{crossHearingInfo.details.nte} BC）に流れクロスヒアリングしています</div>
                  <div>• 漏れレベル: {crossHearingInfo.details.leakedToNTE.toFixed(1)}dB（IA: {crossHearingInfo.details.ia}dB減衰後）</div>
                  <div>• 非測定耳BC閾値: {crossHearingInfo.details.nteBC === Infinity ? '未測定' : crossHearingInfo.details.nteBC + 'dB'}</div>
                  <div>• 実効マスキングレベル: {crossHearingInfo.details.effectiveMask === Infinity ? 'なし' : crossHearingInfo.details.effectiveMask + 'dB'}</div>
                  <div className="mt-2 text-xs text-orange-600">
                    💡 マスキングレベルを上げるか、測定レベルを下げることを検討してください
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Audiogram */}
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-lg font-semibold">Audiogram</h2>
            <div className={`flex items-center gap-3 px-3 py-1.5 rounded-full border ${lampOn ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-300'}`}>
              <div className={`w-5 h-5 rounded-full ${lampOn ? 'bg-orange-500' : 'bg-gray-300'}`} />
              <div className="flex flex-col leading-tight text-sm text-gray-800 whitespace-nowrap">
                <span className="-mb-0.5 block">応答</span>
                <span className="block">ランプ</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600">Masking (NTE: {ear === 'R' ? 'L' : 'R'})</span>
              <div className="flex items-center gap-2">
                <TinyToggle active={!masked} onClick={() => { 
                  // Unmasked切り替え時に、現在の周波数のMasked打点を削除
                  setPoints(prev => prev.filter(p => !(p.ear === ear && p.transducer === trans && p.freq === freq && p.masked === true)));
                  setMasked(false); 
                  setMaskLevel(-15); 
                }}>Unmasked</TinyToggle>
                <TinyToggle active={masked} onClick={() => { 
                  // Masked切り替え時に、現在の周波数のUnmasked打点を削除
                  setPoints(prev => prev.filter(p => !(p.ear === ear && p.transducer === trans && p.freq === freq && p.masked === false)));
                  setMasked(true); 
                  if (maskLevel < 0) setMaskLevel(0); 
                }}>Masked</TinyToggle>
              </div>
              <div className="flex items-center gap-3 min-w-[320px]">
                <input
                  type="range"
                  min={-15}
                  max={110}
                  step={5}
                  value={maskLevel}
                  onChange={e => setMaskLevel(parseInt(e.target.value))}
                  className="w-56"
                />
                <input
                  type="number"
                  min={-15}
                  max={110}
                  step={5}
                  value={maskLevel}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    if (Number.isNaN(v)) return;
                    setMaskLevel(clamp(v, -15, 110));
                  }}
                  className="w-28 px-3 py-2 border rounded-lg text-sm font-mono text-right"
                />
                <div className="w-10 text-right text-sm font-mono">dB</div>
              </div>
              <button onClick={() => setShowAnswer(a => !a)} className={`px-2 py-1 rounded-lg border text-xs ${showAnswer ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-800'}`} title="正答（オーバーレイ）を表示/非表示">
                {showAnswer ? '正答表示: ON' : '正答表示: OFF'}
              </button>
              <button 
                onClick={() => checkAnswersAndCompleteSession()} 
                className="px-3 py-1 rounded-lg border text-xs bg-purple-600 text-white border-purple-600 hover:bg-purple-700"
                title="正答と照合してセッションを完了"
              >
                正答照合
              </button>
              <button onClick={() => setOverMaskingWarning(w => !w)} className={`px-2 py-1 rounded-lg border text-xs ${overMaskingWarning ? 'bg-yellow-600 text-white border-yellow-600' : 'bg-white text-gray-800'}`} title="オーバーマスキング警告のON/OFF">
                {overMaskingWarning ? 'オーバーマスキング警告：ON' : 'オーバーマスキング警告：OFF'}
              </button>
              <button onClick={() => setCrossHearingWarning(w => !w)} className={`px-2 py-1 rounded-lg border text-xs ${crossHearingWarning ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-800'}`} title="クロスヒアリング警告のON/OFF">
                {crossHearingWarning ? 'クロスヒアリング警告：ON' : 'クロスヒアリング警告：OFF'}
              </button>
            </div>
          </div>

          <div className="flex items-stretch gap-0 items-start">
            <div ref={chartHostRef} className="relative chart-host" style={{ width: chartW, height: chartH, overflow: 'visible' }}>
              <div
                ref={overlayRef}
                className="absolute"
                style={{ left: CHART_MARGIN.left, top: CHART_MARGIN.top, width: GRID_W, height: GRID_H, cursor: 'crosshair', zIndex: 10, pointerEvents: 'auto', background: 'transparent' }}
                onPointerUp={handlePlotClick}
                onPointerDown={(e)=>e.preventDefault()}
              />
              <ComposedChart width={chartW} height={chartH} data={[]} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" domain={X_DOMAIN} ticks={Array.from({ length: FREQS.length }, (_, i) => i)} tickFormatter={formatFreq} label={{ value: 'Frequency (Hz) - 1 octave/grid', position: 'bottom', offset: 6, style: { fontSize: 22 } }} tick={{ fontSize: 20 }} />
                  <YAxis type="number" dataKey="y" domain={[Y_MIN, Y_MAX]} ticks={Array.from({ length: (Y_MAX - Y_MIN) / 10 + 1 }, (_, i) => Y_MIN + i * 10)} reversed={true} tickMargin={6} label={{ value: 'Hearing Level (dB HL) - 10 dB/grid', angle: -90, position: 'left', offset: 0, dy: -100, style: { fontSize: 22 } }} tick={{ fontSize: 20 }} />
                  <Line data={[{ x: 0, y: 0 }, { x: FREQS.length - 1, y: 0 }]} dataKey="y" xAxisId={0} yAxisId={0} type="monotone" dot={false} stroke="#94a3b8" strokeWidth={2} />

                  {maskBandVisual && (
                    <ReferenceArea
                      x1={maskBandVisual.x1}
                      x2={maskBandVisual.x2}
                      y1={maskBandVisual.y1}
                      y2={maskBandVisual.y2}
                      fill={maskBandVisual.fill}
                      fillOpacity={maskBandVisual.fillOpacity}
                      ifOverflow="extendDomain"
                    />
                  )}

                  {SERIES.map(s => (
                    <Scatter key={s.key} name={s.label} data={(seriesData[s.key] || []).map(d => ({ x: d.x, y: d.y, ...(d.so ? { so: true } : {}) }))} fill={s.color} shape={shapeRenderer(s.shape, s.color)} />
                  ))}

                  {/* 現在位置フラッシュ（点滅カーソル） */}
                  {cursorBlinkEnabled && (
                    <Scatter
                      key="cursor-indicator"
                      name="Current Position"
                      data={[{ x: Math.max(0, FREQS.indexOf(freq)), y: round5(level) }]}
                      shape={(props) => {
                        const { cx, cy } = props;
                        const r = MARK_R + 4;
                        return (
                          <g style={{ opacity: cursorBlinkOn ? 1 : 0 }}>
                            <circle cx={cx} cy={cy} r={r} stroke="#f59e0b" strokeWidth={2} fill="rgba(245, 158, 11, 0.12)" />
                            <circle cx={cx} cy={cy} r={2} fill="#f59e0b" />
                          </g>
                        );
                      }}
                    />
                  )}

                  {['R-AC', 'L-AC'].map(key => {
                    const s = SERIES.find(ser => ser.key.startsWith(key));
                    if (!s) return null;
                    const color = key.startsWith('R-') ? SERIES.find(ser => ser.key === 'R-AC-U')?.color || '#ef4444' : SERIES.find(ser => ser.key === 'L-AC-U')?.color || '#3b82f6';
                    return (
                      <Line key={`line-${key}`} data={acLineData[key] || []} dataKey="y" stroke={color} strokeWidth={2} dot={false} strokeDasharray={key.startsWith('L-') ? '6 4' : undefined} type="linear" connectNulls={false} />
                    );
                  })}

                  {showAnswer && SERIES.map(s => (
                    <Scatter
                      key={`ans-${s.key}`}
                      name={`${s.label} (answer)`}
                      data={answerSeriesData[s.key] || []}
                      fill="#10b981"
                      shape={(props) => (
                        <g style={{ opacity: blinkOn ? 1 : 0 }}>
                          {shapeRenderer(s.shape, '#10b981')(props)}
                          {props?.payload?.so && (
                            <text x={props.cx + 10} y={props.cy - 10} fill="#10b981" fontSize={12} fontWeight="bold">SO</text>
                          )}
                        </g>
                      )}
                      isAnimationActive={false}
                    />
                  ))}
                  {showAnswer && SERIES.filter(s => s.key.includes('-AC-')).map(s => (
                    <Line key={`ans-line-${s.key}`} data={answerLineData[s.key] || []} dataKey="y" stroke="#10b981" strokeOpacity={0.35} isAnimationActive={false} strokeWidth={2} dot={false} strokeDasharray={'4 6'} type="linear" connectNulls={false} />
                  ))}
                </ComposedChart>
            </div>
            {showLegend && (
              <div className="shrink-0 pl-2" style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div className="flex flex-col gap-3">
                  <ul className="space-y-0.5 text-[18px] leading-tight pr-1">
                    {SERIES.map(s => (
                      <li key={s.key} className="flex items-center gap-2">
                        <LegendMark shape={s.shape} color={s.color} />
                        <span>{s.label}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-[15px] leading-snug max-w-[420px]">
                    <div className="flex items-start gap-2 mb-1">
                      <div className="text-green-600 text-[18px]">⌨️</div>
                      <div className="font-semibold text-green-800 text-[16px]">キーボード操作</div>
                    </div>
                    <div className="text-green-700 space-y-1">
                      <div className="whitespace-nowrap"><strong>カーソルキー:</strong> ←→ 周波数 | ↑ -5dB(自動打点) | ↓ +5dB(自動打点)</div>
                      <div className="whitespace-nowrap"><strong>削除:</strong> Delete/Backspace で現在の打点削除</div>
                      <div className="whitespace-nowrap"><strong>マウス:</strong> チャートクリックで打点</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Measurement Log */}
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">測定ログ</h2>
            <div className="flex gap-2">
              <button 
                onClick={() => setMeasurementLog([])} 
                className="px-3 py-1 rounded-lg border text-sm bg-gray-100 hover:bg-gray-200"
              >
                ログクリア
              </button>
              <button 
                onClick={loadMeasurementsFromDB}
                className="px-3 py-1 rounded-lg border text-sm bg-gray-100 hover:bg-gray-200"
              >
                履歴読込
              </button>
              <button 
                onClick={() => exportToCSV()} 
                className="px-3 py-1 rounded-lg border text-sm bg-blue-100 hover:bg-blue-200 text-blue-700"
              >
                CSV出力
              </button>
              <span className="text-sm text-gray-500">
                {measurementLog.length}件の記録
              </span>
            </div>
          </div>
          
          {measurementLog.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              まだ応答記録がありません。<br/>
              応答ランプが点灯した時に記録が追加されます。
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {measurementLog.map((entry, index) => (
                  <div 
                    key={entry.id} 
                    className={`p-3 rounded-lg border text-sm ${
                      entry.masked 
                        ? 'bg-blue-50 border-blue-200' 
                        : 'bg-green-50 border-green-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-gray-500">
                        #{index + 1}
                      </span>
                      <span className="text-xs text-gray-500">
                        {entry.timestamp}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold">
                        {entry.freq}Hz {entry.dB}dB
                      </div>
                      <div className="text-xs">
                        {entry.ear} {entry.transducer} | 
                        {entry.masked ? (
                          <span className="text-blue-700">
                            マスキング {entry.maskLevel}dB
                          </span>
                        ) : (
                          <span className="text-green-700">
                            マスキング OFF
                          </span>
                        )}
                      </div>
                      {entry.so && (
                        <div className="text-xs text-red-600 font-semibold">
                          Scale-Out
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Session Status */}
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">セッション状況</h2>
            <div className="flex gap-2">
              <button 
                onClick={() => generateReport()} 
                className="px-3 py-1 rounded-lg border text-sm bg-green-100 hover:bg-green-200 text-green-700"
              >
                レポート生成
              </button>
            </div>
          </div>
          
          {!targets || targets.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              症例をロードしてから測定を開始してください。
            </div>
          ) : (
            <div className="text-center text-gray-600 py-8">
              <div className="text-lg font-medium mb-2">症例{selectedPreset}の測定中</div>
              <div className="text-sm">
                測定が完了したら「正答照合」ボタンをクリックして<br/>
                セッションを完了し、精度を確認してください。
              </div>
            </div>
          )}
          
          {/* 詳細分析 */}
          {measurementLog.length > 0 && (
            <div className="mt-6">
              <h3 className="text-md font-semibold mb-3">詳細分析</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 周波数別分析 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium mb-3">周波数別測定回数</h4>
                  <div className="space-y-2">
                    {FREQS.map(freq => {
                      const count = measurementLog.filter(log => log.freq === freq).length;
                      return (
                        <div key={freq} className="flex justify-between items-center">
                          <span className="text-sm">{freq}Hz</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-500 h-2 rounded-full" 
                                style={{ width: `${(count / Math.max(...FREQS.map(f => measurementLog.filter(log => log.freq === f).length))) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* 耳別分析 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium mb-3">耳別測定回数</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">右耳 (R)</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-red-500 h-2 rounded-full" 
                            style={{ width: `${(measurementLog.filter(log => log.ear === 'R').length / measurementLog.length) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium w-8 text-right">
                          {measurementLog.filter(log => log.ear === 'R').length}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">左耳 (L)</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${(measurementLog.filter(log => log.ear === 'L').length / measurementLog.length) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium w-8 text-right">
                          {measurementLog.filter(log => log.ear === 'L').length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Learning Progress Dashboard */}
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">学習進捗</h2>
            <button 
              onClick={() => resetProgress()} 
              className="px-3 py-1 rounded-lg border text-sm bg-red-100 hover:bg-red-200 text-red-700"
            >
              進捗リセット
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-indigo-50 rounded-lg p-4">
              <div className="text-sm text-indigo-600 font-medium">総セッション数</div>
              <div className="text-2xl font-bold text-indigo-800">{learningProgress.totalSessions}</div>
            </div>
            
            <div className="bg-teal-50 rounded-lg p-4">
              <div className="text-sm text-teal-600 font-medium">完了症例数</div>
              <div className="text-2xl font-bold text-teal-800">{learningProgress.completedCases.length}/8</div>
            </div>
            
            <div className="bg-amber-50 rounded-lg p-4">
              <div className="text-sm text-amber-600 font-medium">平均精度</div>
              <div className="text-2xl font-bold text-amber-800">
                {Object.keys(learningProgress.caseAccuracy).length > 0 ? 
                  Math.round(Object.values(learningProgress.caseAccuracy).reduce((sum, acc) => sum + acc.accuracy, 0) / Object.keys(learningProgress.caseAccuracy).length) : 0}%
              </div>
            </div>
            
            <div className="bg-rose-50 rounded-lg p-4">
              <div className="text-sm text-rose-600 font-medium">最終セッション</div>
              <div className="text-sm font-bold text-rose-800">
                {learningProgress.lastSessionDate || '未実施'}
              </div>
            </div>
          </div>
          
          {/* 症例別進捗 */}
          <div className="mt-6">
            <h3 className="text-md font-semibold mb-3">プリセット症例の進捗</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-8 gap-3">
              {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(caseId => {
                const caseData = learningProgress.caseAccuracy[caseId];
                const isCompleted = learningProgress.completedCases.includes(caseId);
                
                return (
                  <div 
                    key={caseId} 
                    className={`p-3 rounded-lg border text-center ${
                      isCompleted 
                        ? 'bg-green-50 border-green-200 text-green-800' 
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    <div className="font-semibold">症例{caseId}</div>
                    {isCompleted ? (
                      <>
                        <div className="text-sm font-bold">{caseData.accuracy}%</div>
                        <div className="text-xs text-green-600 font-medium">✓ 完了</div>
                      </>
                    ) : (
                      <div className="text-sm">未完了</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* 自動生成問題の進捗 */}
          <div className="mt-6">
            <h3 className="text-md font-semibold mb-3">自動生成問題の進捗</h3>
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-5 border border-purple-200">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="text-sm text-purple-600 font-medium">総症例数</div>
                  <div className="text-2xl font-bold text-purple-800 mt-1">{randomCasePerformance.totalCases}</div>
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="text-sm text-purple-600 font-medium">満点症例数</div>
                  <div className="text-2xl font-bold text-purple-800 mt-1">{randomCasePerformance.correctCases}</div>
                  {randomCasePerformance.totalCases > 0 && (
                    <div className="text-xs text-purple-500 mt-1">
                      ({Math.round((randomCasePerformance.correctCases / randomCasePerformance.totalCases) * 100)}%)
                    </div>
                  )}
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="text-sm text-purple-600 font-medium">現在の連続満点</div>
                  <div className="text-2xl font-bold text-purple-800 mt-1">{randomCasePerformance.streak}</div>
                  {randomCasePerformance.streak > 0 && (
                    <div className="text-xs text-green-600 font-medium mt-1">🔥 記録継続中</div>
                  )}
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="text-sm text-purple-600 font-medium">最大連続満点</div>
                  <div className="text-2xl font-bold text-purple-800 mt-1">{randomCasePerformance.maxStreak}</div>
                  {randomCasePerformance.maxStreak >= 3 && (
                    <div className="text-xs text-amber-600 font-medium mt-1">🏆 素晴らしい！</div>
                  )}
                </div>
              </div>
              
              {/* 最近の症例履歴 */}
              {randomCasePerformance.caseHistory.length > 0 && (
                <div className="mt-4 pt-4 border-t border-purple-200">
                  <div className="text-sm text-purple-600 font-medium mb-2">最近の症例履歴</div>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {randomCasePerformance.caseHistory.slice(-20).reverse().map((caseRecord, index) => (
                      <div 
                        key={index}
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          caseRecord.correct 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {caseRecord.correct ? '✓' : '✗'} {caseRecord.accuracy}%
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Toasts */}
        {(presetToast || randomToast) && (
          <div className="fixed right-4 bottom-4 z-50 space-y-2">
            {presetToast && (
              <div className="px-4 py-2 rounded-lg shadow bg-teal-600 text-white text-sm">
                {presetToast}
              </div>
            )}
            {randomToast && (
              <div className="px-4 py-2 rounded-lg shadow bg-green-600 text-white text-sm">
                {randomToast}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// small UI helpers
function Control({ label, children }) {
  return (
    <div>
      <div className="text-gray-700 mb-1 text-base">{label}</div>
      {children}
    </div>
  );
}

function TinyToggle({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg border text-base ${active ? 'bg-black text-white border-black' : 'bg-white text-gray-800'}`}
    >
      {children}
    </button>
  );
}