import React, { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { generateAudiogram } from "./engine/generateAudiogram";
import ISO_DATA from "./data/iso7029_age_hearing_thresholds_2sd.json";

// === Minimal, self-contained ISO7029-derived normal dataset (median & ±2SD) ===
// Frequencies are 0.125, 0.25, 0.5, 1, 2, 4, 8 kHz (125 Hz is mirrored from 250 Hz for ISO7029 coverage)
const FREQS = ["0.125kHz", "0.25kHz", "0.5kHz", "1kHz", "2kHz", "4kHz", "8kHz"];
const AGE_GROUPS = ["20s", "30s", "40s", "50s", "60s", "70s"];
const SEXES = ["Male", "Female"];

// === Profiles ===
const PROFILES = ["Normal", "SNHL_Age", "SNHL_NoiseNotch", "SNHL_Meniere", "SNHL_Sudden", "SNHL_Mumps", "CHL_OME", "CHL_AOM", "CHL_Otosclerosis", "CHL_OssicularDiscontinuity"];

// Helper: label → numeric kHz
const FREQ_NUM = {
  "0.125kHz": 0.125,
  "0.25kHz": 0.25,
  "0.5kHz": 0.5,
  "1kHz": 1,
  "2kHz": 2,
  "4kHz": 4,
  "8kHz": 8,
};

// Frequency-specific output limits (dB HL)
// AC: realistic audiometer max outputs; BC: clinical plausibility (8 kHz BC = N/A)
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
  // 0.125kHz removed
  // 8kHz BC N/A
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const roundTo5 = (x) => Math.round(x / 5) * 5;

// データソース: ISO7029の中央値/±2SD（提供JSON）
const ISO7029 = ISO_DATA;

function getBand(sex, age, f) {
  // ISO7029 has no explicit 125 Hz; mirror 250 Hz values for display/sampling
  const key = f === "0.125kHz" ? "0.25kHz" : f;
  return ISO7029[sex][age][key];
}

function randNormal(mean, sd) {
  const u = Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + sd * z;
}

// BC usable freqs per policy A (250–4000 Hz)
const BC_FREQS = new Set(["0.25kHz","0.5kHz","1kHz","2kHz","4kHz"]);
const isBCFreq = (f) => BC_FREQS.has(f);

// -----------------------------
// Dev micro-tests (run once in browser console)
// -----------------------------
(function devTests(){
  try {
    // Test: JSX-safe legend label should not contain raw '<'
    const legendLabel = "BC \u003C (R)";
    console.assert(!legendLabel.includes("<"), "Legend label must escape '<'");

    // Test: SNHL BC NR rule thresholds are as specified
    const TH = {"0.25kHz":55, "0.5kHz":65, "1kHz":70, "2kHz":70, "4kHz":60};
    Object.keys(TH).forEach(k=>{ console.assert(typeof TH[k] === 'number', `Threshold for ${k} must exist`); });
  } catch(e) { /* ignore in prod */ }
})();

export default function ISO7029CanvasDemo() {
  const [sex, setSex] = useState("Male");
  const [age, setAge] = useState("50s");
  const [seed, setSeed] = useState(0);
  const [showBands, setShowBands] = useState(false);
  const [profile, setProfile] = useState("Normal");
  const [severity, setSeverity] = useState(1); // 0:none,1:mild,2:mod,3:severe
  const [genCase, setGenCase] = useState(null);

  const data = useMemo(() => {
    // simple deterministic-ish sampling per seed
    const rng = (i) => { const s = Math.sin(i + seed) * 10000; return s - Math.floor(s); };

    // 1st pass: generate base AC within ±2SD, then clamp to AC limits and round to 5 dB
    const base = FREQS.map((f, idx) => {
      const b = getBand(sex, age, f);
      const sdApprox = (b.plus2SD - b.median) / 2; // ≈1SD
      const noisy = randNormal(b.median, sdApprox * 0.5) * (0.9 + 0.2 * rng(idx));
      const clipped = Math.max(b.minus2SD, Math.min(b.plus2SD, noisy));
      const bounded = clamp(clipped, LIMITS_AC[f].min, LIMITS_AC[f].max);
      const sample = roundTo5(bounded);
      return { freq: f, median: b.median, minus2SD: b.minus2SD, plus2SD: b.plus2SD, sample, sampleBC: null };
    });

    // 2nd pass: with 30% probability, push AC outside ±2SD, but smooth using neighbor trend to avoid jagged shapes
    const withOutliers = base.map((row, i, arr) => {
      const p = rng(i + 200);
      let sample = row.sample;
      if (p < 0.30) {
        const b = getBand(sex, age, row.freq);
        const prev = i > 0 ? arr[i - 1].sample : sample;
        const next = i < arr.length - 1 ? arr[i + 1].sample : sample;
        const neighborMean = (prev + next) / 2;
        const dir = neighborMean - sample;
        const boundary = dir >= 0 ? b.plus2SD : b.minus2SD;
        const overshoot = (age === "20s" || age === "30s") ? 10 : 15;
        let target = dir >= 0 ? boundary + overshoot : boundary - overshoot;
        target = 0.7 * target + 0.3 * neighborMean;
        target = clamp(target, LIMITS_AC[row.freq].min, LIMITS_AC[row.freq].max);
        sample = roundTo5(target);
      }

      let sampleBC = null;
      let soBC = false;
      if (isBCFreq(row.freq)) {
        const lim = LIMITS_BC[row.freq];
        const delta = Math.max(-10, Math.min(5, (rng(i + 100) - 0.5) * 20));
        const bcRaw = sample + delta;
        soBC = bcRaw > lim.max;
        const bcBound = clamp(bcRaw, lim.min, lim.max);
        sampleBC = roundTo5(bcBound);
      }

      return { ...row, sample, sampleBC, soBC };
    });

    // === Profile transform ===
    let profData = withOutliers;
    if (profile === "SNHL_Age" && severity > 0) {
      const baseAlpha = [0, 3, 6, 9][Math.min(3, Math.max(0, Math.round(severity)))];
      const ageBoostMap = { "20s": 0, "30s": 1, "40s": 2, "50s": 3, "60s": 4, "70s": 5 };
      const alpha = baseAlpha + ageBoostMap[age]; // dB/oct beyond 1 kHz
      profData = withOutliers.map(r => {
        const fk = FREQ_NUM[r.freq];
        // High-frequency slope (>=1 kHz): Δ = α_HF * log2(f/1k)
        const octHF = Math.max(0, Math.log2(fk / 1));
        const alphaHF = alpha; // severity+age 依存
        // Low-frequency gentle slope (<1 kHz): Δ = α_LF * log2(1k/f)
        const octLF = fk < 1 ? Math.log2(1 / fk) : 0; // 1k→0, 0.5k→1, 0.25k→2, 0.125k→3
        const sevIdx = Math.min(3, Math.max(0, Math.round(severity)));
        const kLF = 0.25 + 0.1 * sevIdx; // 0.25→0.55（severity 0→3）
        const alphaLF = alpha * kLF;     // 高域より緩やか
        let add = alphaHF * octHF + alphaLF * octLF;
        if (fk === 1) add *= 0.1;   // 1kHz 近傍は弱め
        const rawAC = (r.sample ?? 0) + add;
        const limAC = LIMITS_AC[r.freq];
        const soAC = rawAC > limAC.max;
        let s = clamp(rawAC, limAC.min, limAC.max);
        s = roundTo5(s);
        let sampleBC = r.sampleBC ?? null;
        if (isBCFreq(r.freq)) {
          const lim = LIMITS_BC[r.freq];
          const delta = Math.max(-10, Math.min(5, (Math.sin((fk+seed)*7) - 0.5) * 20));
          const bcRaw = s + delta;
          sampleBC = roundTo5(clamp(bcRaw, lim.min, lim.max));
        }
        return { ...r, sample: s, sampleBC, soAC };
      });
    } else if (profile === "SNHL_NoiseNotch" && severity > 0) {
      // Noise-induced hearing loss: 4 kHz notch with partial recovery at 8 kHz
      // Depth mapping by severity (approx): 0, 10, 18, 25 dB
      const depth = [0, 14, 24, 32][Math.min(3, Math.max(0, Math.round(severity)))];
      // Age-based reinforcement and shape control
      const ageAdj = { "20s": 0, "30s": 1, "40s": 2, "50s": 3, "60s": 4, "70s": 5 }[age];
      const D = depth + Math.floor(ageAdj/2);

      // Age-conditional notch profile: younger → sharper V, older → slightly sharper than before but referencing 2k/8k
      const weightsYoung = { "2kHz": 0.25, "4kHz": 1.25, "8kHz": 0.35 };
      const weightsOlder = { "2kHz": 0.35, "4kHz": 1.1,  "8kHz": 0.45 };
      const weights = (age === "20s" || age === "30s") ? weightsYoung : weightsOlder;

      // Neighbor blending: younger → 0.9/0.1（鋭いV）, older → 0.85/0.15（やや鋭く）
      const blendRaw = 0.9; const blendNei = 0.1;

      profData = withOutliers.map((r, idx, arr) => {
        const w = weights[r.freq] ?? 0;
        let add = 0;
        if (w > 0) {
          const prev = idx > 0 ? (arr[idx-1].sample ?? 0) : (r.sample ?? 0);
          const next = idx < arr.length-1 ? (arr[idx+1].sample ?? 0) : (r.sample ?? 0);
          const neigh = (prev + next) / 2;
          const raw = (r.sample ?? 0) + w * depth;
          add = blendRaw * (raw - (r.sample ?? 0)) + blendNei * (neigh - (r.sample ?? 0));
        }
        const rawAC = (r.sample ?? 0) + add;
        const limAC = LIMITS_AC[r.freq];
        const soAC = rawAC > limAC.max; // scale-out flag
        let s = clamp(rawAC, limAC.min, limAC.max);
        s = roundTo5(s);

        const fk = FREQ_NUM[r.freq];
        let sampleBC = r.sampleBC ?? null;
        let soBC = false;
        if (isBCFreq(r.freq)) {
          const lim = LIMITS_BC[r.freq];
          const delta = Math.max(-10, Math.min(5, (Math.sin((fk+seed)*5.7) - 0.5) * 20));
          let bcRaw = s + delta;
          soBC = bcRaw > lim.max;
          sampleBC = roundTo5(clamp(bcRaw, lim.min, lim.max));
        }
        return { ...r, sample: s, sampleBC, soAC, soBC };
      });
    } else if (profile === "SNHL_Sudden" && severity > 0) {
      // Sensorineural sudden hearing loss (片側想定の単耳パターン)
      const sev = Math.min(3, Math.max(0, Math.round(severity)));
      const depth = [0, 25, 45, 65][sev];
      const modeFlat = ((Math.sin(seed * 1.234) + 1) / 2) > 0.5;
      const wFlat = {
        "0.125kHz": 0.6, "0.25kHz": 0.8, "0.5kHz": 0.9,
        "1kHz": 1.0,   "2kHz": 1.0,  "4kHz": 1.0,  "8kHz": 0.9
      };
      const wHF = {
        "0.125kHz": 0.3, "0.25kHz": 0.5, "0.5kHz": 0.7,
        "1kHz": 0.85,   "2kHz": 1.0,  "4kHz": 1.1,  "8kHz": 1.1
      };
      const weights = modeFlat ? wFlat : wHF;

      // === 重度（sev=3）のとき 15% で 4k / 8k / 両方 を強制NRにする ===
      // 8kHzはBC測定対象外のため、BCのNRは4kHzのみ適用されます。
      const forceNR = (sev === 3) && (Math.abs(Math.sin(seed * 9.99)) % 1 < 0.15);
      let nrSet = new Set();
      if (forceNR) {
        const pick = Math.floor((Math.abs(Math.cos(seed * 5.4321)) % 1) * 3); // 0,1,2
        if (pick === 0) nrSet = new Set(["4kHz"]);
        else if (pick === 1) nrSet = new Set(["8kHz"]);
        else nrSet = new Set(["4kHz", "8kHz"]);
      }

      const blendRaw = 0.82, blendNei = 0.18;
      profData = withOutliers.map((r, idx, arr) => {
        const w = weights[r.freq] ?? 0;
        let add = 0;
        if (w > 0) {
          const prev = idx > 0 ? (arr[idx-1].sample ?? 0) : (r.sample ?? 0);
          const next = idx < arr.length-1 ? (arr[idx+1].sample ?? 0) : (r.sample ?? 0);
          const neigh = (prev + next) / 2;
          const raw = (r.sample ?? 0) + w * depth;
          add = blendRaw * (raw - (r.sample ?? 0)) + blendNei * (neigh - (r.sample ?? 0));
        }
        // 追加の不規則性（A強度）
        const fk = FREQ_NUM[r.freq];
        const jagAmp = [0, 3, 6, 9][sev];
        const irrW = { "0.125kHz": 0.2, "0.25kHz": 0.3, "0.5kHz": 0.5, "1kHz": 0.8, "2kHz": 1.0, "4kHz": 1.0, "8kHz": 0.9 };
        const irr = ((Math.sin((fk*13.1 + seed*2.3)) + (Math.cos((fk*7.7 + seed*1.1)))) * 0.5) * jagAmp * irrW[r.freq];
        add += irr;
        const notchBands = ["2kHz", "4kHz", "8kHz"];
        const notchIdx = Math.floor(((Math.sin(seed*3.14)+1)/2) * notchBands.length) % notchBands.length;
        const notchF = notchBands[notchIdx];
        const notchDepth = [0, 5, 8, 12][sev];
        if (r.freq === notchF) add += notchDepth;
        const rawAC = (r.sample ?? 0) + add;
        const limAC = LIMITS_AC[r.freq];
        let soAC = rawAC > limAC.max;
        let s = clamp(rawAC, limAC.min, limAC.max);
        s = roundTo5(s);
        // 強制NR（重度・15%）：4k/8k/両方
        if (nrSet.has(r.freq)) {
          s = roundTo5(limAC.max);
          soAC = true;
        }
        let sampleBC = r.sampleBC ?? null;
        let soBC = false;
        if (isBCFreq(r.freq)) {
          const lim = LIMITS_BC[r.freq];
          const delta = Math.max(-10, Math.min(5, (Math.sin((fk+seed)*5.7) - 0.5) * 20));
          let bcRaw = s + delta;
          if (nrSet && nrSet.has(r.freq) && r.freq === "4kHz") { bcRaw = lim.max + 5; }
          soBC = bcRaw > lim.max;
          sampleBC = roundTo5(clamp(bcRaw, lim.min, lim.max));
        }
        return { ...r, sample: s, sampleBC, soAC, soBC };
      });
    } else if (profile === "SNHL_Mumps" && severity > 0) {
      // Mumps deafness: 多くは高度〜重度、全帯域でフラット/ほぼフラット。重度では全域NRもしばしば。
      const sev = Math.min(3, Math.max(0, Math.round(severity)));
      const depth = [0, 40, 65, 85][sev];
      const pNR = sev === 3 ? 0.6 : (sev === 2 ? 0.2 : 0);
      const mustIncludeHigh = (sev >= 2);
      const highPicked = { "4kHz": false, "8kHz": false };
      profData = withOutliers.map((r, idx, arr) => {
        const fk = FREQ_NUM[r.freq];
        let add = depth;
        const micro = (Math.sin((fk+seed)*4.1) * 2.0) + (Math.cos((fk+seed)*2.7) * 1.5);
        add += micro;
        const limAC = LIMITS_AC[r.freq];
        let s = clamp((r.sample ?? 0) + add, limAC.min, limAC.max);
        s = roundTo5(s);
        let soAC = false;
        if (pNR > 0) {
          let hit = (Math.abs(Math.sin((idx+1)*(seed+1.37))) % 1) < pNR;
          if (mustIncludeHigh && (r.freq === "4kHz" || r.freq === "8kHz")) {
            if (!highPicked["4kHz"] && !highPicked["8kHz"] && r.freq === "8kHz") {
              hit = true;
            }
            if (hit) highPicked[r.freq] = true;
          }
          if (hit) { s = roundTo5(limAC.max); soAC = true; }
        }
        let sampleBC = r.sampleBC ?? null; let soBC = false;
        if (isBCFreq(r.freq)) {
          const lim = LIMITS_BC[r.freq];
          let bcRaw = s + ((Math.sin((fk+seed)*5.3) - 0.5) * 20);
          if (bcRaw > s + 5) bcRaw = s + 5;
          if (bcRaw < s - 10) bcRaw = s - 10;
          if (soAC && r.freq === "4kHz") { bcRaw = lim.max + 5; }
          soBC = bcRaw > lim.max;
          sampleBC = roundTo5(clamp(bcRaw, lim.min, lim.max));
        }
        return { ...r, sample: s, sampleBC, soAC, soBC };
      });
    } else if (profile === "SNHL_Meniere" && severity > 0) {
      // Meniere: 低音優位のリバーススロープ + 小さな変動
      const sev = Math.min(3, Math.max(0, Math.round(severity)));
      const depth = [0, 10, 20, 35][sev];
      const wAC = {
        "0.125kHz": 1.0, "0.25kHz": 1.0, "0.5kHz": 0.8, "1kHz": 0.4, "2kHz": 0.2, "4kHz": 0.1, "8kHz": 0.05
      };
      const flucMag = [0, 2, 3, 5][sev];
      const blendRaw = 0.85, blendNei = 0.15;
      profData = withOutliers.map((r, idx, arr) => {
        const w = wAC[r.freq] ?? 0;
        let add = 0;
        if (w > 0) {
          const prev = idx > 0 ? (arr[idx-1].sample ?? 0) : (r.sample ?? 0);
          const next = idx < arr.length-1 ? (arr[idx+1].sample ?? 0) : (r.sample ?? 0);
          const neigh = (prev + next) / 2;
          const fluc = (r.freq === "0.125kHz" || r.freq === "0.25kHz" || r.freq === "0.5kHz") ? (Math.sin((idx+seed)*3.7) * flucMag) : 0;
          const raw = (r.sample ?? 0) + w * depth + fluc;
          add = blendRaw * (raw - (r.sample ?? 0)) + blendNei * (neigh - (r.sample ?? 0));
        }
        let s = clamp((r.sample ?? 0) + add, LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max);
        s = roundTo5(s);
        let sampleBC = r.sampleBC ?? null;
        if (isBCFreq(r.freq)) {
          const lim = LIMITS_BC[r.freq];
          const fk = FREQ_NUM[r.freq];
          const delta = Math.max(-10, Math.min(5, (Math.sin((fk+seed)*9.1) - 0.5) * 20));
          const bcRaw = s + delta;
          sampleBC = roundTo5(clamp(bcRaw, lim.min, lim.max));
        }
        return { ...r, sample: s, sampleBC };
      });
    } else if (profile === "CHL_OME" && severity > 0) {
      // OME: 0.5–1k 中心のABG、HFは控えめ
      const depth = [0, 12, 20, 28][Math.min(3, Math.max(0, Math.round(severity)))];
      const wAC = { "0.125kHz": 0.6, "0.25kHz": 0.9, "0.5kHz": 1.0, "1kHz": 0.9, "2kHz": 0.5, "4kHz": 0.3, "8kHz": 0.2 };
      const minABG = { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 8 };
      // BC ~ 正常
      const bcNorm = withOutliers.map((r) => {
        let sampleBC = r.sampleBC ?? null;
        if (isBCFreq(r.freq)) {
          const lim = LIMITS_BC[r.freq];
          const band = getBand(sex, age, r.freq);
          const jitter = ((Math.sin((FREQ_NUM[r.freq] + seed) * 6.3) + 1) * 1.5);
          const bcRaw = band.median + jitter;
          sampleBC = roundTo5(clamp(bcRaw, lim.min, lim.max));
        }
        return { ...r, sampleBC };
      });
      const blendRaw = 0.88, blendNei = 0.12;
      let acShifted = bcNorm.map((r, idx, arr) => {
        const w = wAC[r.freq] ?? 0; let add = 0;
        if (w > 0) {
          const prev = idx>0 ? (arr[idx-1].sample ?? 0) : (r.sample ?? 0);
          const next = idx<arr.length-1 ? (arr[idx+1].sample ?? 0) : (r.sample ?? 0);
          const neigh = (prev+next)/2; const raw = (r.sample ?? 0) + w*depth;
          add = blendRaw*(raw-(r.sample ?? 0)) + blendNei*(neigh-(r.sample ?? 0));
        }
        let s = clamp((r.sample ?? 0) + add, LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max); s = roundTo5(s);
        return { ...r, sample: s };
      });
      profData = acShifted.map((r) => {
        if (!isBCFreq(r.freq) || r.sampleBC == null) return r;
        const gapMin = minABG[r.freq] ?? 0;
        const gap = (r.sample ?? 0) - (r.sampleBC ?? 0);
        if (gapMin>0 && gap < gapMin) {
          const raised = clamp((r.sample ?? 0) + (gapMin-gap), LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max);
          return { ...r, sample: roundTo5(raised) };
        }
        return r;
      });
    } else if (profile === "CHL_AOM" && severity > 0) {
      // AOM: 低音でより強いABG
      const depth = [0, 15, 25, 35][Math.min(3, Math.max(0, Math.round(severity)))];
      const wAC = { "0.125kHz": 0.7, "0.25kHz": 1.0, "0.5kHz": 1.0, "1kHz": 0.8, "2kHz": 0.4, "4kHz": 0.2, "8kHz": 0.1 };
      const minABG = { "0.25kHz": 15, "0.5kHz": 20, "1kHz": 15, "2kHz": 10, "4kHz": 5 };
      // BC ~ 正常
      const bcNorm = withOutliers.map((r) => {
        let sampleBC = r.sampleBC ?? null;
        if (isBCFreq(r.freq)) {
          const lim = LIMITS_BC[r.freq]; const band = getBand(sex, age, r.freq);
          const jitter = ((Math.sin((FREQ_NUM[r.freq] + seed) * 7) + 1) * 2.0);
          const bcRaw = band.median + jitter; sampleBC = roundTo5(clamp(bcRaw, lim.min, lim.max));
        }
        return { ...r, sampleBC };
      });
      const blendRaw = 0.88, blendNei = 0.12;
      let acShifted = bcNorm.map((r, idx, arr) => {
        const w = wAC[r.freq] ?? 0; let add = 0;
        if (w > 0) {
          const prev = idx>0 ? (arr[idx-1].sample ?? 0) : (r.sample ?? 0);
          const next = idx<arr.length-1 ? (arr[idx+1].sample ?? 0) : (r.sample ?? 0);
          const neigh = (prev+next)/2; const raw = (r.sample ?? 0) + w*depth;
          add = blendRaw*(raw-(r.sample ?? 0)) + blendNei*(neigh-(r.sample ?? 0));
        }
        let s = clamp((r.sample ?? 0) + add, LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max); s = roundTo5(s);
        return { ...r, sample: s };
      });
      profData = acShifted.map((r) => {
        if (!isBCFreq(r.freq) || r.sampleBC == null) return r;
        const gapMin = minABG[r.freq] ?? 0; const gap = (r.sample ?? 0) - (r.sampleBC ?? 0);
        if (gapMin>0 && gap < gapMin) {
          const raised = clamp((r.sample ?? 0) + (gapMin-gap), LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max);
          return { ...r, sample: roundTo5(raised) };
        }
        return r;
      });
    } else if (profile === "CHL_Otosclerosis" && severity > 0) {
      // Otosclerosis: 低〜中音ABG + Carhartノッチ（2kHz骨導ディップ）
      const abgDepth = [0, 12, 22, 30][Math.min(3, Math.max(0, Math.round(severity)))];
      const carhart = [0, 6, 10, 15][Math.min(3, Math.max(0, Math.round(severity)))];
      // BC 基準
      let bcBase = withOutliers.map((r) => {
        let sampleBC = r.sampleBC ?? null;
        if (isBCFreq(r.freq)) {
          const lim = LIMITS_BC[r.freq]; const band = getBand(sex, age, r.freq);
          const jitter = ((Math.sin((FREQ_NUM[r.freq] + seed) * 6.1) + 1) * 2.0);
          const bcRaw = band.median + jitter; sampleBC = roundTo5(clamp(bcRaw, lim.min, lim.max));
        }
        return { ...r, sampleBC };
      });
      // Carhart：2k中心、1k/4kに弱く波及
      const wBC = { "1kHz": 0.3, "2kHz": 1.0, "4kHz": 0.2 };
      bcBase = bcBase.map((r, idx, arr) => {
        if (!isBCFreq(r.freq)) return r; const w = wBC[r.freq] ?? 0;
        if (w<=0 || r.sampleBC==null) return r; const lim = LIMITS_BC[r.freq];
        const prev = idx>0 ? (arr[idx-1].sampleBC ?? r.sampleBC) : r.sampleBC;
        const next = idx<arr.length-1 ? (arr[idx+1].sampleBC ?? r.sampleBC) : r.sampleBC;
        const neigh = ((prev ?? r.sampleBC) + (next ?? r.sampleBC)) / 2;
        const target = (r.sampleBC ?? 0) + w * carhart; // worsen BC at 2k
        const blended = 0.85 * target + 0.15 * neigh;
        const b = roundTo5(clamp(blended, lim.min, lim.max));
        return { ...r, sampleBC: b };
      });
      const wAC = { "0.125kHz": 0.5, "0.25kHz": 0.9, "0.5kHz": 1.0, "1kHz": 0.8, "2kHz": 0.4, "4kHz": 0.2, "8kHz": 0.1 };
      const blendRaw = 0.85, blendNei = 0.15;
      let acShifted = bcBase.map((r, idx, arr) => {
        const w = wAC[r.freq] ?? 0; let add = 0;
        if (w > 0) {
          const prev = idx>0 ? (arr[idx-1].sample ?? 0) : (r.sample ?? 0);
          const next = idx<arr.length-1 ? (arr[idx+1].sample ?? 0) : (r.sample ?? 0);
          const neigh = (prev+next)/2; const raw = (r.sample ?? 0) + w*abgDepth;
          add = blendRaw*(raw-(r.sample ?? 0)) + blendNei*(neigh-(r.sample ?? 0));
        }
        let s = clamp((r.sample ?? 0) + add, LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max); s = roundTo5(s);
        return { ...r, sample: s };
      });
      const minABG = { "0.25kHz": 10, "0.5kHz": 15, "1kHz": 15, "2kHz": 5 };
      profData = acShifted.map((r) => {
        if (!isBCFreq(r.freq) || r.sampleBC == null) return r; const gapMin = minABG[r.freq] ?? 0;
        const gap = (r.sample ?? 0) - (r.sampleBC ?? 0);
        if (gapMin>0 && gap < gapMin) {
          const raised = clamp((r.sample ?? 0) + (gapMin-gap), LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max);
          return { ...r, sample: roundTo5(raised) };
        }
        return r;
      });
    } else if (profile === "CHL_OssicularDiscontinuity" && severity > 0) {
      // 離断：広帯域で大きなABG（重症度はほぼ一定 30 dB）
      const depth = [0, 30, 30, 30][Math.min(3, Math.max(0, Math.round(severity)))];
      const bcNorm = withOutliers.map((r) => {
        let sampleBC = r.sampleBC ?? null;
        if (isBCFreq(r.freq)) {
          const lim = LIMITS_BC[r.freq]; const band = getBand(sex, age, r.freq);
          const jitter = ((Math.sin((FREQ_NUM[r.freq] + seed) * 4.7) + 1) * 1.5);
          const bcRaw = band.median + jitter; sampleBC = roundTo5(clamp(bcRaw, lim.min, lim.max));
        }
        return { ...r, sampleBC };
      });
      const wAC = { "0.125kHz": 0.8, "0.25kHz": 1.0, "0.5kHz": 1.0, "1kHz": 0.9, "2kHz": 0.9, "4kHz": 0.7, "8kHz": 0.5 };
      const blendRaw = 0.9, blendNei = 0.1;
      let acShifted = bcNorm.map((r, idx, arr) => {
        const w = wAC[r.freq] ?? 0; let add = 0;
        if (w > 0) {
          const prev = idx>0 ? (arr[idx-1].sample ?? 0) : (r.sample ?? 0);
          const next = idx<arr.length-1 ? (arr[idx+1].sample ?? 0) : (r.sample ?? 0);
          const neigh = (prev+next)/2; const raw = (r.sample ?? 0) + w*depth;
          add = blendRaw*(raw-(r.sample ?? 0)) + blendNei*(neigh-(r.sample ?? 0));
        }
        let s = clamp((r.sample ?? 0) + add, LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max); s = roundTo5(s);
        return { ...r, sample: s };
      });
      const minABG = { "0.25kHz": 20, "0.5kHz": 25, "1kHz": 25, "2kHz": 20, "4kHz": 15, "8kHz": 10 };
      profData = acShifted.map((r) => {
        if (!isBCFreq(r.freq) || r.sampleBC == null) return r; const gapMin = minABG[r.freq] ?? 0;
        const gap = (r.sample ?? 0) - (r.sampleBC ?? 0);
        if (gapMin>0 && gap < gapMin) {
          const raised = clamp((r.sample ?? 0) + (gapMin-gap), LIMITS_AC[r.freq].min, LIMITS_AC[r.freq].max);
          return { ...r, sample: roundTo5(raised) };
        }
        return r;
      });
    }
    // === SNHL-specific BC NR rule (apply to ALL SNHL_*) ===
    if ((profile + "").startsWith("SNHL_")) {
      const TH = {
        "0.25kHz": 55,
        "0.5kHz": 65,
        "1kHz": 70,
        "2kHz": 70,
        "4kHz": 60,
      };
      profData = profData.map((r) => {
        if (isBCFreq(r.freq) && typeof r.sample === "number" && TH[r.freq] != null && LIMITS_BC[r.freq]) {
          if (r.sample > TH[r.freq]) {
            // NRはデバイス上限ではなく、周波数別しきい値で表示
            const th = TH[r.freq];
            return { ...r, sampleBC: roundTo5(th), soBC: true };
          }
        }
        return r;
      });
    }

    return profData;
  }, [sex, age, seed, profile, severity]);

  // === Auto Y-axis scaling (audiogram style: top = good hearing) ===
  const { yMin, yMax } = useMemo(() => {
    const vals = [];
    for (const d of data) {
      if (typeof d.sample === 'number') vals.push(d.sample);
      if (typeof d.sampleBC === 'number') vals.push(d.sampleBC);
      // include bands for safety
      vals.push(d.median, d.minus2SD, d.plus2SD);
    }
    if (vals.length === 0) return { yMin: -10, yMax: 110 };
    const vmin = Math.min(...vals);
    const vmax = Math.max(...vals);
    const pad = 10; // dB padding
    const rawMin = Math.floor((vmin - pad) / 5) * 5;
    const rawMax = Math.ceil((vmax + pad) / 5) * 5;
    // global clamps (clinical)
    const clampedMin = Math.max(-10, rawMin);
    const clampedMax = Math.min(120, rawMax);
    return { yMin: clampedMin, yMax: clampedMax };
  }, [data]);

  // 症例生成があれば、それを優先して両耳用のチャートデータを作る
  const chartData = useMemo(() => {
    if (!genCase) {
      // 既存単耳データ→右耳としてマップ
      return data.map(d => ({
        ...d,
        sampleR: d.sample,
        sampleBCR: d.sampleBC,
        soACR: d.soAC,
        soBCR: d.soBC,
      }));
    }
    // エンジン出力をチャート行に整形
    const rightMap = Object.fromEntries(genCase.right.map(r => [r.freq, r]));
    const leftMap = Object.fromEntries(genCase.left.map(r => [r.freq, r]));
    return FREQS.map(f => {
      const base = getBand(genCase.meta.sex || sex, genCase.meta.ageGroup || age, f);
      const r = rightMap[f] || {};
      const l = leftMap[f] || {};
      return {
        freq: f,
        median: base.median,
        minus2SD: base.minus2SD,
        plus2SD: base.plus2SD,
        sampleR: r.ac ?? null,
        sampleBCR: r.bc ?? null,
        soACR: r.soAC || false,
        soBCR: r.soBC || false,
        sampleL: l.ac ?? null,
        sampleBCL: l.bc ?? null,
        soACL: l.soAC || false,
        soBCL: l.soBC || false,
      };
    });
  }, [data, genCase, sex, age]);

  return (
    <div className="min-h-screen w-full bg-white text-gray-900 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">ISO7029 正常値デモ（中央値 & ±2SD）</h1>
        <p className="text-sm text-gray-600 mb-4">
          まず <b>正常（年齢相応）</b> の帯域を可視化し、サンプル閾値（5 dB step）を生成。ここで仕様を詰めてから Cursor に移行し、病型（SNHL/CHL/Mixed）を追加します。
        </p>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-sm">性別：</label>
          <select className="border rounded px-2 py-1" value={sex} onChange={e=>setSex(e.target.value)}>
            {SEXES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <label className="text-sm ml-4">年代：</label>
          <select className="border rounded px-2 py-1" value={age} onChange={e=>setAge(e.target.value)}>
            {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Mode & Severity */}
          <label className="text-sm ml-4">モード：</label>
          <select className="border rounded px-2 py-1" value={profile} onChange={e=>setProfile(e.target.value)}>
            {PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {profile !== "Normal" && (
            <label className="text-sm ml-2 flex items-center gap-2">
              重症度：
              <input type="range" min={0} max={3} step={1} value={severity} onChange={e=>setSeverity(parseInt(e.target.value))} />
              <span className="text-xs">{["なし","軽度","中等度","重度"][severity]}</span>
            </label>
          )}

          <label className="ml-4 text-sm flex items-center gap-2">
            <input type="checkbox" checked={showBands} onChange={e=>setShowBands(e.target.checked)} /> 帯域（中央値/±2SD）を表示
          </label>

          <button className="ml-auto border rounded px-3 py-1 hover:bg-gray-50" onClick={()=>setSeed(s=>s+1)}>サンプル再生成</button>
        </div>

        <div className="bg-gray-50 border rounded-2xl p-4 shadow-sm">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                {Number.isFinite(yMin) && Number.isFinite(yMax) && yMin <= 0 && 0 <= yMax && (
                  <ReferenceLine y={0} strokeWidth={3} stroke="#000" />
                )}
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="freq" />
                <YAxis domain={[yMin, yMax]} reversed ticks={(() => { const n = Math.floor((yMax - yMin)/5) + 1; return Array.from({length: Math.max(1, n)}, (_, i) => yMin + i*5); })()} tickFormatter={(v)=> Math.round(v)} />
                <Tooltip formatter={(v, n, p)=> {
                  const name = (typeof n === 'string') ? n : '';
                  const isBC = name.includes('BC');
                  const isRight = name.includes('(R)');
                  const so = isBC
                    ? (isRight ? p?.payload?.soBCR : p?.payload?.soBCL)
                    : (isRight ? p?.payload?.soACR : p?.payload?.soACL);
                  return so ? `≥ ${v} dB HL (NR)` : `${v} dB HL`;
                }} />
                <Legend />
                {showBands && (
                  <>
                    <Line type="monotone" dataKey="median" name="Median" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="minus2SD" name="−2SD" strokeDasharray="6 4" />
                    <Line type="monotone" dataKey="plus2SD" name="＋2SD" strokeDasharray="6 4" />
                  </>
                )}
                {/* 右耳（赤） */}
                <Line type="monotone" dataKey="sampleR" name="AC ○ (R)" stroke="#c00" strokeOpacity={0} dot={(p)=> {
                  if (p?.payload?.soACR) {
                    return (
                      <svg x={p.cx-7} y={p.cy-3} width={14} height={18}>
                        <path d="M7 0 L7 12" stroke="#c00" strokeWidth={2} fill="none" />
                        <path d="M1 12 L7 18 L13 12" stroke="#c00" strokeWidth={2} fill="none" />
                      </svg>
                    );
                  }
                  return (
                    <svg x={p.cx-5} y={p.cy-5} width={10} height={10}>
                      <circle cx={5} cy={5} r={5} stroke="#c00" strokeWidth={2} fill="none" />
                    </svg>
                  );
                }} />
                <Line type="monotone" dataKey="sampleBCR" name={"BC \u003C (R)"} stroke="#c00" strokeOpacity={0} dot={(p)=> {
                  if (p?.payload?.soBCR) {
                    return (
                      <svg x={p.cx-7} y={p.cy-3} width={14} height={18}>
                        <path d="M7 0 L7 12" stroke="#c00" strokeWidth={2} fill="none" />
                        <path d="M1 12 L7 18 L13 12" stroke="#c00" strokeWidth={2} fill="none" />
                      </svg>
                    );
                  }
                  return (
                    <svg x={p.cx-7} y={p.cy-7} width={14} height={14}>
                      <path d="M12,1 L2,7 L12,13" stroke="#c00" strokeWidth={2} fill="none" />
                    </svg>
                  );
                }} />

                {/* 左耳（青） */}
                <Line type="monotone" dataKey="sampleL" name="AC × (L)" stroke="#06c" strokeOpacity={0} dot={(p)=> {
                  if (p?.payload?.soACL) {
                    return (
                      <svg x={p.cx-7} y={p.cy-3} width={14} height={18}>
                        <path d="M7 0 L7 12" stroke="#06c" strokeWidth={2} fill="none" />
                        <path d="M1 12 L7 18 L13 12" stroke="#06c" strokeWidth={2} fill="none" />
                      </svg>
                    );
                  }
                  // 左AC: × マーカー
                  return (
                    <svg x={p.cx-6} y={p.cy-6} width={12} height={12}>
                      <path d="M1,1 L11,11" stroke="#06c" strokeWidth={2} />
                      <path d="M11,1 L1,11" stroke="#06c" strokeWidth={2} />
                    </svg>
                  );
                }} />
                <Line type="monotone" dataKey="sampleBCL" name={"BC \u003E (L)"} stroke="#06c" strokeOpacity={0} dot={(p)=> {
                  if (p?.payload?.soBCL) {
                    return (
                      <svg x={p.cx-7} y={p.cy-3} width={14} height={18}>
                        <path d="M7 0 L7 12" stroke="#06c" strokeWidth={2} fill="none" />
                        <path d="M1 12 L7 18 L13 12" stroke="#06c" strokeWidth={2} fill="none" />
                      </svg>
                    );
                  }
                  // 左BC: 山括弧の反転（>）
                  return (
                    <svg x={p.cx-7} y={p.cy-7} width={14} height={14}>
                      <path d="M2,1 L12,7 L2,13" stroke="#06c" strokeWidth={2} fill="none" />
                    </svg>
                  );
                }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            className="border rounded px-3 py-1 hover:bg-gray-50"
            onClick={() => {
              const caseData = generateAudiogram({ profile: profile, severity: severity, sex: sex, ageGroup: age });
              setGenCase(caseData);
              console.log("[Generated Case]", caseData);
            }}
          >ランダム症例（両耳）生成</button>
          {genCase && (
            <button
              className="border rounded px-3 py-1 hover:bg-gray-50"
              onClick={() => setGenCase(null)}
            >生成オフ（単耳デモに戻す）</button>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-600">
          <ul className="list-disc pl-5 space-y-1">
            <li>Y軸は<strong>上が良聴（小さい dB HL）</strong>のオージオグラム向きに反転し、生成値に合わせて<strong>自動スケーリング</strong>します（余白±10 dB, −10〜120 dB内でクリップ）。</li>
            <li>サンプルは中央値の±0.5SD程度で生成し、±2SDでクリップ、5 dB ステップに丸め。</li>
            <li>このCanvasで UI/挙動をすり合わせ → 問題なければ Cursor に移行し、SNHL/CHL/Mixed をプロファイルとして追加します。</li>
            <li>125 HzはISO7029の係数がないため、<strong>250 Hzの帯域をミラー</strong>して表示・サンプル生成に使用（マスキング計算には含めない方針A）。</li>
            <li>出力は<strong>周波数別の上限・下限（AC/BC）</strong>でクリップ→最終のみ<strong>5 dB丸め</strong>。現状のデモはACの上限下限を適用中（BCは将来の骨導出力用に表だけ定義）。</li>
            <li><strong>スケールアウト（NR）表現</strong>：オージオメータ上限を超える推定が出た場合は、該当周波数に<strong>下向き矢印</strong>を描画し、ツールチップに <code>≥ dB HL (NR)</code> と表示します。AC/BCともにNR矢印で表示（BCは測定周波数のみ）。SNHL全般でも AC&gt;70 dB 時の周波数別しきいに基づくBC NR規則を適用しています。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}


