/* eslint-disable no-console */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function cp(src, dest) {
  fs.copyFileSync(src, dest);
}
function mv(src, dest) {
  fs.renameSync(src, dest);
}

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const PUBLIC = path.join(ROOT, 'public');

const indexJs = path.join(SRC, 'index.js');
const indexHtml = path.join(PUBLIC, 'index.html');
const tympIndexJs = path.join(SRC, 'tympIndex.js');
const tympHtml = path.join(PUBLIC, 'tymp.html');

const bakDir = path.join(ROOT, '.build-bak');
if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir);
const bakIndexJs = path.join(bakDir, 'index.js.bak');
const bakIndexHtml = path.join(bakDir, 'index.html.bak');

try {
  console.log('Backing up original entry files...');
  cp(indexJs, bakIndexJs);
  cp(indexHtml, bakIndexHtml);

  console.log('Switching to tympanogram entry...');
  cp(tympIndexJs, indexJs);
  cp(tympHtml, indexHtml);

  console.log('Building (react-scripts build)...');
  execSync('npm run build', { stdio: 'inherit' });

  const buildDir = path.join(ROOT, 'build');
  const targetDir = path.join(ROOT, 'build-tymp');
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  mv(buildDir, targetDir);
  console.log('Tympanogram build output -> build-tymp/');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  console.log('Restoring original entry files...');
  try {
    cp(bakIndexJs, indexJs);
    cp(bakIndexHtml, indexHtml);
  } catch (e) {
    console.error('Failed to restore original files. Please restore manually:', e);
  }
}













