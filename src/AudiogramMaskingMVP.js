import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { supabase } from './supabaseClient';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Scatter, Line } from "recharts";

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
  mk('R','BC', [[125,10],[250,15],[500,30],[1000,50],[2000,70],[4000,90],[8000,100]]),
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
    findings: '鼓膜所見正常、ティンパノA型、DPOAEは両耳PASSである'
  },
  B: {
    age: '45歳',
    gender: '男性',
    chiefComplaint: '右耳難聴、耳鳴、めまい感',
    history: '昨日から突然右耳の耳閉塞感と耳鳴、回転性めまい感あり。今日になってめまい感はだいぶ治ったが、聞こえの悪さは変わらないため受診した',
    findings: '鼓膜所見正常、ティンパノA型、DPOAE左耳PASS、右耳REFER'
  },
  C: {
    age: '7歳',
    gender: '女性',
    chiefComplaint: '左耳の聞こえの悪さ',
    history: '入学時の学校検診で左耳難聴を指摘され、精査のため受診した',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAE 右耳PASS 左耳REFER'
  },
  D: {
    age: '32歳',
    gender: '男性',
    chiefComplaint: '耳閉塞感、耳鳴り、めまい',
    history: '20歳の時、右耳突発性難聴。1週間前から回転性めまいあり。良くなったり悪くなったり。左耳ゴーという耳鳴りが気になる',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAE（高周波数域） 右耳REFER 左耳PASS'
  },
  E: {
    age: '55歳',
    gender: '女性',
    chiefComplaint: '聞こえの悪さ（特に左耳）',
    history: '徐々に聞こえ悪くなった。最近、電話を左で取ると聞こえづらいのがわかった。今は右耳で電話をとっている。いつから聞こえ悪いのかよくわからない',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAE（高周波数域）両耳REFER'
  },
  F: {
    age: '70歳',
    gender: '女性',
    chiefComplaint: 'TVの音が聞こえにくい',
    history: 'ご主人から聞こえの悪さを指摘される。TVの音が大きいと言われる。そう言われたらそうかなと。ご主人が補聴器を勧めてきたので、仕方なく受診した',
    findings: '鼓膜所見正常、ティンパノ両耳A型、DPOAE（高周波数域）両耳REFER'
  },
  G: {
    age: '12歳',
    gender: '女性',
    chiefComplaint: '鼻水が出る。聞こえの悪さ',
    history: '小さい頃から滲出性中耳炎を繰り返す',
    findings: '鼓膜所見：色が悪い・陥没あり、ティンパノB型'
  },
  H: {
    age: '68歳',
    gender: '男性',
    chiefComplaint: '耳痛、聞こえの悪さ、耳閉塞感',
    history: '2日前より耳痛と耳閉塞感あり',
    findings: '鼓膜所見炎症（＋）、ティンパノ陽圧側にPeak'
  }
};

function buildTargetsFromPreset(preset){
  return preset.targets.map(t => ({...t}));
}

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

  // Generate random audiogram case
  const generateRandomCase = () => {
    const frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
    const ears = ['R', 'L'];
    const transducers = ['AC', 'BC'];
    
    // ランダムな症例パターンを生成
    const caseType = Math.random();
    let generatedTargets = [];
    
             if (caseType < 0.3) {
               // 正常聴力パターン（25%の確率）
               ears.forEach(ear => {
                 let acValues = {};
                 // まずAC値を生成
                 frequencies.forEach(freq => {
                   let dB;
                   if (freq <= 2000) {
                     // 125, 250, 500, 2000Hz：5-15dB（下限5dB）
                     dB = Math.round((Math.random() * 10 + 5) / 5) * 5;
                     dB = Math.max(5, dB);
                   } else {
                     // 4000, 8000Hz：-5dB〜15dB
                     dB = Math.round((Math.random() * 20 - 5) / 5) * 5;
                     dB = Math.max(-5, Math.min(15, dB));
                   }
                   acValues[freq] = Math.round(dB / 5) * 5;
                   generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq] });
                 });
                 
                // 次にBC値を生成（正常：AC±5dBの範囲内、下限0dB）
                frequencies.forEach(freq => {
                   const acValue = acValues[freq];
                   // 正常ではGAPは±5dB以内
                   const minBC = Math.max(0, acValue - 5); // AC-5dBまで（下限0dB）
                   const maxBC = acValue + 5; // AC+5dBまで
                   
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
             } else if (caseType < 0.6) {
               // 感音性難聴パターン（30%の確率）
               ears.forEach(ear => {
                 const baseLoss = Math.round((Math.random() * 30 + 20) / 5) * 5; // 20-50dB
                 const highFreqSlope = Math.round((Math.random() * 20 + 10) / 5) * 5; // 10-30dBの高音域損失
                 
                 let acValues = {};
                 // まずAC値を生成
                 frequencies.forEach(freq => {
                   let dB = baseLoss;
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
                     dB = Math.max(5, Math.min(80, dB));
                   } else {
                     // 4000, 8000Hz：下限-5dB
                     dB = Math.max(-5, Math.min(80, dB));
                   }
                   
                   acValues[freq] = Math.round(dB / 5) * 5;
                   generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq] });
                 });
                 
                // 次にBC値を生成（感音性難聴：AC±5dBの範囲内、下限0dB）
                frequencies.forEach(freq => {
                   const acValue = acValues[freq];
                   // 感音性難聴ではGAPは±5dB以内
                   const minBC = Math.max(0, acValue - 5); // AC-5dBまで（下限0dB）
                   const maxBC = acValue + 5; // AC+5dBまで
                   
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
               ears.forEach(ear => {
                 const airBoneGap = Math.round((Math.random() * 30 + 20) / 5) * 5; // 20-50dBの気導骨導差
                 
                 let acValues = {};
                 // まずAC値を生成
                 frequencies.forEach(freq => {
                   const dB = Math.round((Math.random() * 35 + 15) / 5) * 5; // 15-50dB
                   acValues[freq] = Math.round(Math.max(5, Math.min(60, dB)) / 5) * 5;
                   generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq] });
                 });
                 
                // 次にBC値を生成（AC値-30dB〜AC値+5dBの範囲内、下限0dB）
                frequencies.forEach(freq => {
                   const acValue = acValues[freq];
                   // GAPが30dBを超えないように制約
                   const minBC = Math.max(0, acValue - 30); // 下限0dB
                   const maxBC = acValue + 5; // AC値+5dBまで
                   // BC値の範囲を5dB刻みで生成（GAP最大30dB、BC値上限AC値+5dB）
                   // minBCとmaxBCを5dB刻みに丸める
                   const minBCRounded = Math.ceil(minBC / 5) * 5;
                   const maxBCRounded = Math.floor(maxBC / 5) * 5;
                   // 5dB刻みの候補数を計算
                   const steps = (maxBCRounded - minBCRounded) / 5;
                   // ランダムに選択
                   const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
                   generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue });
                 });
               });
             } else {
               // 混合性難聴パターン（15%の確率）
               ears.forEach(ear => {
                 const conductiveComponent = Math.round((Math.random() * 25 + 10) / 5) * 5; // 10-35dBの伝音成分
                 const sensorineuralComponent = Math.round((Math.random() * 25 + 15) / 5) * 5; // 15-40dBの感音成分
                 
                 let acValues = {};
                 // まずAC値を生成
                 frequencies.forEach(freq => {
                   const dB = conductiveComponent + sensorineuralComponent;
                   acValues[freq] = Math.round(Math.max(5, Math.min(80, dB)) / 5) * 5;
                   generatedTargets.push({ ear, transducer: 'AC', masked: false, freq, dB: acValues[freq] });
                 });
                 
                // 次にBC値を生成（AC値-30dB〜AC値+5dBの範囲内、下限0dB）
                frequencies.forEach(freq => {
                   const acValue = acValues[freq];
                   // GAPが30dBを超えないように制約
                   const minBC = Math.max(0, acValue - 30); // 下限0dB
                   const maxBC = acValue + 5; // AC値+5dBまで
                   // BC値の範囲を5dB刻みで生成（GAP最大30dB、BC値上限AC値+5dB）
                   // minBCとmaxBCを5dB刻みに丸める
                   const minBCRounded = Math.ceil(minBC / 5) * 5;
                   const maxBCRounded = Math.floor(maxBC / 5) * 5;
                   // 5dB刻みの候補数を計算
                   const steps = (maxBCRounded - minBCRounded) / 5;
                   // ランダムに選択
                   const bcValue = minBCRounded + Math.floor(Math.random() * (steps + 1)) * 5;
                   generatedTargets.push({ ear, transducer: 'BC', masked: true, freq, dB: bcValue });
                 });
               });
             }
    
    // BC値の制約ルール: 
    // 正常・感音性難聴：AC±5dB（下限0dB）
    // 伝音性・混合性難聴：AC-30dB〜AC+5dB（下限0dB）
    // プリセットと同じ形式で処理するため、後処理は行わない
    const adjustedTargets = generatedTargets;
    
    // 生成された症例を適用（プリセットと同じ形式で処理）
    setPoints([]);
    setTargets(adjustedTargets.map(t => ({...t})));
    setSelectedPreset('Custom');
    
    // 初期設定に戻す
    setEar('R');
    setTrans('AC');
    setLevel(0);
    setMaskLevel(-15);
    setFreq(1000);
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
            addOrReplacePoint({ ear, transducer: trans, masked, freq, dB: round5(newLevel) });
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
            addOrReplacePoint({ ear, transducer: trans, masked, freq, dB: round5(newLevel) });
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
  function addOrReplacePoint(p) {
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
    // 確定操作後はフラッシュを一時停止
    setCursorBlinkEnabled(false);
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
    addOrReplacePoint(p);
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
              </div>
            </div>
          </div>
        )}

        {/* Preset loader (secret) */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">症例プリセット</span>
            <select className="border rounded-xl px-2 py-1 text-sm" value={selectedPreset} onChange={(e)=> setSelectedPreset(e.target.value)}>
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
                
                // 症例情報を表示
                const caseDetails = PRESET_DETAILS[selectedPreset];
                if (caseDetails) {
                  setCurrentCaseInfo({ caseId: selectedPreset, ...caseDetails });
                  setShowCaseInfoModal(true);
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
          </div>
        </div>

        {/* Auto Case Generator */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">自動症例作成</span>
            <button 
              className={`px-3 py-2 rounded-xl text-white text-sm flex items-center gap-2 transition-colors ${
                isLoadingRandom ? 'bg-green-400 opacity-70 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
              onClick={async ()=>{
                if (isLoadingRandom) return;
                setIsLoadingRandom(true);
                setRandomToast('ランダム症例を生成中…');
                await new Promise(r=>setTimeout(r, 350));
                generateRandomCase();
                setRandomToast('ランダム症例をロードしました');
                setTimeout(() => setRandomToast(''), 1500);
                setTimeout(() => setIsLoadingRandom(false), 450);
              }}
              disabled={isLoadingRandom}
            >
              {isLoadingRandom ? (
                <>
                  <div className="animate-spin h-4 w-4 rounded-full border-2 border-white border-t-transparent"></div>
                  ロード中...
                </>
              ) : (
                'ランダム症例生成'
              )}
            </button>
            <span className="text-xs text-gray-400">※ ランダムに症例パターンを生成（正常・感音性・伝音性・混合性難聴）</span>
          </div>
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
                  onClick={() => addOrReplacePoint({ ear, transducer: trans, masked, freq, dB: round5(level) })} 
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
              <div className="flex items-center gap-2 min-w-[180px]">
                <input type="range" min={-15} max={110} step={5} value={maskLevel} onChange={e => setMaskLevel(parseInt(e.target.value))} className="w-40" />
                <div className="w-16 text-right text-xs font-mono">{maskLevel} dB</div>
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
                {overMaskingWarning ? 'オーバーマスキング: ON' : 'オーバーマスキング: OFF'}
              </button>
              <button onClick={() => setCrossHearingWarning(w => !w)} className={`px-2 py-1 rounded-lg border text-xs ${crossHearingWarning ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-800'}`} title="クロスヒアリング警告のON/OFF">
                {crossHearingWarning ? 'クロスヒアリング: ON' : 'クロスヒアリング: OFF'}
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
                    <Scatter key={`ans-${s.key}`} name={`${s.label} (answer)`} data={answerSeriesData[s.key] || []} fill="#10b981" shape={(props) => (<g style={{ opacity: blinkOn ? 1 : 0 }}>{shapeRenderer(s.shape, '#10b981')(props)}</g>)} isAnimationActive={false} />
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
