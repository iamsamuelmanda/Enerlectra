const fs = require('fs');
const path = require('path');

const root = 'enerlectra-core/dist';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  content = content.replace(/from 'enerlectra-core\/src\//g, "from './");
  content = content.replace(/from "enerlectra-core\/src\//g, 'from "./');
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log('Fixed', filePath);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) fixFile(full);
  }
}

walk(root);
console.log('Done fixing dist imports.');