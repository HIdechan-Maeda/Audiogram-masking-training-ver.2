#!/usr/bin/env node
/**
 * 症例定義から課題シート（学生用・教員用）の docx を生成する。
 *
 *   node teaching/build/build.mjs            全症例
 *   node teaching/build/build.mjs case01     指定症例のみ
 *   node teaching/build/build.mjs --out dist
 */

import { Packer } from 'docx';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadCase, listCaseIds } from '../cases/index.mjs';
import { renderStudent } from './render-student.mjs';
import { renderTeacher } from './render-teacher.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(HERE, '..', 'dist');

function parseArgs(argv) {
  const ids = [];
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') { out = resolve(argv[++i]); continue; }
    ids.push(argv[i]);
  }
  return { ids, out };
}

async function buildOne(id, outDir) {
  const c = await loadCase(id);
  const targets = [
    [`${c.id}_臨床推論課題_学生用.docx`, renderStudent(c)],
    [`${c.id}_臨床推論課題_教員用.docx`, renderTeacher(c)],
  ];
  for (const [name, doc] of targets) {
    const buf = await Packer.toBuffer(doc);
    await writeFile(join(outDir, name), buf);
    console.log(`  ${name}  (${(buf.length / 1024).toFixed(1)} KB)`);
  }
}

const { ids, out } = parseArgs(process.argv.slice(2));
const targets = ids.length ? ids : await listCaseIds();
await mkdir(out, { recursive: true });

console.log(`出力先: ${out}`);
for (const id of targets) {
  console.log(`${id}:`);
  await buildOne(id, out);
}
console.log(`\n${targets.length} 症例を生成しました。`);
