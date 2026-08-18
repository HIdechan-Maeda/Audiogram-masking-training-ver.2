/**
 * 生成エンジンから独立した仕様適合チェック（検証用）
 * ※ generateAudiogram 本体とは別ファイルに置き、循環検証の見え方を弱める
 * 合否基準: docs/pilot-study/verification/RULE_SPEC_verification_criteria.md
 */

export const MIN_ABG = {
  CHL_OME: { '0.25kHz': 10, '0.5kHz': 15, '1kHz': 15, '2kHz': 8 },
  CHL_AOM: { '0.25kHz': 10, '0.5kHz': 15, '1kHz': 15, '2kHz': 8 },
  CHL_Otosclerosis: { '0.25kHz': 10, '0.5kHz': 15, '1kHz': 15, '2kHz': 5 },
  CHL_OssicularDiscontinuity: {
    '0.25kHz': 20, '0.5kHz': 25, '1kHz': 25, '2kHz': 20, '4kHz': 15,
  },
};

export const BC_FREQS = new Set(['0.25kHz', '0.5kHz', '1kHz', '2kHz', '4kHz']);
export const CARHART_MIN_DEPTH_DB = 5;
/** 発現確率の許容帯（二項、大標本向け。設定80%に対する観測率） */
export const CARHART_RATE_LO = 0.70;
export const CARHART_RATE_HI = 0.90;
/** AOM混合型の教育用付与率（設定50%）の許容帯。臨床発生率ではない */
export const AOM_MIXED_RATE_LO = 0.40;
export const AOM_MIXED_RATE_HI = 0.60;

/** 一側性として患側メタを持つプロファイル（検証側の解釈） */
export const UNILATERAL_PROFILES = new Set([
  'SNHL_Sudden', 'SNHL_Meniere', 'SNHL_Mumps', 'CHL_OssicularDiscontinuity',
]);

export function earRows(caseData, side = 'right') {
  return caseData[side] || [];
}

export function abg(row) {
  if (!Number.isFinite(row.ac) || !Number.isFinite(row.bc)) return null;
  return row.ac - row.bc;
}

export function meanAC(rows, freqs) {
  const vals = rows
    .filter((r) => freqs.includes(r.freq) && Number.isFinite(r.ac))
    .map((r) => r.ac);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function diseasedEar(caseData) {
  const side = caseData.meta?.affectedSide === 'L' ? 'left' : 'right';
  const other = side === 'left' ? 'right' : 'left';
  if (!caseData.meta?.affectedSide) {
    return { diseased: earRows(caseData, 'right'), contra: earRows(caseData, 'left'), side: 'right' };
  }
  return { diseased: earRows(caseData, side), contra: earRows(caseData, other), side };
}

/** S1/C1 等で評価する耳のリスト（一側=患側のみ、両側=左右） */
export function earsToCheck(caseData, profile) {
  if (caseData.meta?.affectedSide === 'L') return ['left'];
  if (caseData.meta?.affectedSide === 'R') return ['right'];
  // AOM は高率一側だが、患側メタがあれば上で処理。無ければ両耳
  if (UNILATERAL_PROFILES.has(profile) && caseData.meta?.affectedSide) {
    return [caseData.meta.affectedSide === 'L' ? 'left' : 'right'];
  }
  return ['right', 'left'];
}

export function isMultipleOf5(v) {
  return Number.isFinite(v) && Math.abs(v % 5) < 1e-9;
}

export function checkRounding(caseData) {
  for (const side of ['right', 'left']) {
    for (const r of earRows(caseData, side)) {
      if (r.ac != null && r.ac !== undefined && !isMultipleOf5(r.ac)) return false;
      if (r.bc != null && r.bc !== undefined && !isMultipleOf5(r.bc)) return false;
      // NaN / Infinity explicitly present
      if (typeof r.ac === 'number' && !Number.isFinite(r.ac)) return false;
      if (typeof r.bc === 'number' && !Number.isFinite(r.bc)) return false;
    }
  }
  return true;
}

function checkMinAbgOnRows(rows, map) {
  let n = 0;
  for (const r of rows) {
    if (!map[r.freq]) continue;
    n += 1;
    const g = abg(r);
    if (g == null || g < map[r.freq]) return false;
  }
  // 指定周波数が1つも数値で評価できない場合は不適合（空 every の罠を避ける）
  return n > 0;
}

export function checkMinAbg(caseData, profile) {
  const map = MIN_ABG[profile];
  if (!map) return true;
  for (const side of earsToCheck(caseData, profile)) {
    if (!checkMinAbgOnRows(earRows(caseData, side), map)) return false;
  }
  return true;
}

export function checkSnhlBcCap(caseData, profile = null) {
  const prof = profile || caseData.meta?.profile;
  const sides = earsToCheck(caseData, prof);
  let n = 0;
  for (const side of sides) {
    for (const r of earRows(caseData, side)) {
      if (!BC_FREQS.has(r.freq)) continue;
      if (typeof r.bc === 'number' && !Number.isFinite(r.bc)) return false;
      if (typeof r.ac === 'number' && !Number.isFinite(r.ac)) return false;
      if (!Number.isFinite(r.bc)) continue;
      n += 1;
      if (!Number.isFinite(r.ac) || r.bc > r.ac + 5) return false;
    }
  }
  return n > 0;
}

/** AOM混合型: 患側 4 kHz BC > 0.5 kHz BC、かつ BC ≤ AC+5 */
export function hasAomMixedHfBc(rows) {
  const bc05 = rows.find((r) => r.freq === '0.5kHz')?.bc;
  const bc4 = rows.find((r) => r.freq === '4kHz')?.bc;
  if (!Number.isFinite(bc05) || !Number.isFinite(bc4)) return false;
  return bc4 > bc05;
}

export function checkAomMixed(caseData) {
  const { diseased } = diseasedEar(caseData);
  if (!hasAomMixedHfBc(diseased)) return false;
  for (const r of diseased) {
    if (!Number.isFinite(r.bc)) continue;
    if (!Number.isFinite(r.ac) || r.bc > r.ac + 5) return false;
  }
  return true;
}

/** C5-dip: AC(4 kHz) > AC(2 kHz) かつ AC(4 kHz) > AC(8 kHz)。判定不能は null */
function notchOkOnRows(rows) {
  const ac2 = rows.find((r) => r.freq === '2kHz')?.ac;
  const ac4 = rows.find((r) => r.freq === '4kHz')?.ac;
  const ac8 = rows.find((r) => r.freq === '8kHz')?.ac;
  if (![ac2, ac4, ac8].every((v) => Number.isFinite(v))) return null;
  return ac4 > ac2 && ac4 > ac8;
}

/** 両側性騒音: 左右とも C5-dip。判定不能が片耳でもあれば false（厳格） */
export function checkNoiseNotch(caseData) {
  for (const side of ['right', 'left']) {
    const ok = notchOkOnRows(earRows(caseData, side));
    if (ok !== true) return false;
  }
  return true;
}

/** Carhart様幾何: BC2 − mean(BC1,BC4) ≥ 5 かつ BC2 > BC1 かつ BC2 > BC4 */
export function hasCarhartGeometry(rows) {
  const bc1 = rows.find((r) => r.freq === '1kHz')?.bc;
  const bc2 = rows.find((r) => r.freq === '2kHz')?.bc;
  const bc4 = rows.find((r) => r.freq === '4kHz')?.bc;
  if (![bc1, bc2, bc4].every((v) => Number.isFinite(v))) return false;
  const meanAdj = (bc1 + bc4) / 2;
  return bc2 > bc1 && bc2 > bc4 && bc2 - meanAdj >= CARHART_MIN_DEPTH_DB - 1e-9;
}

export function checkNormalAbgNotExcessive(caseData, maxGap = 15) {
  for (const side of ['right', 'left']) {
    for (const r of earRows(caseData, side)) {
      if (!BC_FREQS.has(r.freq)) continue;
      if (typeof r.ac === 'number' && !Number.isFinite(r.ac)) return false;
      if (typeof r.bc === 'number' && !Number.isFinite(r.bc)) return false;
      const g = abg(r);
      if (g != null && g > maxGap) return false;
    }
  }
  return true;
}
