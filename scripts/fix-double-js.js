import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(new URL('.', import.meta.url).pathname.slice(1), '..');
const SCAN_DIRS = [
  path.join(PROJECT_ROOT, 'enerlectra-core', 'src'),
  path.join(PROJECT_ROOT, 'server', 'src'),
];
const EXCLUDE_DIRS = new Set(['node_modules', 'dist']);

// Match .js.js and replace with .js
const DOUBLE_JS_RE = /\.js\.js(?=['"])/g;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const newContent = content.replace(DOUBLE_JS_RE, '.js');
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Fixed: ${filePath}`);
  }
}

function walkDir(dir) {
  if (EXCLUDE_DIRS.has(path.basename(dir))) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.ts')) processFile(fullPath);
  }
}

console.log('Fixing .js.js double extensions...\n');
for (const dir of SCAN_DIRS) {
  if (fs.existsSync(dir)) walkDir(dir);
}
console.log('\nDone.');