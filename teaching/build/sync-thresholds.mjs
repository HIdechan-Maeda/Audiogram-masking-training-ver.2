#!/usr/bin/env node
/**
 * EDU の生成器を実際に呼び、その出力で cases/caseNN.json の
 * representativeThresholds と findings（Tym／ART／DPOAE）を更新する。
 *
 *   node teaching/build/sync-thresholds.mjs case01
 *   node teaching/build/sync-thresholds.mjs            全症例
 *   node teaching/build/sync-thresholds.mjs case01 --dry-run
 *   node teaching/build/sync-thresholds.mjs case01 --thresholds-only
 *
 * seed を変えたら必ず実行すること。DPOAE 周波数も EDU 本体と同じ
 * buildCompanionBundle から取る。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFile as readFileAsync, writeFile as writeFileAsync } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadCase, listCaseIds, toGeneratorOptions } from '../cases/index.mjs';
import { companionToFindings } from '../../src/engine/exportTeachingCase.js';
import { DPOAE_FREQ_LABELS } from '../../src/engine/dpoaeConstants.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CASES_DIR = resolve(HERE, '..', 'cases');
const ENGINE_SRC = join(ROOT, 'src', 'engine', 'generateAudiogram.js');
const COMPANION_SRC = join(ROOT, 'src', 'engine', 'buildCompanionTests.js');
const CACHE_DIR = join(ROOT, 'scripts', '.cache');
const CACHE_ENGINE = join(CACHE_DIR, 'generateAudiogram.mjs');
const CACHE_COMPANION = join(CACHE_DIR, 'buildCompanionTests.mjs');

const AC_FREQS = [125, 250, 500, 1000, 2000, 4000, 8000];
const BC_FREQS = [250, 500, 1000, 2000, 4000];

const FREQ_LABEL_TO_HZ = {
  '0.125kHz': 125,
  '0.25kHz': 250,
  '0.5kHz': 500,
  '1kHz': 1000,
  '2kHz': 2000,
  '4kHz': 4000,
  '8kHz': 8000,
};

function ensureEngineCache() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const src = readFileSync(ENGINE_SRC, 'utf8');
  const oldImp = 'import ISO_DATA from "../data/iso7029_age_hearing_thresholds_2sd.json";';
  const newImp = `import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ISO_DATA = JSON.parse(readFileSync(join(__dirname, "../../src/data/iso7029_age_hearing_thresholds_2sd.json"), "utf8"));`;
  if (!src.includes(oldImp)) {
    throw new Error(`ISO import 行が見つかりません: ${ENGINE_SRC}`);
  }
  writeFileSync(CACHE_ENGINE, src.replace(oldImp, newImp));
}

function ensureCompanionCache() {
  mkdirSync(CACHE_DIR, { recursive: true });
  let src = readFileSync(COMPANION_SRC, 'utf8');
  src = src.replace(
    /from ['"]\.\/dpoaeConstants(?:\.js)?['"]/,
    "from '../../src/engine/dpoaeConstants.js'"
  );
  writeFileSync(CACHE_COMPANION, src);
}

async function callGenerator(caseDef) {
  ensureEngineCache();
  const mod = await import(pathToFileURL(CACHE_ENGINE).href + '?t=' + Date.now());
  const generate = mod.generateAudiogram;
  if (typeof generate !== 'function') {
    throw new Error(
      `generateAudiogram が見つかりません。export: ${Object.keys(mod).join(', ')}`
    );
  }
  const opts = toGeneratorOptions(caseDef);
  const result = generate(opts);
  return { opts, result, thresholds: normalize(result) };
}

async function callCompanion(caseData) {
  ensureCompanionCache();
  const mod = await import(pathToFileURL(CACHE_COMPANION).href + '?t=' + Date.now());
  const build = mod.buildCompanionBundle;
  if (typeof build !== 'function') {
    throw new Error(`buildCompanionBundle が見つかりません。export: ${Object.keys(mod).join(', ')}`);
  }
  return build(caseData);
}

function normalize(result) {
  if (!result?.right || !result?.left) {
    throw new Error(
      `生成結果に right/left がありません。キー: ${Object.keys(result || {}).join(', ')}`
    );
  }

  const earMap = (rows, key, freqs) => {
    const byHz = {};
    for (const r of rows || []) {
      const hz = FREQ_LABEL_TO_HZ[r.freq];
      if (hz == null) continue;
      const v = r[key];
      if (typeof v === 'number') byHz[hz] = v;
    }
    const out = {};
    for (const f of freqs) {
      if (typeof byHz[f] === 'number') out[String(f)] = byHz[f];
    }
    return out;
  };

  const thresholds = {
    ac: {
      right: earMap(result.right, 'ac', AC_FREQS),
      left: earMap(result.left, 'ac', AC_FREQS),
    },
    bc: {
      right: earMap(result.right, 'bc', BC_FREQS),
      left: earMap(result.left, 'bc', BC_FREQS),
    },
  };

  for (const ear of ['right', 'left']) {
    for (const f of AC_FREQS) {
      if (thresholds.ac[ear][String(f)] == null) {
        throw new Error(`AC ${ear} ${f} Hz が欠落しています`);
      }
    }
    for (const f of BC_FREQS) {
      if (thresholds.bc[ear][String(f)] == null) {
        throw new Error(`BC ${ear} ${f} Hz が欠落しています`);
      }
    }
  }

  return thresholds;
}

function summarize(t) {
  const abg = (ear, f) => t.ac[ear][String(f)] - t.bc[ear][String(f)];
  return [500, 1000, 2000]
    .map((f) => `${f}Hz: AC ${t.ac.right[String(f)]}/${t.ac.left[String(f)]}  BC ${t.bc.right[String(f)]}/${t.bc.left[String(f)]}  ABG ${abg('right', f)}/${abg('left', f)}`)
    .join('\n    ');
}

async function syncOne(id, { dryRun, thresholdsOnly }) {
  // loadCase は旧 DPOAE 周波数でも通したいので、同期前は raw 読み
  const path = join(CASES_DIR, `${id}.json`);
  const raw = JSON.parse(await readFileAsync(path, 'utf8'));
  const opts = toGeneratorOptions(raw);
  console.log(`${id} (profile: ${opts.profile}, sex: ${opts.sex}, seed: ${opts.seed})`);

  const { result, thresholds } = await callGenerator(raw);
  console.log(`    ${summarize(thresholds)}`);

  let findings = null;
  if (!thresholdsOnly) {
    const companion = await callCompanion(result);
    findings = companionToFindings(companion);
    console.log(`    DPOAE freqs: ${findings.dpoae.frequencies.join(',')} (EDU=${DPOAE_FREQ_LABELS.join(',')})`);
    console.log(`    DPOAE SNR R: ${findings.dpoae.snr.right.join(',')} / L: ${findings.dpoae.snr.left.join(',')}`);
  }

  if (dryRun) {
    console.log('    --dry-run のため書き込みませんでした。');
    return;
  }

  raw.representativeThresholds = {
    _comment: raw.representativeThresholds?._comment,
    source: 'generator',
    generatedAt: new Date().toISOString(),
    generatorOpts: opts,
    ...thresholds,
  };
  if (findings) {
    raw.findings = {
      ...(raw.findings || {}),
      ...findings,
    };
  }
  await writeFileAsync(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  console.log(`    ${id}.json を更新しました。build を再実行してください。`);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const thresholdsOnly = args.includes('--thresholds-only');
const ids = args.filter((a) => !a.startsWith('--'));
const targets = ids.length ? ids : await listCaseIds();

let failed = 0;
for (const id of targets) {
  try {
    await syncOne(id, { dryRun, thresholdsOnly });
  } catch (e) {
    console.error(`  ${id}: ${e.message}\n`);
    failed++;
  }
}

if (failed) {
  console.error(`${failed} 件が失敗しました。`);
  process.exit(1);
}
