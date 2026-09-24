#!/usr/bin/env node
/**
 * EDU 講師画面から書き出した JSON を teaching/cases/caseNN.json に取り込む。
 *
 *   node teaching/build/import-edu-export.mjs ~/Downloads/case02_edu_export.json
 *   node teaching/build/import-edu-export.mjs export.json --id case03
 *   node teaching/build/import-edu-export.mjs export.json --build
 *
 * stages / teaching 本文は既存 case（なければ case01）をテンプレートにし、
 * generation・representativeThresholds・findings など EDU 由来を上書きする。
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateCase } from '../cases/index.mjs';
import { assertDpoaeFrequencyLabels } from '../../src/engine/dpoaeConstants.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = resolve(HERE, '..', 'cases');
const ROOT = resolve(HERE, '..', '..');

async function exists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const flags = { build: false, id: null };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--build') flags.build = true;
    else if (argv[i] === '--id') flags.id = argv[++i];
    else pos.push(argv[i]);
  }
  return { file: pos[0], ...flags };
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const { file, id: idFlag, build } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('使い方: node teaching/build/import-edu-export.mjs <edu_export.json> [--id case02] [--build]');
    process.exit(1);
  }

  const exportPath = resolve(file);
  const exported = await loadJson(exportPath);
  const id = idFlag || exported.id || 'case02';
  if (!/^case\d{2}$/.test(id)) {
    throw new Error(`id は case01 形式である必要があります: ${id}`);
  }

  const targetPath = join(CASES_DIR, `${id}.json`);
  const templatePath = (await exists(targetPath))
    ? targetPath
    : join(CASES_DIR, 'case01.json');

  if (!(await exists(templatePath))) {
    throw new Error(`テンプレートが見つかりません: ${templatePath}`);
  }

  const base = await loadJson(templatePath);
  const merged = {
    ...base,
    $schema: './case.schema.json',
    id,
    level: exported.level ?? base.level ?? 1,
    title: exported.title || `臨床推論課題　症例${id.replace('case', '')}`,
    subtitle: exported.subtitle || base.subtitle,
    diagnosis: exported.diagnosis || base.diagnosis,
    target: exported.target || base.target,
    duration: exported.duration || base.duration,
    examinations: exported.examinations || base.examinations,
    objective: exported.objective || base.objective,
    generation: {
      ...(base.generation || {}),
      ...(exported.generation || {}),
    },
    masking: {
      ...(base.masking || {}),
      ...(exported.masking || {}),
    },
    representativeThresholds: exported.representativeThresholds || base.representativeThresholds,
    history: exported.history?.length ? exported.history : base.history,
    // findings は EDU 書き出しを優先。浅い merge だと旧 DPOAE 周波数（例: 1.5k）が残る。
    findings: {
      ...(base.findings || {}),
      ...(exported.findings || {}),
      ...(exported.findings?.dpoae
        ? { dpoae: exported.findings.dpoae }
        : {}),
      ...(exported.findings?.tympanometry
        ? { tympanometry: exported.findings.tympanometry }
        : {}),
      ...(exported.findings?.acousticReflex
        ? { acousticReflex: exported.findings.acousticReflex }
        : {}),
    },
    // stages / teaching / rubric 等はテンプレートを維持（教員が後で編集）
    _importedFromEdu: {
      exportedAt: exported.exportedAt,
      importedAt: new Date().toISOString(),
      sourceFile: exportPath,
      eduMeta: exported._eduMeta || null,
    },
  };

  // テンプレート由来の case01 固有コメントが残らないよう generation コメントを更新
  if (merged.generation) {
    merged.generation._comment =
      'EDU 講師画面から取り込んだ生成条件。学生シートと EDU 出力は必ずこの値から派生する。';
  }

  if (merged.findings?.dpoae) {
    assertDpoaeFrequencyLabels(merged.findings.dpoae.frequencies, `${id} import DPOAE`);
  } else {
    console.warn(`警告: ${id} の書き出しに findings.dpoae がありません。テンプレートの旧周波数が残る可能性があります。`);
  }

  validateCase(merged);
  await writeFile(targetPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`書き込み: ${targetPath}`);
  console.log(`  profile=${merged.generation.profile} seed=${merged.generation.seed} diagnosis=${merged.diagnosis}`);

  if (build) {
    console.log('\nteaching:build を実行します…');
    const r = spawnSync(process.execPath, [join(HERE, 'build.mjs'), id], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (r.status !== 0) process.exit(r.status || 1);
  } else {
    console.log(`\n次のコマンドで Word を生成できます:\n  npm run teaching:build -- ${id}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
