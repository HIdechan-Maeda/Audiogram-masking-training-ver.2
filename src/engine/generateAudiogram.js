// 臨床症例生成エンジン（再現性のためseed対応）

// 周波数・年齢・性別・上限/下限・NR規則はデモと同一
const FREQS = ["0.125kHz", "0.25kHz", "0.5kHz", "1kHz", "2kHz", "4kHz", "8kHz"];
const AGE_GROUPS = ["20s", "30s", "40s", "50s", "60s", "70s"];
const SEXES = ["Male", "Female"];
const PROFILES = ["Normal", "SNHL_Age", "SNHL_NoiseNotch", "SNHL_Meniere", "SNHL_Sudden", "SNHL_Mumps", "CHL_OME", "CHL_AOM", "CHL_Otosclerosis", "CHL_OssicularDiscontinuity"];
const PROFILE_WEIGHTS = {
  Normal: 2,
  SNHL_Age: 2,
  SNHL_NoiseNotch: 2,
  SNHL_Meniere: 2,
  SNHL_Sudden: 2,
  SNHL_Mumps: 2,
  CHL_OME: 3,
  CHL_AOM: 3,
  CHL_Otosclerosis: 1,
  CHL_OssicularDiscontinuity: 12,
};

const FREQ_NUM = { "0.125kHz": 0.125, "0.25kHz": 0.25, "0.5kHz": 0.5, "1kHz": 1, "2kHz": 2, "4kHz": 4, "8kHz": 8 };
const LIMITS_AC = {
  "0.125kHz": { min: 5, max: 70 },
  "0.25kHz":  { min: 5, max: 90 },
  "0.5kHz":   { min: 5, max: 110 },
  "1kHz":     { min: 0, max: 110 },
  "2kHz":     { min: 0, max: 110 },
  "4kHz":     { min: -5, max: 110 },
  "8kHz":     { min: -5, max: 100 },
};
const LIMITS_BC = {
  "0.25kHz":  { min: 5, max: 60 },
  "0.5kHz":   { min: 5, max: 65 },
  "1kHz":     { min: 0, max: 70 },
  "2kHz":     { min: 0, max: 70 },
  "4kHz":     { min: -5, max: 65 },
};
const BC_FREQS = new Set(["0.25kHz","0.5kHz","1kHz","2kHz","4kHz"]);
const isBCFreq = (f) => BC_FREQS.has(f);
const TH_SNHL_BC_NR = { "0.25kHz": 55, "0.5kHz": 65, "1kHz": 70, "2kHz": 70, "4kHz": 60 };

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const roundTo5 = (x) => Math.round(x / 5) * 5;

import ISO_DATA from "../data/iso7029_age_hearing_thresholds_2sd.json";
const ISO7029 = ISO_DATA;

function normalizeAgeGroupForISO(sex, age) {
  // ステップ1: 10歳以下や日本語の年齢グループをISO形式に変換
  if (age === "10歳以下" || age === "10s" || (typeof age === 'string' && age.includes('10歳以下'))) {
    return "20s"; // 10歳以下は20代のISOデータを使用
  }
  
  // 日本語の年齢グループをISO形式に変換
  if (typeof age === 'string') {
    const ageMap = {
      "10代": "20s",  // 10代も20代のISOデータを使用
      "20代": "20s",
      "30代": "30s",
      "40代": "40s",
      "50代": "50s",
      "60代": "60s",
      "70代": "70s"
    };
    if (ageMap[age]) {
      age = ageMap[age];
    }
  }
  
  // ステップ2: ISO7029データに存在するか確認
  if (ISO7029[sex] && ISO7029[sex][age]) {
    return age;
  }
  
  // ステップ3: フォールバック処理（30s→20s, 40s→50s）
  const fallbackMap = { "30s": "20s", "40s": "50s" };
  const fallbackAge = fallbackMap[age] || age;
  if (ISO7029[sex] && ISO7029[sex][fallbackAge]) {
    return fallbackAge;
  }
  
  // ステップ4: 最後の保険: 利用可能な最初の年代（デフォルトは20代）
  const available = ISO7029[sex] ? Object.keys(ISO7029[sex]) : [];
  return available.length ? available[0] : "20s";
}

const getBand = (sex, age, f) => {
  const a = normalizeAgeGroupForISO(sex, age);
  const key = f === "0.125kHz" ? "0.25kHz" : f;
  return ISO7029[sex][a][key];
};

// Seeded RNG（LCG）
function makeRng(seed) {
  let s = (seed >>> 0) || 123456789;
  return function rand() {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function randNormal(rand, mean, sd) {
  // Box-Muller
  const u = Math.max(1e-12, rand());
  const v = Math.max(1e-12, rand());
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + sd * z;
}

// 右耳ベース生成（ISO7029データから性別・年齢グループに基づいて生成 + 5dB丸め + 上下限）
// この関数は性別と年齢グループからISO7029データを参照してオージオグラムのベースを生成する
function generateEarBase(rand, sex, age) {
  return FREQS.map((f, idx) => {
    const b = getBand(sex, age, f); // ISO7029データから性別・年齢グループに基づく閾値を取得
    const sdApprox = (b.plus2SD - b.median) / 2;
    const noisy = randNormal(rand, b.median, sdApprox * 0.5) * (0.9 + 0.2 * rand());
    const clipped = Math.max(b.minus2SD, Math.min(b.plus2SD, noisy));
    const bounded = clamp(clipped, LIMITS_AC[f].min, LIMITS_AC[f].max);
    const ac = roundTo5(bounded);
    let bc = null;
    if (isBCFreq(f)) {
      // 正常耳の骨導はほぼ中央値付近
      const lim = LIMITS_BC[f];
      const bcRaw = b.median + (rand() - 0.5) * 12.0; // ±6dB程度の揺らぎ
      bc = roundTo5(clamp(bcRaw, lim.min, lim.max));
    }
    return { freq: f, median: b.median, minus2SD: b.minus2SD, plus2SD: b.plus2SD, ac, bc, soAC: false, soBC: false };
  });
}

// SNHLのBC NR規則適用（ACしきい超え → BCは周波数別THでNR表示）
function applySnhlBcNr(rows) {
  return rows.map(r => {
    if (isBCFreq(r.freq) && typeof r.ac === 'number') {
      const th = TH_SNHL_BC_NR[r.freq];
      if (typeof th === 'number' && r.ac > th) {
        return { ...r, bc: roundTo5(th), soBC: true };
      }
    }
    return r;
  });
}

function pinSoBcRow(r) {
  if (!Boolean(r.soBC) || !isBCFreq(r.freq)) return r;
  const th = TH_SNHL_BC_NR[r.freq];
  if (typeof th !== 'number') return r;
  return { ...r, bc: roundTo5(th), soBC: true };
}

function finalizeSoBc(rows) {
  return rows.map(pinSoBcRow);
}

// 片耳病型で非病側をNormal化
function makeContralateralNormal(rand, sex, age) {
  const base = generateEarBase(rand, sex, age);
  // 正常耳は軽い揺らぎのみ
  return base.map(r => ({ ...r }));
}

// 左右相関をつけて左耳を生成（ρ≈0.7）
function correlateLeft(rand, rightRows, sex, age) {
  const rho = 0.55;
  return rightRows.map((rr, i) => {
    const b = getBand(sex, age, rr.freq);
    const sd = (b.plus2SD - b.median) / 2;
    const eps = randNormal(rand, 0, sd * 0.3);
    const target = b.median + rho * (rr.ac - b.median) + eps;
    const ac = roundTo5(clamp(target, LIMITS_AC[rr.freq].min, LIMITS_AC[rr.freq].max));
    let bc = rr.bc;
    if (isBCFreq(rr.freq) && typeof bc === 'number') {
      const lim = LIMITS_BC[rr.freq];
      const bcRaw = b.median + rho * (bc - b.median) + (rand() - 0.5) * 12.0;
      bc = roundTo5(clamp(bcRaw, lim.min, lim.max));
    }
    return { ...rr, ac, bc, soAC: false, soBC: false };
  });
}

// プロファイル変換の簡略版（まずは Normal と同時生成/片耳病型の枠を実装）
/** 耳硬化 Carhart様の発現確率（severity≥1のとき）。臨床でも全例に明瞭でないことを踏まえた教育用仕様。 */
export const CARHART_EXPRESSION_PROB = 0.8;
/** AOM: 程度≥1で混合型（高音骨導上昇）を付与する教育用比率。臨床発生率ではない */
export const AOM_MIXED_PROB = 0.5;
/** 検証・仕様上の Carhart様定義: BC2k − mean(BC1k, BC4k) ≥ 5 dB かつ BC2k が隣接両側より悪い */
export const CARHART_MIN_DEPTH_DB = 5;
/**
 * C5-dip（騒音）の最小深さ（教育用・著者設定）。
 * Colesらを参考に 4 kHz を中心とし、2 kHz・8 kHz よりそれぞれ ≥10 dB 高くする。
 * Coles基準そのものの移植ではない。
 */
export const NOISE_NOTCH_MIN_DEPTH_DB = 10;
/** 突発性難聴: 程度≥1で病側−対側 mean AC(0.5/1/2 kHz) の最小差（教育用。軽度も30 dB床） */
export const SUDDEN_MIN_LATERALITY_DB = 30;
/** ムンプス難聴: 程度≥1で病側 mean AC(0.5/1/2) の下限（高度〜聾寄りの教育用床） */
export const MUMPS_MIN_MEAN_AC_DB = 70;
/** ムンプス難聴: 程度≥1の最小一側差 */
export const MUMPS_MIN_LATERALITY_DB = 55;

/**
 * 突発性難聴のスケールアウト（教育用・ムンプスと役割分担）
 * - ムンプス: 約50%で患側の全周波数 SO（高度一側を明示）
 * - 突発: 程度2で高音SO、程度3で高音SOまたはまれに全周SO（測定可能な帯域を残しつつNRも提示）
 */
export const SUDDEN_SO_FULL_PROB = 0.12; // severity≥3
export const SUDDEN_SO_HF_PROB_SEV2 = 0.20;
export const SUDDEN_SO_HF_PROB_SEV3 = 0.35; // full の残り確率帯（roll が FULL〜FULL+HF）

function forceScaleOutRow(r, { withBc = true } = {}) {
  const acMax = LIMITS_AC[r.freq].max;
  let bc = r.bc;
  let soBC = Boolean(r.soBC);
  if (withBc && isBCFreq(r.freq)) {
    const th = TH_SNHL_BC_NR[r.freq];
    if (typeof th === 'number') {
      bc = roundTo5(th);
      soBC = true;
    }
  }
  return { ...r, ac: roundTo5(acMax), soAC: true, bc, soBC };
}

/** @returns {{ mode: 'none'|'hf'|'full', include2k: boolean }} */
function decideSuddenSoMode(rand, severity) {
  // 程度によらず2回消費し、同一seedで程度だけ変えたときのRNG位相を揃える
  const roll = rand();
  const roll2 = rand();
  let mode = 'none';
  const sev = Math.min(3, Math.max(0, Math.round(severity || 0)));
  if (sev >= 3 && roll < SUDDEN_SO_FULL_PROB) {
    mode = 'full';
  } else if (sev >= 2) {
    const hfCut = sev >= 3
      ? SUDDEN_SO_FULL_PROB + SUDDEN_SO_HF_PROB_SEV3
      : SUDDEN_SO_HF_PROB_SEV2;
    if (roll < hfCut) mode = 'hf';
  }
  const include2k = mode === 'hf' && sev >= 3 && roll2 < 0.5;
  return { mode, include2k };
}

function applySuddenScaleOut(rows, mode, include2k) {
  if (!mode || mode === 'none') return rows;
  if (mode === 'full') {
    return rows.map((r) => forceScaleOutRow(r, { withBc: true }));
  }
  // hf: 8 kHz・4 kHz を SO。程度3では半数で 2 kHz も SO。
  return rows.map((r) => {
    if (r.freq === '8kHz') return forceScaleOutRow(r, { withBc: false });
    if (r.freq === '4kHz') return forceScaleOutRow(r, { withBc: true });
    if (r.freq === '2kHz' && include2k) return forceScaleOutRow(r, { withBc: true });
    return r;
  });
}

/** C5-dip: AC(4 kHz) ≥ AC(2 kHz)+10 かつ AC(4 kHz) ≥ AC(8 kHz)+10（教育用・著者設定） */
function enforceNoiseNotchGeometry(rows) {
  const by = Object.fromEntries(rows.map((r) => [r.freq, r]));
  const r2 = by['2kHz'];
  const r4 = by['4kHz'];
  const r8 = by['8kHz'];
  if (!r2 || !r4 || typeof r2.ac !== 'number' || typeof r4.ac !== 'number') return rows;

  const need = NOISE_NOTCH_MIN_DEPTH_DB;
  const lim4 = LIMITS_AC['4kHz'];
  let ac4 = r4.ac;
  let ac8 = typeof r8?.ac === 'number' ? r8.ac : null;

  // 4 kHz ≥ 2 kHz + need
  if (!(ac4 >= r2.ac + need - 1e-9)) {
    ac4 = roundTo5(clamp(r2.ac + need, lim4.min, lim4.max));
  }

  // 4 kHz ≥ 8 kHz + need（回復）。まず 4 kHz を上げ、なお不足なら 8 kHz を下げる
  if (ac8 != null && !(ac4 >= ac8 + need - 1e-9)) {
    ac4 = Math.max(ac4, roundTo5(clamp(ac8 + need, lim4.min, lim4.max)));
    if (!(ac4 >= ac8 + need - 1e-9)) {
      const lim8 = LIMITS_AC['8kHz'];
      ac8 = roundTo5(clamp(ac4 - need, lim8.min, lim8.max));
    }
    if (!(ac4 >= ac8 + need - 1e-9)) {
      ac4 = lim4.max;
      const lim8 = LIMITS_AC['8kHz'];
      ac8 = roundTo5(clamp(ac4 - need, lim8.min, lim8.max));
    }
  }

  return rows.map((r) => {
    if (r.freq === '4kHz') {
      let bc = r.bc;
      if (typeof bc === 'number') {
        const limB = LIMITS_BC['4kHz'];
        bc = roundTo5(clamp(Math.min(bc, ac4 + 5), limB.min, limB.max));
      }
      return { ...r, ac: ac4, bc };
    }
    if (r.freq === '8kHz' && ac8 != null && typeof r.ac === 'number') {
      return { ...r, ac: ac8 };
    }
    return r;
  });
}

function meanAcAt(rows, freqs) {
  const vals = freqs
    .map((f) => rows.find((r) => r.freq === f)?.ac)
    .filter((v) => Number.isFinite(v));
  if (vals.length !== freqs.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** 病側の指定周波数平均気導を下限まで底上げ（一側性感音の教育用床） */
function enforceMinMeanAc(rows, minMean, freqs = ['0.5kHz', '1kHz', '2kHz']) {
  let out = rows;
  for (let guard = 0; guard < 8; guard++) {
    const m = meanAcAt(out, freqs);
    if (m == null || m >= minMean - 1e-9) return out;
    const bump = Math.max(5, Math.ceil((minMean - m) / 5) * 5);
    out = out.map((r) => {
      if (!freqs.includes(r.freq) || !Number.isFinite(r.ac)) return r;
      const lim = LIMITS_AC[r.freq];
      const ac = roundTo5(clamp(r.ac + bump, lim.min, lim.max));
      let bc = r.bc;
      if (typeof bc === 'number' && isBCFreq(r.freq)) {
        const limB = LIMITS_BC[r.freq];
        bc = roundTo5(clamp(Math.min(bc, ac + 5), limB.min, limB.max));
      }
      return { ...r, ac, bc };
    });
  }
  return out;
}

/** 病側−対側の mean AC 差を下限まで確保（5 dB丸めによる不足を反復で吸収） */
function enforceMinLaterality(diseased, contra, minDiff, freqs = ['0.5kHz', '1kHz', '2kHz']) {
  let out = diseased;
  for (let guard = 0; guard < 8; guard++) {
    const d = meanAcAt(out, freqs);
    const n = meanAcAt(contra, freqs);
    if (d == null || n == null || d - n >= minDiff - 1e-9) return out;
    out = enforceMinMeanAc(out, n + minDiff, freqs);
  }
  return out;
}

/** AOM混合型: 4 kHz骨導が0.5 kHz骨導より悪く、気導は骨導を下回らない */
function enforceAomMixedGeometry(rows) {
  const by = Object.fromEntries(rows.map((r) => [r.freq, r]));
  const r05 = by['0.5kHz'];
  const r2 = by['2kHz'];
  const r4 = by['4kHz'];
  if (!r05 || !r2 || !r4) return rows;
  if (![r05.bc, r2.bc, r4.bc].every((v) => typeof v === 'number')) return rows;

  let bc05 = r05.bc;
  let bc2 = r2.bc;
  let bc4 = r4.bc;
  const lim2 = LIMITS_BC['2kHz'];
  const lim4 = LIMITS_BC['4kHz'];
  if (!(bc4 > bc05)) {
    bc4 = roundTo5(clamp(Math.max(bc4, bc05 + 10), lim4.min, lim4.max));
  }
  if (!(bc2 >= bc05)) {
    bc2 = roundTo5(clamp(Math.max(bc2, bc05 + 5), lim2.min, lim2.max));
  }

  return rows.map((r) => {
    let ac = r.ac;
    let bc = r.bc;
    if (r.freq === '2kHz') bc = bc2;
    if (r.freq === '4kHz') bc = bc4;
    if (typeof ac === 'number' && typeof bc === 'number' && bc > ac) {
      const limA = LIMITS_AC[r.freq];
      ac = roundTo5(clamp(bc, limA.min, limA.max));
    }
    return { ...r, ac, bc };
  });
}

function enforceCarhartNotchGeometry(rows) {
  const by = Object.fromEntries(rows.map((r) => [r.freq, r]));
  const r1 = by['1kHz'];
  const r2 = by['2kHz'];
  const r4 = by['4kHz'];
  if (!r1 || !r2 || !r4) return rows;
  if (typeof r1.bc !== 'number' || typeof r2.bc !== 'number' || typeof r4.bc !== 'number') return rows;

  const lim2 = LIMITS_BC['2kHz'];
  const limAc2 = LIMITS_AC['2kHz'];
  // 隣接より悪い + mean より ≥5 dB
  let desiredBc = Math.max(r1.bc, r4.bc) + CARHART_MIN_DEPTH_DB;
  const meanAdj = (r1.bc + r4.bc) / 2;
  desiredBc = Math.max(desiredBc, meanAdj + CARHART_MIN_DEPTH_DB);
  desiredBc = Math.ceil(desiredBc / 5) * 5;
  while (desiredBc <= r1.bc || desiredBc <= r4.bc) desiredBc += 5;

  // 2 kHz 最小ABG=5 を満たすよう AC を先に確保し、その上で BC を置く
  const minAbg2 = 5;
  let ac2 = typeof r2.ac === 'number' ? r2.ac : limAc2.min;
  ac2 = roundTo5(clamp(Math.max(ac2, desiredBc + minAbg2), limAc2.min, limAc2.max));
  const bc2 = roundTo5(clamp(Math.min(desiredBc, ac2 + 5), lim2.min, lim2.max));

  // もし AC 上限で BC が足りない場合は隣接 BC を下げて幾何を確保（教育用拘束）
  let bc1 = r1.bc;
  let bc4 = r4.bc;
  if (!(bc2 > bc1 && bc2 > bc4 && bc2 - (bc1 + bc4) / 2 >= CARHART_MIN_DEPTH_DB - 1e-9)) {
    const lim1 = LIMITS_BC['1kHz'];
    const lim4 = LIMITS_BC['4kHz'];
    bc1 = roundTo5(clamp(Math.min(bc1, bc2 - CARHART_MIN_DEPTH_DB), lim1.min, lim1.max));
    bc4 = roundTo5(clamp(Math.min(bc4, bc2 - CARHART_MIN_DEPTH_DB), lim4.min, lim4.max));
  }

  return rows.map((r) => {
    if (r.freq === '2kHz') return { ...r, ac: ac2, bc: bc2 };
    if (r.freq === '1kHz' && typeof r.bc === 'number') return { ...r, bc: bc1 };
    if (r.freq === '4kHz' && typeof r.bc === 'number') return { ...r, bc: bc4 };
    return r;
  });
}

function applyProfileTransform(rand, rows, profile, severity, seed, sexForBands, ageForBands, options = {}) {
  const { carhartApplied = false, aomMixedApplied = false } = options;
  // まずは現状：ACにseverity応じたバイアスを加える軽量版
  const out = rows.map((r, idx, arr) => {
    let add = 0;
    if (profile === 'SNHL_Age') {
      const fk = FREQ_NUM[r.freq];
      const baseAlpha = [0, 3, 6, 9][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const octHF = Math.max(0, Math.log2(fk / 1));
      const octLF = fk < 1 ? Math.log2(1 / fk) : 0;
      const kLF = 0.25 + 0.1 * Math.min(3, Math.max(0, Math.round(severity||0)));
      add = baseAlpha * octHF + (baseAlpha * kLF) * octLF;
      if (fk === 1) add *= 0.1;
    } else if (profile === 'SNHL_NoiseNotch') {
      const depth = [0, 14, 24, 32][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const w = (r.freq === '4kHz') ? 1.1 : (r.freq === '2kHz' || r.freq === '8kHz') ? 0.3 : 0;
      add = w * depth;
    } else if (profile === 'SNHL_Meniere') {
      const depth = [0, 10, 20, 35][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const w = { "0.125kHz": 1.0, "0.25kHz": 1.0, "0.5kHz": 0.8, "1kHz": 0.4, "2kHz": 0.2, "4kHz": 0.1, "8kHz": 0.05 }[r.freq] || 0;
      add = w * depth;
    } else if (profile === 'SNHL_Sudden') {
      // 軽度も一側差≥30 dB床を後段で保証するため、加算をやや大きめに
      const depth = [0, 35, 45, 65][Math.min(3, Math.max(0, Math.round(severity||0)))];
      add = depth * (0.7 + 0.3 * rand());
    } else if (profile === 'SNHL_Mumps') {
      // 軽度は実質使わず高度寄りの床（後段で mean AC≥70・一側差≥55 も拘束）
      const depth = [0, 70, 85, 95][Math.min(3, Math.max(0, Math.round(severity||0)))];
      add = depth;
    } else if (profile === 'CHL_OME') {
      // OME: 0.5–1k 中心のABG、HFは控えめ（UIデモ準拠）
      const depth = [0, 12, 20, 28][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const w = { "0.125kHz": 0.6, "0.25kHz": 0.9, "0.5kHz": 1.0, "1kHz": 0.9, "2kHz": 0.5, "4kHz": 0.3, "8kHz": 0.2 }[r.freq] || 0;
      add = w * depth;
    } else if (profile === 'CHL_AOM') {
      // 伝音成分は低〜中音中心。OMEより大きいABGは医学的一般則としない（床はOMEと重複）
      const depth = [0, 12, 22, 30][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const w = { "0.125kHz": 0.7, "0.25kHz": 1.0, "0.5kHz": 1.0, "1kHz": 0.8, "2kHz": 0.4, "4kHz": 0.2, "8kHz": 0.1 }[r.freq] || 0;
      add = w * depth;
    } else if (profile === 'CHL_Otosclerosis') {
      const depth = [0, 12, 22, 30][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const w = { "0.125kHz": 0.5, "0.25kHz": 0.9, "0.5kHz": 1.0, "1kHz": 0.8, "2kHz": 0.4, "4kHz": 0.2, "8kHz": 0.1 }[r.freq] || 0;
      add = w * depth;
    } else if (profile === 'CHL_OssicularDiscontinuity') {
      // 耳小骨連鎖離断パターン（完全離断の臨床最大ABGを必ずしも再現しない教育用）
      const depth = [0, 35, 42, 48][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const w = { "0.125kHz": 0.8, "0.25kHz": 1.0, "0.5kHz": 1.0, "1kHz": 0.9, "2kHz": 0.9, "4kHz": 0.7, "8kHz": 0.5 }[r.freq] || 0;
      add = w * depth;
    }
    const ac = roundTo5(clamp((r.ac ?? 0) + add, LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max));
    let bc = r.bc;
    if (profile === 'CHL_OME' || profile === 'CHL_AOM' || profile === 'CHL_Otosclerosis' || profile === 'CHL_OssicularDiscontinuity') {
      // BCはほぼ正常帯域へ（年齢相応中央値±小揺らぎ）
      if (isBCFreq(r.freq)) {
        const lim = LIMITS_BC[r.freq];
        const band = getBand(sexForBands, ageForBands, r.freq);
        let bcRaw = (band.median ?? 0) + (rand() - 0.5) * 12.0; // ±6dB程度
        // 耳硬化症: Carhart様（発現が選ばれた場合のみ。2k中心、幾何拘束は後段で保証）
        if (profile === 'CHL_Otosclerosis' && carhartApplied) {
          const wBC = { "1kHz": 0.3, "2kHz": 1.0, "4kHz": 0.2 }[r.freq] || 0;
          const carhart = [0, 6, 10, 15][Math.min(3, Math.max(0, Math.round(severity||0)))];
          bcRaw += wBC * carhart;
        }
        // AOM混合型: 2–4 kHz中心の骨導上昇（教育用。臨床発生率の再現ではない）
        if (profile === 'CHL_AOM' && aomMixedApplied) {
          const wBC = { "1kHz": 0.2, "2kHz": 0.7, "4kHz": 1.0 }[r.freq] || 0;
          const mix = [0, 10, 15, 22][Math.min(3, Math.max(0, Math.round(severity||0)))];
          bcRaw += wBC * mix;
        }
        bc = roundTo5(clamp(bcRaw, lim.min, lim.max));
      }
    } else {
      if (isBCFreq(r.freq) && typeof (r.bc) === 'number') {
        const lim = LIMITS_BC[r.freq];
        const jitter = (rand() - 0.5) * 12;
        bc = roundTo5(clamp(ac + jitter, lim.min, lim.max));
      }
    }

    let outRow = { ...r, ac, bc };
    // CHL系: 最低ABGの保証
    if ((profile === 'CHL_OME' || profile === 'CHL_AOM' || profile === 'CHL_Otosclerosis' || profile === 'CHL_OssicularDiscontinuity') && isBCFreq(r.freq) && typeof outRow.bc === 'number') {
      const minMaps = {
        CHL_OME: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 8 },
        CHL_AOM: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 8 },
        CHL_Otosclerosis: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 5 },
        CHL_OssicularDiscontinuity: { "0.25kHz": 20, "0.5kHz": 25, "1kHz": 25, "2kHz": 20, "4kHz": 15, "8kHz": 10 },
      };
      const minABG = (minMaps[profile] && minMaps[profile][r.freq]) ? minMaps[profile][r.freq] : 0;
      const gap = (outRow.ac ?? 0) - (outRow.bc ?? 0);
      if (minABG > 0 && gap < minABG) {
        const lim = LIMITS_AC[r.freq];
        const raised = clamp((outRow.ac ?? 0) + (minABG - gap), lim.min, lim.max);
        outRow.ac = roundTo5(raised);
      }
    }
    // 共通: BCはACより悪くなるのは最大+5 dBまで
    if (isBCFreq(r.freq) && typeof outRow.bc === 'number' && typeof outRow.ac === 'number') {
      const limBC = LIMITS_BC[r.freq];
      const capped = Math.min(outRow.bc, outRow.ac + 5);
      outRow.bc = roundTo5(clamp(capped, limBC.min, limBC.max));
    }
    return outRow;
  });
  // SNHL系ならBC NR規則
  if ((profile || '').startsWith('SNHL_')) {
    return applySnhlBcNr(out);
  }
  return out;
}

function randomPick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
function weightedRandomPick(rand, items) {
  let total = 0;
  const cumulative = items.map(item => {
    total += item.weight;
    return { value: item.value, cumulative: total };
  });
  const r = rand() * total;
  return cumulative.find(item => r < item.cumulative)?.value || items[items.length - 1].value;
}

export function generateAudiogram(opts = {}) {
  const seed = (opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9)) >>> 0;
  const rand = makeRng(seed);
  
  // ステップ1: 性別と年齢グループを決定（これが最初のステップ）
  const sex = opts.sex || randomPick(rand, SEXES);
  let ageGroup = opts.ageGroup;
  
  // 年齢グループの処理：数値で渡された場合はISO用の年齢グループに変換
  if (typeof ageGroup === 'number') {
    // 数値の年齢が渡された場合、ISO用の年齢グループに変換
    if (ageGroup <= 10) {
      ageGroup = '20s'; // 10歳以下は20代のISOデータを使用
    } else if (ageGroup <= 19) {
      ageGroup = '20s'; // 10代も20代のISOデータを使用
    } else if (ageGroup <= 29) {
      ageGroup = '20s';
    } else if (ageGroup <= 39) {
      ageGroup = '30s';
    } else if (ageGroup <= 49) {
      ageGroup = '40s';
    } else if (ageGroup <= 59) {
      ageGroup = '50s';
    } else if (ageGroup <= 69) {
      ageGroup = '60s';
    } else {
      ageGroup = '70s';
    }
  } else if (!ageGroup) {
    // 年齢グループが指定されていない場合はランダムに選択
    ageGroup = randomPick(rand, AGE_GROUPS);
  }
  
  // 年齢グループをISO用に正規化（日本語の年齢グループや10歳以下をISO形式に変換）
  ageGroup = normalizeAgeGroupForISO(sex, ageGroup);
  
  // ステップ2: プロファイルと重症度を決定
  const profile = opts.profile || randomPick(rand, PROFILES);
  const severityWasRandom = opts.severity == null;
  let severity = opts.severity != null ? opts.severity : Math.floor(rand() * 4);

  // 一側性のSNHL系は重症度0（なし）を避けて最低1に補正（表示上の無変化を防止）
  // ※明示指定時は補正しない（検証・教員用の条件固定を優先）
  const unilateralProfiles = new Set(['SNHL_Sudden', 'SNHL_Meniere', 'SNHL_Mumps', 'CHL_OssicularDiscontinuity']);
  const forcedUnilateralAOM = profile === 'CHL_AOM' && rand() < 0.8;
  const isUnilateralProfile = unilateralProfiles.has(profile) || forcedUnilateralAOM;

  if (severityWasRandom && isUnilateralProfile && profile.startsWith('SNHL_') && severity === 0) {
    severity = 1;
  }
  // ムンプス: 教育上「軽度」は用いず、乱択時は中等度以上へ（明示指定の severity=1 も高度寄り深度で生成）
  if (severityWasRandom && profile === 'SNHL_Mumps' && severity === 1) {
    severity = 2;
  }
  // ムンプス明示 severity=1 も深度テーブル上は中等度相当（meta.severity は指定値のまま）
  const transformSeverity = (profile === 'SNHL_Mumps' && severity === 1) ? 2 : severity;

  // ステップ3: 性別と年齢グループからISO7029データを参照してオージオグラムのベースを生成
  // これが最初のオージオグラム作成ステップ（年代・性別からISOデータを見て作成）
  let right = generateEarBase(rand, sex, ageGroup);

  // 耳硬化: Carhart様の発現を事前定義確率で決定（severity≥1）
  // ※severity=0でも乱数を1回消費し、同一seedで程度だけ変えたときのRNG位相を揃える
  let carhartApplied = false;
  if (profile === 'CHL_Otosclerosis') {
    const roll = rand();
    carhartApplied = severity >= 1 && roll < CARHART_EXPRESSION_PROB;
  }
  // AOM混合型: severity=0でも乱数を1回消費（同一seedで程度だけ変えたときのRNG位相を揃える）
  let aomMixedApplied = false;
  if (profile === 'CHL_AOM') {
    const roll = rand();
    aomMixedApplied = severity >= 1 && roll < AOM_MIXED_PROB;
  }
  const profileOpts = { carhartApplied, aomMixedApplied };
  
  // ステップ4: プロファイル（疾患パターン）を適用して難聴パターンを追加
  right = applyProfileTransform(rand, right, profile, transformSeverity, seed, sex, ageGroup, profileOpts);

  let left;
  let affectedSide = null;
  let suddenSoMode = 'none';
  let suddenSoInclude2k = false;

  if (isUnilateralProfile) {
    const affectedRight = opts.affectedSide ? (opts.affectedSide === 'R') : (rand() < 0.5);
    affectedSide = affectedRight ? 'R' : 'L';
    if (affectedRight) {
      // 左はNormal（同sex/age）
      left = makeContralateralNormal(rand, sex, ageGroup);
    } else {
      // 右をNormalにし、左を病側生成
      const normalRight = makeContralateralNormal(rand, sex, ageGroup);
      let diseasedLeft = generateEarBase(rand, sex, ageGroup);
      diseasedLeft = applyProfileTransform(rand, diseasedLeft, profile, transformSeverity, seed, sex, ageGroup, profileOpts);
      right = normalRight;
      left = diseasedLeft;
    }

    // 突発: 高音SO／まれに全周SO（ムンプスの高率全周SOと役割分担）
    if (profile === 'SNHL_Sudden') {
      const decided = decideSuddenSoMode(rand, severity);
      suddenSoMode = decided.mode;
      suddenSoInclude2k = decided.include2k;
      if (affectedRight) {
        right = applySuddenScaleOut(right, suddenSoMode, suddenSoInclude2k);
      } else {
        left = applySuddenScaleOut(left, suddenSoMode, suddenSoInclude2k);
      }
    }

    // ムンプス: 約50%で患側をAC/BCとも強制NR（全周波数）
    if (profile === 'SNHL_Mumps' && rand() < 0.5) {
      if (affectedRight) {
        right = right.map((r) => forceScaleOutRow(r, { withBc: true }));
      } else {
        left = left.map((r) => forceScaleOutRow(r, { withBc: true }));
      }
    }
  } else {
    // 両側同時生成（相関あり）
    left = correlateLeft(rand, right, sex, ageGroup);
  }

  right = applyBcRandomJitter(rand, right);
  left = applyBcRandomJitter(rand, left);

  const baseRightProfile = (isUnilateralProfile && affectedSide === 'L') ? 'Normal' : profile;
  const baseLeftProfile = (isUnilateralProfile && affectedSide === 'R') ? 'Normal' : profile;

  right = enforceBcRules(right, baseRightProfile);
  left = enforceBcRules(left, baseLeftProfile);

  // Carhart様幾何はゆらぎ後に再拘束（発現指定時のみ）
  if (carhartApplied) {
    if (baseRightProfile === 'CHL_Otosclerosis') {
      right = enforceCarhartNotchGeometry(right);
      right = enforceMinAbg(right, baseRightProfile);
      right = enforceBcRules(right, baseRightProfile);
      right = enforceCarhartNotchGeometry(right);
      right = enforceMinAbg(right, baseRightProfile);
    }
    if (baseLeftProfile === 'CHL_Otosclerosis') {
      left = enforceCarhartNotchGeometry(left);
      left = enforceMinAbg(left, baseLeftProfile);
      left = enforceBcRules(left, baseLeftProfile);
      left = enforceCarhartNotchGeometry(left);
      left = enforceMinAbg(left, baseLeftProfile);
    }
  }

  // AOM混合型: ゆらぎ後に高音骨導上昇と気導≥骨導を再拘束
  if (aomMixedApplied) {
    if (baseRightProfile === 'CHL_AOM') {
      right = enforceAomMixedGeometry(right);
      right = enforceMinAbg(right, baseRightProfile);
      right = enforceBcRules(right, baseRightProfile);
      right = enforceAomMixedGeometry(right);
      right = enforceMinAbg(right, baseRightProfile);
    }
    if (baseLeftProfile === 'CHL_AOM') {
      left = enforceAomMixedGeometry(left);
      left = enforceMinAbg(left, baseLeftProfile);
      left = enforceBcRules(left, baseLeftProfile);
      left = enforceAomMixedGeometry(left);
      left = enforceMinAbg(left, baseLeftProfile);
    }
  }

  // C5-dip: severity≥1 では 4 kHz が 2/8 kHz より各 ≥10 dB 高いことを保証
  if (profile === 'SNHL_NoiseNotch' && severity >= 1) {
    if (baseRightProfile === 'SNHL_NoiseNotch') right = enforceNoiseNotchGeometry(right);
    if (baseLeftProfile === 'SNHL_NoiseNotch') left = enforceNoiseNotchGeometry(left);
    right = enforceBcRules(right, baseRightProfile);
    left = enforceBcRules(left, baseLeftProfile);
  }

  // 突発・ムンプス: 一側差／病側平均の教育用床（SO後・BC拘束前に適用し、その後再拘束）
  if (isUnilateralProfile && affectedSide && severity >= 1) {
    const diseasedIsRight = affectedSide === 'R';
    let diseased = diseasedIsRight ? right : left;
    const contra = diseasedIsRight ? left : right;
    if (profile === 'SNHL_Sudden') {
      // 先に一側差≥30。続けて程度別の絶対床で 0→1→2→3 の非減少を担保
      diseased = enforceMinLaterality(diseased, contra, SUDDEN_MIN_LATERALITY_DB);
      const suddenAbsFloor = [0, 40, 55, 75][Math.min(3, Math.max(0, severity))];
      diseased = enforceMinMeanAc(diseased, suddenAbsFloor);
    }
    if (profile === 'SNHL_Mumps') {
      diseased = enforceMinMeanAc(diseased, MUMPS_MIN_MEAN_AC_DB);
      diseased = enforceMinLaterality(diseased, contra, MUMPS_MIN_LATERALITY_DB);
      const mumpsAbsFloor = [0, 70, 85, 95][Math.min(3, Math.max(0, transformSeverity))];
      diseased = enforceMinMeanAc(diseased, mumpsAbsFloor);
    }
    if (diseasedIsRight) right = diseased;
    else left = diseased;
    right = enforceBcRules(right, baseRightProfile);
    left = enforceBcRules(left, baseLeftProfile);
  }

  // 最終: soAC判定（ACが機器上限超ならNR）
  const finalizeSo = (rows) => rows.map(r => {
    const lim = LIMITS_AC[r.freq];
    const soAC = Boolean(r.soAC) || (r.ac > lim.max);
    const ac = roundTo5(clamp(r.ac, lim.min, lim.max));
    return { ...r, ac, soAC };
  });
  right = finalizeSo(right);
  left = finalizeSo(left);
  right = finalizeSoBc(right);
  left = finalizeSoBc(left);

  // 125 Hz / 8 kHz のBC内部ルール適用（表示には使わない）
  function applyBcEdgeInternal(rows, profileName) {
    const isSNHL = (profileName || '').startsWith('SNHL_') || profileName === 'Normal';
    if (isSNHL) {
      return rows.map(r => {
        if (r.freq === '0.125kHz' || r.freq === '8kHz') {
          return { ...r, bcInternal: r.ac };
        }
        return r;
      });
    }
    const isCHL = (profileName || '').startsWith('CHL_');
    if (isCHL) {
      let bc025 = null, bc4k = null;
      rows.forEach(r => { if (r.freq === '0.25kHz') bc025 = r.bc; if (r.freq === '4kHz') bc4k = r.bc; });
      return rows.map(r => {
        if (r.freq === '0.125kHz' && bc025 != null) return { ...r, bcInternal: bc025 };
        if (r.freq === '8kHz' && bc4k != null) return { ...r, bcInternal: bc4k };
        return r;
      });
    }
    return rows;
  }

  right = applyBcEdgeInternal(right, profile);
  left = applyBcEdgeInternal(left, profile);

  // 耳ごとの最終プロファイル（答え合わせ用）
  let rightProfile = baseRightProfile;
  let leftProfile  = baseLeftProfile;

  // WHO基準の4分法PTA（(0.5k + 2*1k + 2k)/4）で正常判定（<=25 dB）の場合、
  // 20s/30s かつ SNHL_Age のときは「答え合わせ」を Normal に補正
  function computePTA(rows) {
    const map = Object.fromEntries(rows.map(r => [r.freq, r]));
    const f05 = map['0.5kHz']?.ac ?? 0;
    const f1  = map['1kHz']?.ac ?? 0;
    const f2  = map['2kHz']?.ac ?? 0;
    return (f05 + 2*f1 + f2) / 4;
  }
  if (profile === 'SNHL_Age' && (ageGroup === '20s' || ageGroup === '30s' || ageGroup === '40s' || ageGroup === '50s')) {
    const ptaR = computePTA(right);
    const ptaL = computePTA(left);
    if (ptaR <= 25) rightProfile = 'Normal';
    if (ptaL <= 25) leftProfile = 'Normal';
  }

  return {
    meta: {
      seed, sex, ageGroup, profile, severity, affectedSide,
      rightProfile, leftProfile, forcedUnilateralAOM, carhartApplied, aomMixedApplied,
      suddenSoMode, suddenSoInclude2k,
    },
    right,
    left,
  };
}

export const EngineConstants = { FREQS, AGE_GROUPS, SEXES, PROFILES };

function applyBcRandomJitter(rand, rows, options = {}) {
  const { stepOptions = [-10, -5, 0, 5, 10] } = options;
  return rows.map(r => {
    if (!isBCFreq(r.freq) || typeof r.bc !== 'number') return r;
    // スケールアウト（SO）の行は、表示用の基準閾値（例: 4kHz BC=60dB）からズレないよう固定する
    if (Boolean(r.soBC)) return r;
    const lim = LIMITS_BC[r.freq];
    const step = stepOptions[Math.floor(rand() * stepOptions.length)] || 0;
    const jittered = roundTo5(clamp(r.bc + step, lim.min, lim.max));
    return { ...r, bc: jittered };
  });
}

const CONDUCTIVE_PROFILES = new Set(['CHL_OME','CHL_AOM','CHL_Otosclerosis','CHL_OssicularDiscontinuity']);

function enforceMinAbg(rows, earProfile) {
  const minMaps = {
    CHL_OME: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 8 },
    CHL_AOM: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 8 },
    CHL_Otosclerosis: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 5 },
    CHL_OssicularDiscontinuity: { "0.25kHz": 20, "0.5kHz": 25, "1kHz": 25, "2kHz": 20, "4kHz": 15, "8kHz": 10 },
  };
  const map = minMaps[earProfile];
  if (!map) return rows;
  return rows.map((r) => {
    if (!isBCFreq(r.freq) || typeof r.bc !== 'number' || typeof r.ac !== 'number') return r;
    const minABG = map[r.freq] || 0;
    if (minABG <= 0) return r;
    const gap = r.ac - r.bc;
    if (gap >= minABG) return r;
    const lim = LIMITS_AC[r.freq];
    const ac = roundTo5(clamp(r.bc + minABG, lim.min, lim.max));
    return { ...r, ac };
  });
}

function enforceBcRules(rows, earProfile) {
  const isConductive = CONDUCTIVE_PROFILES.has(earProfile);
  const minMaps = {
    CHL_OME: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 8 },
    CHL_AOM: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 8 },
    CHL_Otosclerosis: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 5 },
    CHL_OssicularDiscontinuity: { "0.25kHz": 20, "0.5kHz": 25, "1kHz": 25, "2kHz": 20, "4kHz": 15, "8kHz": 10 },
  };
  return rows.map(r => {
    if (!isBCFreq(r.freq) || typeof r.bc !== 'number') return r;
    if (Boolean(r.soBC)) return pinSoBcRow(r);
    const lim = LIMITS_BC[r.freq];
    let bc = roundTo5(clamp(r.bc, lim.min, lim.max));
    let ac = r.ac;
    if (typeof ac === 'number') {
      // ABG上限（伝音性）。耳小骨離断は教育上やや大きめの上限を許容
      const maxGap = earProfile === 'CHL_OssicularDiscontinuity' ? 50 : 40;
      if (isConductive && ac - bc > maxGap) {
        const adjustedAc = clamp(bc + maxGap, LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max);
        ac = roundTo5(adjustedAc);
      }
      const maxAllowed = Math.min(lim.max, ac + 5);
      bc = roundTo5(clamp(bc, lim.min, maxAllowed));
      // 正常・感音性：BCがACより10dB以上良くならない
      if (!isConductive) {
        const minAllowed = ac - 10;
        bc = roundTo5(clamp(bc, Math.max(lim.min, minAllowed), maxAllowed));
      }
    }
    if (isConductive && typeof ac === 'number') {
      const minMap = minMaps[earProfile];
      const minABG = minMap ? (minMap[r.freq] ?? 0) : 0;
      if (minABG > 0) {
        const gap = ac - bc;
        if (gap < minABG) {
          const adjustedAc = clamp(ac + (minABG - gap), LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max);
          ac = roundTo5(adjustedAc);
        }
      }
    }
    if (typeof ac === 'number') {
      // ABG上限（上と同じ）
      const maxGap = earProfile === 'CHL_OssicularDiscontinuity' ? 50 : 40;
      if (ac - bc > maxGap) {
        const adjustedAc = clamp(bc + maxGap, LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max);
        ac = roundTo5(adjustedAc);
      }
      const maxAllowed = Math.min(lim.max, ac + 5);
      bc = roundTo5(clamp(bc, lim.min, maxAllowed));
    }
    return { ...r, ac, bc };
  });
}


