/**
 * 検証関数の異常系テスト（意図的異常挿入）
 * - 著者が正解表（RULE_SPEC）に基づき事前定義した規則違反データを検証器へ入力する
 * - 生成プログラム本体の無作為書き換えではない／古典的ミューテーションテストではない
 * - 正常データが100%通るだけでは不十分 → 違反は必ず不適合にすること
 *
 * 実行: npm run verify:audiogram:mutations
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const cacheDir = path.join(__dirname, '.cache');
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

const { generateAudiogram } = await import(pathToFileURL(cacheEngine).href + '?t=' + Date.now());
const {
  checkRounding,
  checkLimits,
  checkMinAbg,
  checkSnhlBcCap,
  checkNoiseNotch,
  checkSuddenLaterality,
  checkMumpsSeverityFloor,
  checkNormalAbgNotExcessive,
  hasCarhartGeometry,
  checkAomMixed,
  diseasedEar,
  meanAC,
  earRows,
  LIMITS_AC,
  LIMITS_BC,
  NOISE_NOTCH_MIN_DEPTH_DB,
  SUDDEN_MIN_LATERALITY_DB,
} = await import('./lib/audiogramRuleChecks.mjs');

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function setAc(rows, freq, ac) {
  return rows.map((r) => (r.freq === freq ? { ...r, ac } : r));
}

function setBc(rows, freq, bc) {
  return rows.map((r) => (r.freq === freq ? { ...r, bc } : r));
}

function setAbg(rows, freq, gap) {
  return rows.map((r) => {
    if (r.freq !== freq || typeof r.bc !== 'number') return r;
    return { ...r, ac: r.bc + gap };
  });
}

function checkSuddenDiff(caseData, minDiff = SUDDEN_MIN_LATERALITY_DB) {
  return checkSuddenLaterality(caseData, minDiff);
}

/** S4相当: 程度系列の mean AC が非減少（null は不適合） */
function checkMeansNondecreasing(means) {
  if (!means.length || means.some((m) => m == null || !Number.isFinite(m))) return false;
  for (let i = 0; i < means.length - 1; i++) {
    if (means[i] > means[i + 1] + 1e-9) return false;
  }
  return true;
}

/** Normal に soAC/soBC がある＝著者定義では規定外スケールアウト */
function checkNormalNoScaleOut(caseData) {
  for (const side of ['right', 'left']) {
    for (const r of earRows(caseData, side)) {
      if (r.soAC || r.soBC) return false;
    }
  }
  return true;
}

function assertFail(id, label, pass) {
  if (pass) {
    console.error(`FAIL ${id}: expected REJECT but PASSED — ${label}`);
    return false;
  }
  console.log(`OK   ${id}: correctly rejected — ${label}`);
  return true;
}

function assertPass(id, label, pass) {
  if (!pass) {
    console.error(`FAIL ${id}: expected PASS but REJECTED — ${label}`);
    return false;
  }
  console.log(`OK   ${id}: baseline still passes — ${label}`);
  return true;
}

let ok = 0;
let n = 0;
function run(id, label, shouldReject, fn) {
  n += 1;
  let passedCheck;
  try {
    passedCheck = fn();
  } catch (e) {
    console.error(`FAIL ${id}: threw — ${label}`, e);
    return;
  }
  // shouldReject=true means check function returning false (or our predicate false) is success
  if (shouldReject) {
    if (assertFail(id, label, passedCheck)) ok += 1;
  } else if (assertPass(id, label, passedCheck)) {
    ok += 1;
  }
}

// --- baselines ---
const noise = generateAudiogram({
  sex: 'Male', ageGroup: '50s', profile: 'SNHL_NoiseNotch', severity: 2, seed: 101,
});
const ome = generateAudiogram({
  sex: 'Female', ageGroup: '20s', profile: 'CHL_OME', severity: 2, seed: 102,
});
const sudden = generateAudiogram({
  sex: 'Male', ageGroup: '50s', profile: 'SNHL_Sudden', severity: 2, seed: 103, affectedSide: 'R',
});
const oto = (() => {
  for (let i = 0; i < 500; i++) {
    const c = generateAudiogram({
      sex: 'Female', ageGroup: '30s', profile: 'CHL_Otosclerosis', severity: 2, seed: 2000 + i,
    });
    if (c.meta.carhartApplied) return c;
  }
  throw new Error('Could not find Carhart-applied otosclerosis case');
})();
const aomMixed = (() => {
  for (let i = 0; i < 500; i++) {
    const c = generateAudiogram({
      sex: 'Male', ageGroup: '20s', profile: 'CHL_AOM', severity: 2, seed: 3000 + i, affectedSide: 'R',
    });
    if (c.meta.aomMixedApplied) return c;
  }
  throw new Error('Could not find AOM mixed-type case');
})();
const normal = generateAudiogram({
  sex: 'Male', ageGroup: '40s', profile: 'Normal', severity: 0, seed: 104,
});
const snhl = generateAudiogram({
  sex: 'Male', ageGroup: '60s', profile: 'SNHL_Age', severity: 2, seed: 105,
});

run('B1', 'NoiseNotch baseline', false, () => checkNoiseNotch(noise));
run('B2', 'OME baseline', false, () => checkMinAbg(ome, 'CHL_OME'));
run('B3', 'Sudden baseline diff≥30', false, () => checkSuddenDiff(sudden, SUDDEN_MIN_LATERALITY_DB));
run('B4', 'Carhart geometry baseline', false, () => hasCarhartGeometry(diseasedEar(oto).diseased));
run('B5', 'Normal baseline', false, () => checkNormalAbgNotExcessive(normal, 15));
run('B6', 'SNHL baseline', false, () => checkSnhlBcCap(snhl, 'SNHL_Age'));
run('B7', 'Rounding baseline', false, () => checkRounding(normal));
run('B8', 'Severity nondecreasing baseline', false, () => checkMeansNondecreasing([40, 45, 50, 55]));
run('B9', 'Normal no-SO baseline', false, () => checkNormalNoScaleOut(normal));
run('B10', 'Limits baseline (generated)', false, () => checkLimits(normal));

// B11/B12: 上限一致は適合（境界値）
{
  const c = deepClone(normal);
  c.right = setAc(c.right, '1kHz', LIMITS_AC['1kHz'].max);
  run('B11', 'AC at upper limit (=max) is PASS', false, () => checkLimits(c));
}
{
  const c = deepClone(normal);
  c.right = setBc(c.right, '1kHz', LIMITS_BC['1kHz'].max);
  // BC=max だと ABG が負になりうるが、P4上下限チェックのみ評価
  run('B12', 'BC at upper limit (=max) is PASS', false, () => checkLimits(c));
}
{
  const mumps = generateAudiogram({
    sex: 'Male', ageGroup: '30s', profile: 'SNHL_Mumps', severity: 2, seed: 106, affectedSide: 'R',
  });
  run('B13', 'Mumps severity floor baseline', false, () => checkMumpsSeverityFloor(mumps));
}

// --- 著者事前定義の規則違反（異常系） ---
// 対応表: docs/pilot-study/verification/NEGATIVE_TEST_cases.md

// M1: 騒音性難聴で C5-dip 消失（4 kHz ≤ 2 kHz）
{
  const c = deepClone(noise);
  const r2 = earRows(c, 'right').find((r) => r.freq === '2kHz')?.ac ?? 40;
  c.right = setAc(c.right, '4kHz', r2); // 4k == 2k → fail strict >
  run('M1', 'C5-dip removed (4k≤2k)', true, () => checkNoiseNotch(c));
}

// M2: 伝音難聴で必要ABGを消失
{
  const c = deepClone(ome);
  for (const f of ['0.25kHz', '0.5kHz', '1kHz', '2kHz']) {
    c.right = setAbg(c.right, f, 0);
    c.left = setAbg(c.left, f, 0);
  }
  run('M2', 'CHL ABG forced to 0', true, () => checkMinAbg(c, 'CHL_OME'));
}

// M3: 5 dB刻みを外した43 dB
{
  const c = deepClone(normal);
  c.right = setAc(c.right, '1kHz', 43);
  run('M3', '43 dB (non-multiple of 5)', true, () => checkRounding(c));
}

// M4: 突発性難聴・中等度で左右差不足（30 dB床未満）
{
  const c = deepClone(sudden);
  for (const f of ['0.5kHz', '1kHz', '2kHz']) {
    c.right = setAc(c.right, f, 50);
    c.left = setAc(c.left, f, 30);
  }
  run('M4', 'Sudden laterality only 20 dB (<30)', true, () => checkSuddenDiff(c, SUDDEN_MIN_LATERALITY_DB));
}

// M5: Carhart様変化の2 kHz BC上昇を消失
{
  const c = deepClone(oto);
  const { side } = diseasedEar(c);
  const rows = earRows(c, side);
  const bc1 = rows.find((r) => r.freq === '1kHz')?.bc ?? 20;
  if (side === 'right') c.right = setBc(c.right, '2kHz', bc1);
  else c.left = setBc(c.left, '2kHz', bc1);
  run('M5', 'Carhart 2k BC rise removed', true, () => hasCarhartGeometry(diseasedEar(c).diseased));
}

// M6: 正常例でABG 20 dB
{
  const c = deepClone(normal);
  c.right = setAbg(c.right, '1kHz', 20);
  run('M6', 'Normal ABG=20', true, () => checkNormalAbgNotExcessive(c, 15));
}

// M7: 感音難聴でBCがACより大きく悪化
{
  const c = deepClone(snhl);
  const ac1 = earRows(c, 'right').find((r) => r.freq === '1kHz')?.ac ?? 40;
  c.right = setBc(c.right, '1kHz', ac1 + 10);
  run('M7', 'SNHL BC=AC+10', true, () => checkSnhlBcCap(c, 'SNHL_Age'));
}

// M8: meta says OME but thresholds are normal-like (ABG small) → C1 must fail
{
  const c = deepClone(normal);
  c.meta = { ...c.meta, profile: 'CHL_OME', severity: 2 };
  run('M8', 'Meta CHL_OME but Normal-like thresholds', true, () => checkMinAbg(c, 'CHL_OME'));
}

// M9/M11（NaN・周波数欠損）は生成器では通常起きないため論文対象外。検証器の防御用に残す場合は下を有効化。
// skipped: M9a/M9b/M11

// M10: C1周波数がSOのみ → vacuous pass しない
{
  const c2 = deepClone(ome);
  c2.right = c2.right.map((r) => {
    if (r.freq !== '0.5kHz') return r;
    return { ...r, soAC: true, soBC: true, ac: undefined, bc: undefined };
  });
  c2.left = c2.left.map((r) => {
    if (r.freq !== '0.5kHz') return r;
    return { ...r, soAC: true, soBC: true, ac: undefined, bc: undefined };
  });
  run('M10', 'SO without finite AC/BC fails C1 (not vacuous pass)', true, () => checkMinAbg(c2, 'CHL_OME'));
}

// M12: 程度を上げたのに閾値が改善（S4破壊）
{
  run('M12', 'Severity series improves mid-way (40→50→45→60)', true,
    () => checkMeansNondecreasing([40, 50, 45, 60]));
}

// M13: 規定外のスケールアウト（Normal に soAC）
{
  const c = deepClone(normal);
  c.right = c.right.map((r) => (r.freq === '1kHz' ? { ...r, soAC: true } : r));
  run('M13', 'Illicit SO on Normal', true, () => checkNormalNoScaleOut(c));
}

// M14: AOM混合型で 4 kHz 骨導上昇を消失
{
  const c = deepClone(aomMixed);
  const { side } = diseasedEar(c);
  const rows = earRows(c, side);
  const bc05 = rows.find((r) => r.freq === '0.5kHz')?.bc ?? 10;
  if (side === 'right') c.right = setBc(c.right, '4kHz', bc05);
  else c.left = setBc(c.left, '4kHz', bc05);
  run('M14', 'AOM mixed HF BC rise removed', true, () => checkAomMixed(c));
}

// M15: 気導上限超過（境界: max は適合、max+5 は不適合）
{
  const c = deepClone(normal);
  c.right = setAc(c.right, '1kHz', LIMITS_AC['1kHz'].max + 5);
  run('M15', 'AC above upper limit (max+5)', true, () => checkLimits(c));
}

// M16: 骨導上限超過
{
  const c = deepClone(normal);
  c.right = setBc(c.right, '1kHz', LIMITS_BC['1kHz'].max + 5);
  run('M16', 'BC above upper limit (max+5)', true, () => checkLimits(c));
}

// M17: 気導下限未満
{
  const c = deepClone(normal);
  c.right = setAc(c.right, '1kHz', LIMITS_AC['1kHz'].min - 5);
  run('M17', 'AC below lower limit (min-5)', true, () => checkLimits(c));
}

// M18: 骨導下限未満
{
  const c = deepClone(normal);
  c.right = setBc(c.right, '1kHz', LIMITS_BC['1kHz'].min - 5);
  run('M18', 'BC below lower limit (min-5)', true, () => checkLimits(c));
}

// M19: C5-dipが5 dBのみ（10 dB床未満）
{
  const c = deepClone(noise);
  const ac2 = earRows(c, 'right').find((r) => r.freq === '2kHz')?.ac ?? 40;
  c.right = setAc(c.right, '4kHz', ac2 + 5);
  c.right = setAc(c.right, '8kHz', ac2);
  c.left = setAc(c.left, '4kHz', ac2 + 5);
  c.left = setAc(c.left, '8kHz', ac2);
  run('M19', `C5-dip only 5 dB (<${NOISE_NOTCH_MIN_DEPTH_DB})`, true, () => checkNoiseNotch(c));
}

// M20: ムンプスで病側平均が床未満
{
  const c = generateAudiogram({
    sex: 'Male', ageGroup: '30s', profile: 'SNHL_Mumps', severity: 2, seed: 107, affectedSide: 'R',
  });
  for (const f of ['0.5kHz', '1kHz', '2kHz']) {
    c.right = setAc(c.right, f, 40);
  }
  run('M20', 'Mumps mean AC too mild', true, () => checkMumpsSeverityFloor(c));
}

console.log(`\nNegative tests: ${ok}/${n} passed`);
if (ok !== n) process.exit(1);

const out = {
  date: new Date().toISOString(),
  passed: ok,
  total: n,
  note: 'Author-defined rule-violating cases must be rejected (negative testing / intentional fault injection into the verifier; not classical source-code mutation; not independent third-party verification).',
  mapping: {
    '43dB_non5': 'M3',
    'Normal_ABG20': 'M6',
    'SNHL_BC_worse': 'M7',
    'CHL_ABG_gone': 'M2',
    'Noise_notch_gone': 'M1',
    'Sudden_diff_lt30': 'M4',
    'Severity_improves': 'M12',
    'Carhart_2k_gone': 'M5',
    'Illicit_SO': 'M13',
    'Meta_mismatch': 'M8',
    'C1_SO_only': 'M10',
    'AOM_mixed_4k_BC_gone': 'M14',
    'AC_above_limit': 'M15',
    'BC_above_limit': 'M16',
    'AC_below_limit': 'M17',
    'BC_below_limit': 'M18',
    'C5_shallow_5dB': 'M19',
    'Mumps_too_mild': 'M20',
    'AC_at_upper_boundary': 'B11',
    'BC_at_upper_boundary': 'B12',
  },
};
fs.writeFileSync(
  path.join(root, 'docs/pilot-study/verification/IgakuKensa_mutation_results.json'),
  JSON.stringify(out, null, 2),
);
console.log('Wrote docs/pilot-study/verification/IgakuKensa_mutation_results.json');
