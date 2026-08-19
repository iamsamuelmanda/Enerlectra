import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(new URL('.', import.meta.url).pathname.slice(1), '..');

const SCAN_DIRS = [
  path.join(PROJECT_ROOT, 'enerlectra-core', 'src'),
  path.join(PROJECT_ROOT, 'server', 'src'),
];

const EXCLUDE_DIRS = new Set(['node_modules', 'dist']);

// Match relative imports - capture path WITHOUT the closing quote
const IMPORT_RE = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  IMPORT_RE.lastIndex = 0;
  const newContent = content.replace(IMPORT_RE, (match, importPath) => {
    // Skip if already has .js extension
    if (importPath.endsWith('.js')) return match;
    // Skip if has any other extension (.ts, .enum, .service, etc.)
    if (/\.[a-zA-Z0-9]+$/.test(importPath)) return match;
    // No extension - add .js
    changed = true;
    return match.replace(importPath, importPath + '.js');
  });

  if (changed) {
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

console.log('Scanning for .ts files and fixing relative imports (only extensionless imports)...\n');
for (const dir of SCAN_DIRS) {
  if (fs.existsSync(dir)) walkDir(dir);
}
console.log('\nDone.');