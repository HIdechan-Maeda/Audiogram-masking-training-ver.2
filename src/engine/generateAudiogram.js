// AI症例生成エンジン（再現性のためseed対応）

// 周波数・年齢・性別・上限/下限・NR規則はデモと同一
const FREQS = ["0.125kHz", "0.25kHz", "0.5kHz", "1kHz", "2kHz", "4kHz", "8kHz"];
const AGE_GROUPS = ["20s", "30s", "40s", "50s", "60s", "70s"];
const SEXES = ["Male", "Female"];
const PROFILES = ["Normal", "SNHL_Age", "SNHL_NoiseNotch", "SNHL_Meniere", "SNHL_Sudden", "SNHL_Mumps", "CHL_OME", "CHL_AOM", "CHL_Otosclerosis", "CHL_OssicularDiscontinuity"];

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
  if (ISO7029[sex] && ISO7029[sex][age]) return age;
  // 簡略版テーブルのフォールバック（30s→20s, 40s→50s）
  const map = { "30s": "20s", "40s": "50s" };
  const cand = map[age] || age;
  if (ISO7029[sex] && ISO7029[sex][cand]) return cand;
  // 最後の保険: 利用可能な最初の年代
  const available = ISO7029[sex] ? Object.keys(ISO7029[sex]) : [];
  return available.length ? available[0] : age;
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

// 右耳ベース生成（デモのNormal基盤 + 5dB丸め + 上下限）
function generateEarBase(rand, sex, age) {
  return FREQS.map((f, idx) => {
    const b = getBand(sex, age, f);
    const sdApprox = (b.plus2SD - b.median) / 2;
    const noisy = randNormal(rand, b.median, sdApprox * 0.5) * (0.9 + 0.2 * rand());
    const clipped = Math.max(b.minus2SD, Math.min(b.plus2SD, noisy));
    const bounded = clamp(clipped, LIMITS_AC[f].min, LIMITS_AC[f].max);
    const ac = roundTo5(bounded);
    let bc = null;
    if (isBCFreq(f)) {
      // 正常耳の骨導はほぼ中央値付近
      const lim = LIMITS_BC[f];
      const bcRaw = b.median + (rand() - 0.5) * 3.0; // ±1.5dB程度
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

// 片耳病型で非病側をNormal化
function makeContralateralNormal(rand, sex, age) {
  const base = generateEarBase(rand, sex, age);
  // 正常耳は軽い揺らぎのみ
  return base.map(r => ({ ...r }));
}

// 左右相関をつけて左耳を生成（ρ≈0.7）
function correlateLeft(rand, rightRows, sex, age) {
  const rho = 0.7;
  return rightRows.map((rr, i) => {
    const b = getBand(sex, age, rr.freq);
    const sd = (b.plus2SD - b.median) / 2;
    const eps = randNormal(rand, 0, sd * 0.3);
    const target = b.median + rho * (rr.ac - b.median) + eps;
    const ac = roundTo5(clamp(target, LIMITS_AC[rr.freq].min, LIMITS_AC[rr.freq].max));
    let bc = rr.bc;
    if (isBCFreq(rr.freq) && typeof bc === 'number') {
      const lim = LIMITS_BC[rr.freq];
      const bcRaw = b.median + rho * (bc - b.median) + (rand() - 0.5) * 2.0;
      bc = roundTo5(clamp(bcRaw, lim.min, lim.max));
    }
    return { ...rr, ac, bc, soAC: false, soBC: false };
  });
}

// プロファイル変換の簡略版（まずは Normal と同時生成/片耳病型の枠を実装）
function applyProfileTransform(rand, rows, profile, severity, seed, sexForBands, ageForBands) {
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
      const depth = [0, 25, 45, 65][Math.min(3, Math.max(0, Math.round(severity||0)))];
      add = depth * (0.7 + 0.3 * rand());
    } else if (profile === 'SNHL_Mumps') {
      const depth = [0, 40, 65, 85][Math.min(3, Math.max(0, Math.round(severity||0)))];
      add = depth;
    } else if (profile === 'CHL_OME') {
      // OME: 0.5–1k 中心のABG、HFは控えめ（UIデモ準拠）
      const depth = [0, 12, 20, 28][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const w = { "0.125kHz": 0.6, "0.25kHz": 0.9, "0.5kHz": 1.0, "1kHz": 0.9, "2kHz": 0.5, "4kHz": 0.3, "8kHz": 0.2 }[r.freq] || 0;
      add = w * depth;
    } else if (profile === 'CHL_AOM') {
      const depth = [0, 15, 25, 35][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const w = { "0.125kHz": 0.7, "0.25kHz": 1.0, "0.5kHz": 1.0, "1kHz": 0.8, "2kHz": 0.4, "4kHz": 0.2, "8kHz": 0.1 }[r.freq] || 0;
      add = w * depth;
    } else if (profile === 'CHL_Otosclerosis') {
      const depth = [0, 12, 22, 30][Math.min(3, Math.max(0, Math.round(severity||0)))];
      const w = { "0.125kHz": 0.5, "0.25kHz": 0.9, "0.5kHz": 1.0, "1kHz": 0.8, "2kHz": 0.4, "4kHz": 0.2, "8kHz": 0.1 }[r.freq] || 0;
      add = w * depth;
    } else if (profile === 'CHL_OssicularDiscontinuity') {
      const depth = [0, 30, 30, 30][Math.min(3, Math.max(0, Math.round(severity||0)))];
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
        let bcRaw = (band.median ?? 0) + (rand() - 0.5) * 3.0; // ±1.5dB程度
        // 耳硬化症: Carhartノッチ（2k中心、1k/4kに弱く波及）
        if (profile === 'CHL_Otosclerosis') {
          const wBC = { "1kHz": 0.3, "2kHz": 1.0, "4kHz": 0.2 }[r.freq] || 0;
          const carhart = [0, 6, 10, 15][Math.min(3, Math.max(0, Math.round(severity||0)))];
          bcRaw += wBC * carhart;
        }
        bc = roundTo5(clamp(bcRaw, lim.min, lim.max));
      }
    } else {
      if (isBCFreq(r.freq) && typeof (r.bc) === 'number') {
        const lim = LIMITS_BC[r.freq];
        const jitter = (rand() - 0.5) * 6;
        bc = roundTo5(clamp(ac + jitter, lim.min, lim.max));
      }
    }

    let outRow = { ...r, ac, bc };
    // CHL系: 最低ABGの保証
    if ((profile === 'CHL_OME' || profile === 'CHL_AOM' || profile === 'CHL_Otosclerosis' || profile === 'CHL_OssicularDiscontinuity') && isBCFreq(r.freq) && typeof outRow.bc === 'number') {
      const minMaps = {
        CHL_OME: { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 8 },
        CHL_AOM: { "0.25kHz": 15, "0.5kHz": 20, "1kHz": 15, "2kHz": 10, "4kHz": 5 },
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

export function generateAudiogram(opts = {}) {
  const seed = (opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9)) >>> 0;
  const rand = makeRng(seed);
  const sex = opts.sex || randomPick(rand, SEXES);
  const ageGroup = opts.ageGroup || randomPick(rand, AGE_GROUPS);
  const profile = opts.profile || randomPick(rand, PROFILES);
  let severity = opts.severity != null ? opts.severity : Math.floor(rand() * 4);

  // 一側性のSNHL系は重症度0（なし）を避けて最低1に補正（表示上の無変化を防止）
  const unilateralProfiles = new Set(['SNHL_Sudden', 'SNHL_Meniere', 'SNHL_Mumps', 'CHL_OssicularDiscontinuity']);
  if (unilateralProfiles.has(profile) && profile.startsWith('SNHL_') && severity === 0) {
    severity = 1;
  }

  // 右耳ベース
  let right = generateEarBase(rand, sex, ageGroup);
  right = applyProfileTransform(rand, right, profile, severity, seed, sex, ageGroup);

  let left;
  if (unilateralProfiles.has(profile)) {
    const affectedRight = opts.affectedSide ? (opts.affectedSide === 'R') : (rand() < 0.5);
    var affectedSide = affectedRight ? 'R' : 'L';
    if (affectedRight) {
      // 左はNormal（同sex/age）
      left = makeContralateralNormal(rand, sex, ageGroup);
      // Mumpsのとき、50%で患側（右）をAC/BCとも強制NR
      if (profile === 'SNHL_Mumps' && rand() < 0.5) {
        right = right.map(r => {
          const acMax = LIMITS_AC[r.freq].max;
          let bc = r.bc;
          let soBC = r.soBC;
          if (isBCFreq(r.freq)) {
            const th = TH_SNHL_BC_NR[r.freq];
            if (typeof th === 'number') { bc = roundTo5(th); soBC = true; }
          }
          return { ...r, ac: roundTo5(acMax), soAC: true, bc, soBC };
        });
      }
    } else {
      // 右をNormalにし、左を病側生成
      const normalRight = makeContralateralNormal(rand, sex, ageGroup);
      let diseasedLeft = generateEarBase(rand, sex, ageGroup);
      diseasedLeft = applyProfileTransform(rand, diseasedLeft, profile, severity, seed, sex, ageGroup);
      right = normalRight;
      left = diseasedLeft;
      // Mumpsのとき、50%で患側（左）をAC/BCとも強制NR
      if (profile === 'SNHL_Mumps' && rand() < 0.5) {
        left = left.map(r => {
          const acMax = LIMITS_AC[r.freq].max;
          let bc = r.bc;
          let soBC = r.soBC;
          if (isBCFreq(r.freq)) {
            const th = TH_SNHL_BC_NR[r.freq];
            if (typeof th === 'number') { bc = roundTo5(th); soBC = true; }
          }
          return { ...r, ac: roundTo5(acMax), soAC: true, bc, soBC };
        });
      }
    }
  } else {
    // 両側同時生成（相関あり）
    left = correlateLeft(rand, right, sex, ageGroup);
    var affectedSide = null;
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
  let rightProfile = (unilateralProfiles.has(profile) && affectedSide === 'L') ? 'Normal' : profile;
  let leftProfile  = (unilateralProfiles.has(profile) && affectedSide === 'R') ? 'Normal' : profile;

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
    meta: { seed, sex, ageGroup, profile, severity, affectedSide, rightProfile, leftProfile },
    right,
    left,
  };
}

export const EngineConstants = { FREQS, AGE_GROUPS, SEXES, PROFILES };


