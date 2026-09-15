/**
 * Regenerate src/data/builtinLessonPresets.json from teaching/cases/caseNN.json.
 *
 *   node teaching/build/sync-builtin-presets.mjs
 */

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCaseIds, loadCase, toGeneratorOptions } from '../cases/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const OUT = join(ROOT, 'src/data/builtinLessonPresets.json');

function caseLabel(id) {
  const n = id.replace(/^case0?/, '');
  return `症例${n}`;
}

function lessonSpecFromCase(c) {
  const opts = toGeneratorOptions(c);
  return {
    ageGroup: opts.ageGroup,
    sex: opts.sex,
    profile: opts.profile,
    severity: opts.severity,
    affectedSide: opts.affectedSide || null,
    seed: opts.seed,
    includeTym: true,
    includeArt: true,
    includeDpoae: true,
  };
}

async function main() {
  const ids = await listCaseIds();
  const rows = [];
  for (const id of ids) {
    const c = await loadCase(id);
    rows.push({
      id: c.id,
      label: caseLabel(c.id),
      diagnosis: c.diagnosis || '',
      spec: lessonSpecFromCase(c),
    });
  }
  await writeFile(OUT, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  console.log(`wrote ${OUT} (${rows.length} cases)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
