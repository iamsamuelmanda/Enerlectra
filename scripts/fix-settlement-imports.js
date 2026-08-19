import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(new URL('.', import.meta.url).pathname.slice(1), '..');
const SETTLEMENT_DIR = path.join(PROJECT_ROOT, 'enerlectra-core', 'src', 'domain', 'settlement');
const FILES_TO_FIX = [
  'settlement-cycle.ts',
  'settlement-service.ts',
  'settlement-transitions.ts',
];

const EXCLUDE_DIRS = new Set(['node_modules', 'dist']);

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const newContent = content.replace(
    /from '\.\/settlement-state\.js'/g,
    "from './settlement-state.enum.js'"
  );
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Fixed: ${filePath}`);
  }
}

console.log('Fixing settlement-state imports...\n');
for (const file of FILES_TO_FIX) {
  const fullPath = path.join(SETTLEMENT_DIR, file);
  if (fs.existsSync(fullPath)) {
    processFile(fullPath);
  } else {
    console.log(`Not found: ${fullPath}`);
  }
}
console.log('\nDone.');