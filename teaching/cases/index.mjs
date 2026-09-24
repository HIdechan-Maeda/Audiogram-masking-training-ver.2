/**
 * 症例定義の共有ローダ。
 *
 * AudioScope EDU 本体と教材ビルドの双方がここから症例を読む。これが「単一の情報源」に
 * あたる。EDU 側で症例条件を別途ハードコードしないこと。条件がずれると、学生が画面で
 * 測った聴力像と、手元の課題シートに印刷された条件が食い違う。
 *
 * 使い方（EDU 側）:
 *   import { loadCase, toGeneratorOptions } from '../teaching/cases/index.mjs';
 *   const c = await loadCase('case01');
 *   const audiogram = generateAudiogram(toGeneratorOptions(c));
 *
 * 使い方（教材ビルド側）:
 *   node teaching/build/build.mjs case01
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assertDpoaeFrequencyLabels } from '../../src/engine/dpoaeConstants.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export async function listCaseIds() {
  const files = await readdir(HERE);
  return files
    .filter((f) => /^case\d+\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

export async function loadCase(id) {
  const raw = await readFile(join(HERE, `${id}.json`), 'utf8');
  const c = JSON.parse(raw);
  validateCase(c);
  return c;
}

export async function loadAllCases() {
  const ids = await listCaseIds();
  return Promise.all(ids.map(loadCase));
}

const VALID_PROFILES = [
  'Normal',
  'SNHL_Age', 'SNHL_NoiseNotch', 'SNHL_Meniere', 'SNHL_Sudden', 'SNHL_Mumps',
  'CHL_OME', 'CHL_AOM', 'CHL_Otosclerosis', 'CHL_OssicularDiscontinuity',
];
const VALID_AGE_GROUPS = ['20s', '30s', '40s', '50s', '60s', '70s'];

/**
 * 最低限の検証。EDU 側の生成器に渡す前に落とすためのもので、
 * 出力規則そのものの検証（scripts/lib/audiogramRuleChecks.mjs）とは別物。
 */
export function validateCase(c) {
  const g = c.generation;
  if (!g) throw new Error(`${c.id}: generation 節がない`);
  if (!VALID_PROFILES.includes(g.profile)) {
    throw new Error(`${c.id}: 未知の profile "${g.profile}"。有効値: ${VALID_PROFILES.join(', ')}`);
  }
  if (!VALID_AGE_GROUPS.includes(g.ageGroup)) {
    throw new Error(`${c.id}: 未知の ageGroup "${g.ageGroup}"。検証グリッドは 20s〜70s（18歳未満は対象外）`);
  }
  if (!['male', 'female'].includes(g.sex)) throw new Error(`${c.id}: sex は male / female`);
  if (![0, 1, 2, 3].includes(g.severity)) throw new Error(`${c.id}: severity は 0〜3`);
  if (!Number.isInteger(g.seed)) throw new Error(`${c.id}: seed は整数で固定すること（授業回ごとに固定して配布する）`);

  const m = c.masking;
  if (!m) throw new Error(`${c.id}: masking 節がない`);
  for (const k of ['interauralAttenuationAC', 'interauralAttenuationBC', 'safetyMargin']) {
    if (typeof m[k] !== 'number') throw new Error(`${c.id}: masking.${k} が数値でない`);
  }

  const dpoae = c.findings?.dpoae;
  if (dpoae) {
    assertDpoaeFrequencyLabels(dpoae.frequencies, `${c.id}.findings.dpoae`);
    for (const ear of ['right', 'left']) {
      const snr = dpoae.snr?.[ear];
      if (!Array.isArray(snr) || snr.length !== dpoae.frequencies.length) {
        throw new Error(`${c.id}: findings.dpoae.snr.${ear} の長さが周波数と一致しない`);
      }
    }
  }
  return true;
}

/**
 * AudioScope EDU の generateAudiogram(opts) に渡す形へ変換する。
 *
 * 本体 API（src/engine/generateAudiogram.js）:
 *   opts: { profile, ageGroup, sex: 'Male'|'Female', severity, seed, affectedSide?: 'R'|'L' }
 *   return: { meta, right: [{freq, ac, bc, soAC, soBC}, ...], left: [...] }
 *   freq は "0.125kHz" … "8kHz" 形式。
 *
 * 症例 JSON の sex は male/female、患側は ears: both|right|left なのでここで正規化する。
 */
export function toGeneratorOptions(c) {
  const g = c.generation;
  const sexRaw = String(g.sex || '').toLowerCase();
  const sex = sexRaw === 'male' ? 'Male' : sexRaw === 'female' ? 'Female' : g.sex;

  const opts = {
    profile: g.profile,
    ageGroup: g.ageGroup,
    sex,
    severity: g.severity,
    seed: g.seed,
  };

  // 明示 affectedSide があれば優先。なければ ears から片側指定を渡す。
  if (g.affectedSide === 'R' || g.affectedSide === 'L') {
    opts.affectedSide = g.affectedSide;
  } else if (g.ears === 'right') {
    opts.affectedSide = 'R';
  } else if (g.ears === 'left') {
    opts.affectedSide = 'L';
  }

  return opts;
}
