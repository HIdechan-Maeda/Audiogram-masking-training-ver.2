/**
 * 医学検査向け：聴力像自動生成の仕様適合検証
 * - 要因組合せグリッド（プロファイル×年齢×性別×程度×seed）
 * - 適用対象別の分母、記述統計、程度の順序性
 * 実行: npm run verify:audiogram
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  MIN_ABG,
  checkRounding,
  checkLimits,
  countLimitPoints,
  checkMinAbg,
  checkSnhlBcCap,
  checkNoiseNotch,
  checkSuddenLaterality,
  checkMumpsSeverityFloor,
  hasCarhartGeometry,
  checkAomMixed,
  checkNormalAbgNotExcessive,
  diseasedEar,
  meanAC,
  earRows,
  abg,
  BC_FREQS,
  CARHART_RATE_LO,
  CARHART_RATE_HI,
  AOM_MIXED_RATE_LO,
  AOM_MIXED_RATE_HI,
  SUDDEN_MIN_LATERALITY_DB,
} from './lib/audiogramRuleChecks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs/pilot-study/verification');
const cacheDir = path.join(root, 'scripts/.cache');
const cacheEngine = path.join(cacheDir, 'generateAudiogram.mjs');

fs.mkdirSync(cacheDir, { recursive: true });
{
  const src = fs.readFileSync(path.join(root, 'src/engine/generateAudiogram.js'), 'utf8');
  const oldImp = 'import ISO_DATA from "../data/iso7029_age_hearing_thresholds_2sd.json";';
  const newImp = `import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ISO_DATA = JSON.parse(readFileSync(join(__dirname, "../../src/data/iso7029_age_hearing_thresholds_2sd.json"), "utf8"));`;
  if (!src.includes(oldImp)) throw new Error('ISO import line missing');
  fs.writeFileSync(cacheEngine, src.replace(oldImp, newImp));
}

const {
  generateAudiogram,
  CARHART_EXPRESSION_PROB,
  AOM_MIXED_PROB,
  EngineConstants,
} = await import(pathToFileURL(cacheEngine).href + '?t=' + Date.now());

const PROFILES = EngineConstants.PROFILES;
const AGE_GROUPS = EngineConstants.AGE_GROUPS;
const SEXES = EngineConstants.SEXES;
const SEVERITIES = [0, 1, 2, 3];
const GRID_SEEDS = 20;
const FOCUS_N = 200;

const SNHL = PROFILES.filter((p) => p.startsWith('SNHL_'));
const CHL = PROFILES.filter((p) => p.startsWith('CHL_'));

function wilsonCI(k, n, z = 1.96) {
  if (!n) return [null, null];
  const p = k / n;
  const den = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / den;
  const margin = (z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / den;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function quantiles(arr) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const q = (p) => {
    const i = (a.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    if (lo === hi) return a[lo];
    return a[lo] * (hi - i) + a[hi] * (i - lo);
  };
  return {
    n: a.length,
    min: a[0],
    q25: q(0.25),
    median: q(0.5),
    q75: q(0.75),
    max: a[a.length - 1],
    mean: a.reduce((s, v) => s + v, 0) / a.length,
  };
}

function seedFor(profile, ageGroup, sex, severity, s) {
  return 1_000_000
    + PROFILES.indexOf(profile) * 100_000
    + AGE_GROUPS.indexOf(ageGroup) * 10_000
    + SEXES.indexOf(sex) * 1_000
    + severity * 100
    + s;
}

const results = [];
function add(id, label, ok, n, note = '', opts = {}) {
  const descriptive = Boolean(opts.descriptive);
  const rate = descriptive || n == null ? null : (n ? Math.round((1000 * ok) / n) / 10 : 0);
  results.push({ id, label, ok, n, rate, note, descriptive });
  if (descriptive) console.log(`${id} ${label}: —（記述） ${note}`);
  else console.log(`${id} ${label}: ${ok}/${n} (${rate}%) ${note}`);
}

function isFullAcSo(caseData) {
  const { diseased } = diseasedEar(caseData);
  const acFreqs = ['0.125kHz', '0.25kHz', '0.5kHz', '1kHz', '2kHz', '4kHz', '8kHz'];
  return acFreqs.every((f) => diseased.find((r) => r.freq === f)?.soAC);
}

function meanBandHasSo(caseData) {
  const { diseased, contra } = diseasedEar(caseData);
  const freqs = ['0.5kHz', '1kHz', '2kHz'];
  return freqs.some((f) => diseased.find((r) => r.freq === f)?.soAC)
    || freqs.some((f) => contra.find((r) => r.freq === f)?.soAC);
}

// ---------- 要因組合せグリッド（適用対象別） ----------
const counters = {
  total: 0,
  metaOk: 0,
  roundCaseOk: 0,
  roundPointOk: 0,
  roundPointN: 0,
  limitCaseOk: 0,
  limitPointOk: 0,
  limitPointN: 0,
  normalN: 0,
  normalOk: 0,
  snhlN: 0,
  snhlOk: 0,
  chlN: 0,
  chlOk: 0,
  noiseN: 0,
  noiseOk: 0,
  carhartExprN: 0,
  carhartGeomOk: 0,
  aomSevN: 0,
  aomMixedN: 0,
  aomMixedOk: 0,
  abgVals: [],
  abgByPattern: {
    CHL_OME: [],
    CHL_AOM_conductive: [],
    CHL_AOM_mixed: [],
    CHL_Otosclerosis: [],
    CHL_OssicularDiscontinuity: [],
  },
  noiseDepths: [],
  carhartDepths: [],
  unilateralDiffs: [],
  unilateralSudden: [],
  unilateralSuddenBySev: { 1: [], 2: [], 3: [] },
  unilateralMumps: [],
  unilateralMumpsBySev: { 1: [], 2: [], 3: [] },
  suddenLatN: 0,
  suddenLatOk: 0,
  suddenLatNoFullSoN: 0,
  suddenLatNoFullSoOk: 0,
  suddenLatSev3NoFullSoN: 0,
  suddenLatSev3NoFullSoOk: 0,
  mumpsFloorN: 0,
  mumpsFloorOk: 0,
  mumpsFloorNoFullSoN: 0,
  mumpsFloorNoFullSoOk: 0,
  mumpsFloorNoMeanSoN: 0,
  mumpsFloorNoMeanSoOk: 0,
  suddenSo: { none: 0, hf: 0, full: 0, bySev: { 1: { none: 0, hf: 0, full: 0 }, 2: { none: 0, hf: 0, full: 0 }, 3: { none: 0, hf: 0, full: 0 } } },
  mumpsFullSo: 0,
  mumpsN: 0,
  noiseDepths2: [],
  noiseDepths8: [],
  noiseDepthsMin: [],
};

for (const profile of PROFILES) {
  for (const ageGroup of AGE_GROUPS) {
    for (const sex of SEXES) {
      for (const severity of SEVERITIES) {
        for (let s = 0; s < GRID_SEEDS; s++) {
          const seed = seedFor(profile, ageGroup, sex, severity, s);
          const c = generateAudiogram({ sex, ageGroup, profile, severity, seed });
          counters.total += 1;

          const metaPass = c.meta.sex === sex
            && c.meta.ageGroup === ageGroup
            && c.meta.profile === profile
            && c.meta.severity === severity;
          if (metaPass) counters.metaOk += 1;

          let caseRoundOk = true;
          for (const side of ['right', 'left']) {
            for (const r of earRows(c, side)) {
              if (typeof r.ac === 'number') {
                counters.roundPointN += 1;
                if (r.ac % 5 === 0) counters.roundPointOk += 1;
                else caseRoundOk = false;
              }
              if (typeof r.bc === 'number') {
                counters.roundPointN += 1;
                if (r.bc % 5 === 0) counters.roundPointOk += 1;
                else caseRoundOk = false;
              }
            }
          }
          if (caseRoundOk) counters.roundCaseOk += 1;

          const limPts = countLimitPoints(c);
          counters.limitPointN += limPts.n;
          counters.limitPointOk += limPts.ok;
          if (checkLimits(c)) counters.limitCaseOk += 1;

          if (profile === 'Normal') {
            counters.normalN += 1;
            if (checkNormalAbgNotExcessive(c, 15)) counters.normalOk += 1;
          }
          if (profile.startsWith('SNHL_')) {
            counters.snhlN += 1;
            if (checkSnhlBcCap(c, profile)) counters.snhlOk += 1;
          }
          if (profile.startsWith('CHL_')) {
            counters.chlN += 1;
            if (checkMinAbg(c, profile)) counters.chlOk += 1;
            const { diseased } = diseasedEar(c);
            for (const r of diseased) {
              if (!BC_FREQS.has(r.freq)) continue;
              const g = abg(r);
              if (g != null) {
                counters.abgVals.push(g);
                if (profile === 'CHL_AOM') {
                  const key = c.meta?.aomMixedApplied ? 'CHL_AOM_mixed' : 'CHL_AOM_conductive';
                  counters.abgByPattern[key].push(g);
                } else if (counters.abgByPattern[profile]) {
                  counters.abgByPattern[profile].push(g);
                }
              }
            }
          }
          if (profile === 'SNHL_Sudden' && severity >= 1) {
            counters.suddenLatN += 1;
            const latOk = checkSuddenLaterality(c, SUDDEN_MIN_LATERALITY_DB);
            if (latOk) counters.suddenLatOk += 1;
            if (!isFullAcSo(c)) {
              counters.suddenLatNoFullSoN += 1;
              if (latOk) counters.suddenLatNoFullSoOk += 1;
              if (severity === 3) {
                counters.suddenLatSev3NoFullSoN += 1;
                if (latOk) counters.suddenLatSev3NoFullSoOk += 1;
              }
            }
          }
          if (profile === 'SNHL_Mumps' && severity >= 1) {
            counters.mumpsFloorN += 1;
            const floorOk = checkMumpsSeverityFloor(c);
            if (floorOk) counters.mumpsFloorOk += 1;
            if (!isFullAcSo(c)) {
              counters.mumpsFloorNoFullSoN += 1;
              if (floorOk) counters.mumpsFloorNoFullSoOk += 1;
            }
            if (!meanBandHasSo(c)) {
              counters.mumpsFloorNoMeanSoN += 1;
              if (floorOk) counters.mumpsFloorNoMeanSoOk += 1;
            }
          }
          if (profile === 'CHL_AOM' && severity >= 1) {
            counters.aomSevN += 1;
            if (c.meta.aomMixedApplied) {
              counters.aomMixedN += 1;
              if (checkAomMixed(c)) counters.aomMixedOk += 1;
            }
          }
          if (profile === 'SNHL_NoiseNotch' && severity >= 1) {
            counters.noiseN += 1;
            const ok = checkNoiseNotch(c);
            if (ok) counters.noiseOk += 1;
            const rows = earRows(c, 'right');
            const ac2 = rows.find((r) => r.freq === '2kHz')?.ac;
            const ac4 = rows.find((r) => r.freq === '4kHz')?.ac;
            const ac8 = rows.find((r) => r.freq === '8kHz')?.ac;
            if (typeof ac2 === 'number' && typeof ac4 === 'number') {
              const d2 = ac4 - ac2;
              counters.noiseDepths.push(d2);
              counters.noiseDepths2.push(d2);
              if (typeof ac8 === 'number') {
                const d8 = ac4 - ac8;
                counters.noiseDepths8.push(d8);
                counters.noiseDepthsMin.push(Math.min(d2, d8));
              }
            }
          }
          if (profile === 'CHL_Otosclerosis' && severity >= 1 && c.meta.carhartApplied) {
            counters.carhartExprN += 1;
            const { diseased } = diseasedEar(c);
            if (hasCarhartGeometry(diseased)) counters.carhartGeomOk += 1;
            const bc1 = diseased.find((r) => r.freq === '1kHz')?.bc;
            const bc2 = diseased.find((r) => r.freq === '2kHz')?.bc;
            const bc4 = diseased.find((r) => r.freq === '4kHz')?.bc;
            if ([bc1, bc2, bc4].every((v) => typeof v === 'number')) {
              counters.carhartDepths.push(bc2 - (bc1 + bc4) / 2);
            }
          }
          if ((profile === 'SNHL_Sudden' || profile === 'SNHL_Mumps') && severity >= 1) {
            const { diseased, contra } = diseasedEar(c);
            const d = meanAC(diseased, ['0.5kHz', '1kHz', '2kHz']);
            const n = meanAC(contra, ['0.5kHz', '1kHz', '2kHz']);
            if (d != null && n != null) {
              const diff = d - n;
              counters.unilateralDiffs.push(diff);
              if (profile === 'SNHL_Sudden') {
                counters.unilateralSudden.push(diff);
                if (severity >= 1 && severity <= 3) counters.unilateralSuddenBySev[severity].push(diff);
              }
              if (profile === 'SNHL_Mumps') {
                counters.unilateralMumps.push(diff);
                if (severity >= 1 && severity <= 3) counters.unilateralMumpsBySev[severity].push(diff);
              }
            }
          }
          if (profile === 'SNHL_Sudden' && severity >= 1) {
            const mode = c.meta?.suddenSoMode || 'none';
            if (counters.suddenSo[mode] != null) counters.suddenSo[mode] += 1;
            if (counters.suddenSo.bySev[severity]) {
              counters.suddenSo.bySev[severity][mode] =
                (counters.suddenSo.bySev[severity][mode] || 0) + 1;
            }
          }
          if (profile === 'SNHL_Mumps' && severity >= 1) {
            counters.mumpsN += 1;
            const { diseased } = diseasedEar(c);
            const acFreqs = ['0.125kHz', '0.25kHz', '0.5kHz', '1kHz', '2kHz', '4kHz', '8kHz'];
            if (acFreqs.every((f) => diseased.find((r) => r.freq === f)?.soAC)) {
              counters.mumpsFullSo += 1;
            }
          }
        }
      }
    }
  }
}

add('G0', '要因組合せ・合成閾値セット数', counters.total, counters.total,
  `10プロファイル(正常1+疾患9)×6年齢×2性別×4程度×20seed`);
add('G1', '条件反映（症例単位）', counters.metaOk, counters.total);
add('G2a', '5 dB丸め（症例単位：全閾値が5の倍数）', counters.roundCaseOk, counters.total);
add('G2b', '5 dB丸め（閾値点単位）', counters.roundPointOk, counters.roundPointN);
add('G4a', '周波数別上下限（症例単位：数値閾値がP4範囲内）', counters.limitCaseOk, counters.total,
  '境界値＝上下限一致は適合。超過・下回は不適合');
add('G4b', '周波数別上下限（閾値点単位）', counters.limitPointOk, counters.limitPointN);
add('G3-Normal', 'Normal: 過大ABGなし（症例単位）', counters.normalOk, counters.normalN);
add('G3-SNHL', '感音: BC≤AC+5（症例単位）', counters.snhlOk, counters.snhlN);
add('G3-CHL', '伝音系4パターン: 最小ABG（症例単位。急性中耳炎の混合型を含む）', counters.chlOk, counters.chlN);
add('G3-Noise', 'C5-dip: 4k≥2k+10 かつ 4k≥8k+10（程度≥1）', counters.noiseOk, counters.noiseN,
  'Coles参考の著者設定（10 dB床）');
add('G3-SuddenLat', `突発一側差≥${SUDDEN_MIN_LATERALITY_DB} dB（程度≥1・0.5/1/2 kHz平均）`,
  counters.suddenLatOk, counters.suddenLatN);
add('G3-MumpsFloor', 'ムンプス: 病側meanAC≥70 かつ 一側差≥55（程度≥1）',
  counters.mumpsFloorOk, counters.mumpsFloorN);
add('G3-CarhartGeom', 'Carhart様幾何（発現例のみ）', counters.carhartGeomOk, counters.carhartExprN);
add('G3-AOM-Mixed', 'AOM混合型: 4k BC>0.5k BC（付与例）', counters.aomMixedOk, counters.aomMixedN);

// ---------- 焦点・記述統計 ----------
{
  const diffs = [];
  let ok = 0;
  for (let i = 0; i < FOCUS_N; i++) {
    const young = generateAudiogram({ sex: 'Male', ageGroup: '20s', profile: 'SNHL_Age', severity: 2, seed: 21000 + i });
    const old = generateAudiogram({ sex: 'Male', ageGroup: '70s', profile: 'SNHL_Age', severity: 2, seed: 22000 + i });
    const y = meanAC(earRows(young), ['4kHz', '8kHz']);
    const o = meanAC(earRows(old), ['4kHz', '8kHz']);
    if (y != null && o != null) {
      diffs.push(o - y);
      if (o >= y) ok += 1;
    }
  }
  const q = quantiles(diffs);
  add('T1', '年齢効果 SNHL_Age（70s−20s, 4–8k平均AC）', ok, FOCUS_N,
    `差の中央値 ${q.median.toFixed(1)} dB (IQR ${q.q25.toFixed(1)}–${q.q75.toFixed(1)})`);
}

// 程度の順序性：正常以外。同一seedで severity のみ変える。
// 一側性は患側を固定（severity変更で乱数位相がずれ患側が入れ替わるのを防ぐ）
{
  const unilateral = new Set(['SNHL_Sudden', 'SNHL_Meniere', 'SNHL_Mumps', 'CHL_OssicularDiscontinuity', 'CHL_AOM']);
  const targets = PROFILES.filter((p) => p !== 'Normal');
  let cells = 0;
  let okCells = 0;
  const notes = [];
  for (const profile of targets) {
    let localOk = 0;
    let localN = 0;
    for (const ageGroup of AGE_GROUPS) {
      for (const sex of SEXES) {
        for (let s = 0; s < 5; s++) {
          const baseSeed = seedFor(profile, ageGroup, sex, 0, s) + 777;
          const means = [];
          const abgs = [];
          let sideFlip = false;
          let lastSide = null;
          for (const severity of SEVERITIES) {
            const opts = { sex, ageGroup, profile, severity, seed: baseSeed };
            if (unilateral.has(profile)) opts.affectedSide = 'R';
            const c = generateAudiogram(opts);
            const side = c.meta?.affectedSide || null;
            if (lastSide != null && side != null && side !== lastSide) sideFlip = true;
            lastSide = side;
            const { diseased } = diseasedEar(c);
            const m = meanAC(diseased, ['0.5kHz', '1kHz', '2kHz']);
            // 全点SO等で mean が null → 不適合（判定不能を合格にしない）
            means.push(m);
            if (profile.startsWith('CHL_')) {
              const gs = diseased
                .filter((r) => ['0.5kHz', '1kHz'].includes(r.freq))
                .map(abg)
                .filter((g) => g != null);
              abgs.push(gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null);
            }
          }
          localN += 1;
          cells += 1;
          let pass = !sideFlip
            && means.every((m) => m != null)
            && means[0] <= means[1] + 1e-9
            && means[1] <= means[2] + 1e-9
            && means[2] <= means[3] + 1e-9;
          if (profile.startsWith('CHL_')) {
            pass = pass && abgs.every((g) => g != null)
              && abgs[0] <= abgs[1] + 1e-9
              && abgs[1] <= abgs[2] + 1e-9
              && abgs[2] <= abgs[3] + 1e-9;
          }
          if (pass) {
            localOk += 1;
            okCells += 1;
          }
        }
      }
    }
    notes.push(`${profile}:${localOk}/${localN}`);
  }
  add('T8', '程度の非減少（正常以外・同一seed・一側は患側固定）', okCells, cells, notes.join('; '));
}

{
  let ok = 0;
  const diffs = [];
  for (let i = 0; i < FOCUS_N; i++) {
    const c = generateAudiogram({ sex: 'Male', ageGroup: '50s', profile: 'SNHL_Sudden', severity: 2, seed: 70000 + i });
    const { diseased, contra } = diseasedEar(c);
    const d = meanAC(diseased, ['0.5kHz', '1kHz', '2kHz']);
    const n = meanAC(contra, ['0.5kHz', '1kHz', '2kHz']);
    if (d != null && n != null) {
      diffs.push(d - n);
      if (d - n >= SUDDEN_MIN_LATERALITY_DB - 1e-9) ok += 1;
    }
  }
  const q = quantiles(diffs);
  add('T7', `Sudden一側差≥${SUDDEN_MIN_LATERALITY_DB} dB（焦点: 程度2固定）`, ok, FOCUS_N,
    q ? `焦点差中央値 ${q.median.toFixed(1)} dB（グリッドの程度≥1規則と同じ30 dB床）` : '');
}

{
  let expressed = 0;
  let geomOk = 0;
  const N = FOCUS_N;
  for (let i = 0; i < N; i++) {
    const c = generateAudiogram({
      sex: 'Female', ageGroup: '30s', profile: 'CHL_Otosclerosis', severity: 2, seed: 60000 + i,
    });
    if (!c.meta.carhartApplied) continue;
    expressed += 1;
    if (hasCarhartGeometry(diseasedEar(c).diseased)) geomOk += 1;
  }
  const [lo, hi] = wilsonCI(expressed, N);
  const inBand = expressed / N >= CARHART_RATE_LO && expressed / N <= CARHART_RATE_HI;
  add('T6a', `Carhart様・付与の有無（期待${CARHART_EXPRESSION_PROB * 100}%）`,
    expressed, N,
    `同じ200件での付与 ${expressed}/${N}=${(100 * expressed / N).toFixed(1)}% (95%CI ${(100 * lo).toFixed(1)}–${(100 * hi).toFixed(1)}%)。許容帯70–90%は凍結正解表で事前設定。95%CIはWilson法。${inBand ? '帯内のため試験合格' : '帯から逸脱'}`);
  add('T6b', 'Carhart様・付与例の形（T6aと同じ200件）', geomOk, expressed,
    `T6aで付与された${expressed}件の形（${geomOk}/${expressed}）`);
}

{
  let mixed = 0;
  let geomOk = 0;
  const N = FOCUS_N;
  for (let i = 0; i < N; i++) {
    const c = generateAudiogram({
      sex: 'Male', ageGroup: '20s', profile: 'CHL_AOM', severity: 2, seed: 62000 + i, affectedSide: 'R',
    });
    if (!c.meta.aomMixedApplied) continue;
    mixed += 1;
    if (checkAomMixed(c)) geomOk += 1;
  }
  const [lo, hi] = wilsonCI(mixed, N);
  const inBand = mixed / N >= AOM_MIXED_RATE_LO && mixed / N <= AOM_MIXED_RATE_HI;
  add('T6c', `AOM混合型・付与の有無（教育用${AOM_MIXED_PROB * 100}%）`,
    mixed, N,
    `同じ200件での付与 ${mixed}/${N}=${(100 * mixed / N).toFixed(1)}% (95%CI ${(100 * lo).toFixed(1)}–${(100 * hi).toFixed(1)}%)。許容帯40–60%は凍結正解表で事前設定。95%CIはWilson法。${inBand ? '帯内のため試験合格' : '帯から逸脱'}。臨床発生率ではない`);
  add('T6d', 'AOM混合型・付与例の形（T6cと同じ200件）', geomOk, mixed,
    `T6cで付与された${mixed}件の形（${geomOk}/${mixed}）`);
}

{
  let ok = 0;
  for (let i = 0; i < FOCUS_N; i++) {
    const seed = 100000 + i;
    const a = generateAudiogram({ sex: 'Male', ageGroup: '50s', profile: 'SNHL_NoiseNotch', severity: 2, seed });
    const b = generateAudiogram({ sex: 'Male', ageGroup: '50s', profile: 'SNHL_NoiseNotch', severity: 2, seed });
    if (JSON.stringify(a.right) === JSON.stringify(b.right)
      && JSON.stringify(a.left) === JSON.stringify(b.left)) ok += 1;
  }
  add('T10', 'seed固定の決定論的再現（不一致0を目標）', ok, FOCUS_N, `不一致 ${FOCUS_N - ok}`);
}

{
  // T11: 同一条件・異seedの出力多様性（記述統計。全件不一致は要求しない＝5 dB丸め）
  const conds = [
    { sex: 'Male', ageGroup: '50s', profile: 'SNHL_NoiseNotch', severity: 2, seed0: 80000 },
    { sex: 'Female', ageGroup: '40s', profile: 'CHL_OME', severity: 2, seed0: 81000 },
    { sex: 'Male', ageGroup: '40s', profile: 'Normal', severity: 0, seed0: 82000 },
  ];
  const notes = [];
  for (const cond of conds) {
    const fps = new Set();
    let adjDiff = 0;
    let prev = null;
    for (let i = 0; i < FOCUS_N; i++) {
      const c = generateAudiogram({
        sex: cond.sex, ageGroup: cond.ageGroup, profile: cond.profile,
        severity: cond.severity, seed: cond.seed0 + i,
      });
      const fp = JSON.stringify({ r: c.right, l: c.left });
      fps.add(fp);
      if (prev != null && prev !== fp) adjDiff += 1;
      prev = fp;
    }
    notes.push(`${cond.profile}:ユニーク${fps.size}/${FOCUS_N}・隣接不一致${adjDiff}/${FOCUS_N - 1}`);
  }
  add('T11', '同一条件・異seedの出力多様性（記述・合否基準なし）', null, null,
    `3条件各200件。全件不一致は非要求（5 dB丸め）。${notes.join('; ')}`, { descriptive: true });
}

const descriptive = {
  chlAbg: quantiles(counters.abgVals),
  chlAbgByPattern: Object.fromEntries(
    Object.entries(counters.abgByPattern).map(([k, arr]) => [k, quantiles(arr)]),
  ),
  noiseDepth: quantiles(counters.noiseDepths),
  noiseDepthVs2k: quantiles(counters.noiseDepths2),
  noiseDepthVs8k: quantiles(counters.noiseDepths8),
  noiseDepthMinBoth: quantiles(counters.noiseDepthsMin),
  carhartDepth: quantiles(counters.carhartDepths),
  unilateralDiff: quantiles(counters.unilateralDiffs),
  unilateralSudden: quantiles(counters.unilateralSudden),
  unilateralSuddenSev1: quantiles(counters.unilateralSuddenBySev[1]),
  unilateralSuddenSev2: quantiles(counters.unilateralSuddenBySev[2]),
  unilateralSuddenSev3: quantiles(counters.unilateralSuddenBySev[3]),
  unilateralMumps: quantiles(counters.unilateralMumps),
  unilateralMumpsSev1: quantiles(counters.unilateralMumpsBySev[1]),
  unilateralMumpsSev2: quantiles(counters.unilateralMumpsBySev[2]),
  unilateralMumpsSev3: quantiles(counters.unilateralMumpsBySev[3]),
  suddenSo: counters.suddenSo,
  floorWithoutSo: {
    suddenLatNoFullSo: { ok: counters.suddenLatNoFullSoOk, n: counters.suddenLatNoFullSoN },
    suddenLatSev3NoFullSo: { ok: counters.suddenLatSev3NoFullSoOk, n: counters.suddenLatSev3NoFullSoN },
    mumpsFloorNoFullSo: { ok: counters.mumpsFloorNoFullSoOk, n: counters.mumpsFloorNoFullSoN },
    mumpsFloorNoMeanSo: { ok: counters.mumpsFloorNoMeanSoOk, n: counters.mumpsFloorNoMeanSoN },
  },
  mumpsFullSoRate: counters.mumpsN
    ? { n: counters.mumpsN, full: counters.mumpsFullSo, rate: counters.mumpsFullSo / counters.mumpsN }
    : null,
  aomMixed: {
    nSevGe1: counters.aomSevN,
    mixed: counters.aomMixedN,
    rate: counters.aomSevN ? counters.aomMixedN / counters.aomSevN : null,
    geomOk: counters.aomMixedOk,
  },
};

const summary = {
  generatedAt: new Date().toISOString(),
  unitNote: '適合率は原則「症例（合成閾値セット）単位」。G2b・G4bのみ閾値点単位。',
  grid: {
    profiles: PROFILES.length,
    profileBreakdown: '正常1 + 疾患相当9',
    ages: AGE_GROUPS,
    sexes: SEXES,
    severities: SEVERITIES,
    seedsPerCell: GRID_SEEDS,
    seedIndexRange: '各セル s=0..19（決定論的seed式）',
    expectedCases: counters.total,
  },
  carhart: {
    expectedProb: CARHART_EXPRESSION_PROB,
    mechanism: 'seed付き一様乱数によるBernoulli試行（rand()<0.8）。決定論的に80%へ割付してはいない。',
  },
  descriptive,
  results,
  runtime: {
    platform: process.platform,
    node: process.version,
    packageName: 'audioscope-edu',
    packageVersion: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  },
  overallPass: results.every((r) => {
    if (r.descriptive || r.id === 'T6a' || r.id === 'T6c' || r.id === 'T11') return true;
    if (r.id.startsWith('G') || r.id.startsWith('T')) return r.ok === r.n || r.rate >= 99.5;
    return true;
  }),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'IgakuKensa_verification_results.json'), JSON.stringify(summary, null, 2));

const fmtQ = (q, unit = 'dB') => (q
  ? `n=${q.n}, 中央値${q.median.toFixed(1)}${unit} (IQR ${q.q25.toFixed(1)}–${q.q75.toFixed(1)}, 範囲 ${q.min.toFixed(1)}–${q.max.toFixed(1)})`
  : '—');

const md = [
  '# 聴力像自動生成・仕様適合検証結果',
  '',
  `- 実行日時: ${summary.generatedAt}`,
  `- 実行環境: Node ${summary.runtime.node} / ${summary.runtime.platform}`,
  `- 要因組合せ: ${PROFILES.length}プロファイル（正常1+疾患9）× ${AGE_GROUPS.length}年齢群 × ${SEXES.length}性別 × ${SEVERITIES.length}程度 × ${GRID_SEEDS} seed = **${counters.total}** 件の合成閾値セット`,
  `- 年齢群: ${AGE_GROUPS.join(', ')}`,
  `- 適合の単位: ${summary.unitNote}`,
  `- Carhart様: ${summary.carhart.mechanism}`,
  '',
  '## 適合率（適用対象別）',
  '',
  '| ID | 項目 | 適合 | 適用n | 率% | メモ |',
  '|----|------|------|-------|-----|------|',
  ...results.map((r) => {
    if (r.descriptive) return `| ${r.id} | ${r.label} | — | — | — | ${r.note} |`;
    return `| ${r.id} | ${r.label} | ${r.ok}/${r.n} | ${r.n} | ${r.rate} | ${r.note} |`;
  }),
  '',
  '## 記述統計（グリッド由来）',
  '',
  `- 伝音ABG（病側・BC周波数・一括）: ${fmtQ(descriptive.chlAbg)}`,
  `- 伝音ABG 滲出性中耳炎: ${fmtQ(descriptive.chlAbgByPattern.CHL_OME)}`,
  `- 伝音ABG 急性中耳炎・伝音型: ${fmtQ(descriptive.chlAbgByPattern.CHL_AOM_conductive)}`,
  `- 伝音ABG 急性中耳炎・混合型: ${fmtQ(descriptive.chlAbgByPattern.CHL_AOM_mixed)}`,
  `- 伝音ABG 耳硬化症: ${fmtQ(descriptive.chlAbgByPattern.CHL_Otosclerosis)}`,
  `- 伝音ABG 耳小骨連鎖離断パターン: ${fmtQ(descriptive.chlAbgByPattern.CHL_OssicularDiscontinuity)}`,
  `- C5-dipの深さ（4k−2k AC, 程度≥1）: ${fmtQ(descriptive.noiseDepthVs2k)}`,
  `- C5-dipの深さ（4k−8k AC, 程度≥1）: ${fmtQ(descriptive.noiseDepthVs8k)}`,
  `- C5-dipの深さ（min(4k−2k,4k−8k), 程度≥1）: ${fmtQ(descriptive.noiseDepthMinBoth)}`,
  `- AOM混合型（程度≥1）: ${descriptive.aomMixed.mixed}/${descriptive.aomMixed.nSevGe1} (${((descriptive.aomMixed.rate || 0) * 100).toFixed(1)}%)。付与例の4k BC>0.5k BCは ${descriptive.aomMixed.geomOk}/${descriptive.aomMixed.mixed}`,
  `- Carhart様の深さ（BC2−mean(BC1,BC4), 発現例）: ${fmtQ(descriptive.carhartDepth)}`,
  `- 一側差 Sudden（程度≥1 全体）: ${fmtQ(descriptive.unilateralSudden)}`,
  `- 一側差 Sudden 程度1: ${fmtQ(descriptive.unilateralSuddenSev1)}`,
  `- 一側差 Sudden 程度2: ${fmtQ(descriptive.unilateralSuddenSev2)}`,
  `- 一側差 Sudden 程度3: ${fmtQ(descriptive.unilateralSuddenSev3)}`,
  `- 一側差 Mumps（程度≥1）: ${fmtQ(descriptive.unilateralMumps)}`,
  `- 一側差 Mumps 程度1: ${fmtQ(descriptive.unilateralMumpsSev1)}`,
  `- 一側差 Mumps 程度2: ${fmtQ(descriptive.unilateralMumpsSev2)}`,
  `- 一側差 Mumps 程度3: ${fmtQ(descriptive.unilateralMumpsSev3)}`,
  `- Sudden SO（程度≥1）: なし${counters.suddenSo.none}件、高音域のみ${counters.suddenSo.hf}件、全周${counters.suddenSo.full}件`
    + `／程度1: なし${counters.suddenSo.bySev[1].none}・高音${counters.suddenSo.bySev[1].hf}・全周${counters.suddenSo.bySev[1].full}`
    + `／程度2: なし${counters.suddenSo.bySev[2].none}・高音${counters.suddenSo.bySev[2].hf}・全周${counters.suddenSo.bySev[2].full}`
    + `／程度3: なし${counters.suddenSo.bySev[3].none}・高音${counters.suddenSo.bySev[3].hf}・全周${counters.suddenSo.bySev[3].full}`,
  `- Mumps 全周SO（程度≥1）: ${counters.mumpsFullSo}/${counters.mumpsN}`
    + (counters.mumpsN ? ` (${(100 * counters.mumpsFullSo / counters.mumpsN).toFixed(1)}%)` : ''),
  `- 床規則（全周SO除外）: 突発一側差 ${counters.suddenLatNoFullSoOk}/${counters.suddenLatNoFullSoN}`
    + `、突発程度3 ${counters.suddenLatSev3NoFullSoOk}/${counters.suddenLatSev3NoFullSoN}`
    + `、ムンプス ${counters.mumpsFloorNoFullSoOk}/${counters.mumpsFloorNoFullSoN}`
    + `、ムンプス（0.5/1/2 kHzにSOなし） ${counters.mumpsFloorNoMeanSoOk}/${counters.mumpsFloorNoMeanSoN}`,
  `- 注: T7焦点は程度2・固定条件の200件。グリッドの程度≥1（720件）と同じ30 dB一側差床。SO点の数値処理は電子付録の指標定義を参照。`,
  `- Carhart様: seed付き一様乱数のBernoulli試行（発現確率80%）。決定論的80%割付ではない。グリッド発現 ${counters.carhartExprN}/720。許容帯は凍結正解表で事前設定、95%CIはWilson法。`,
  `- T8内訳: 正常以外9プロファイル × 6年齢 × 2性別 × 5 seed = 540セル`,
  `- T6a/T6b・T6c/T6d: それぞれ同じ200件での付与の有無とその形。`,
  `- T11: 記述のみ（合否基準なし）。`,
  '',
  '## 指標定義（SOの数値処理）',
  '',
  '- スケールアウト（SO）点は、当該周波数の教育用気導上限値を数値として保持し、SOフラグを付す。上限＋5 dB等の外挿代入は行わない。',
  '- 一側差・病側平均（0.5/1/2 kHz）の算出では、上記の数値（上限値）を含め、3周波がすべて有限である場合のみ平均する。いずれかが非数なら当該例は判定不能（主合否では不適合扱い）。',
  '- G3-SuddenLat / G3-MumpsFloor の分母720は、SO例を除外せず、SO点を上限値代入したうえで床規則を評価した結果である。全周SOを除いた適合率は記述統計に別掲する。',
  '',
  `実行: Node ${summary.runtime.node} / ${summary.runtime.platform} / ${summary.runtime.packageName}@${summary.runtime.packageVersion}`,
  '',].join('\n');

fs.writeFileSync(path.join(outDir, 'IgakuKensa_verification_results.md'), md);
console.log('\nWrote results');
console.log(JSON.stringify(descriptive, null, 2));
