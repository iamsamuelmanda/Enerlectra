// ES Module imports
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function fixImports(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      fixImports(filePath);
    } else if (filePath.endsWith('.ts')) {
      let content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      let modified = false;
      const newLines = lines.map(line => {
        if (line.includes('import') && line.includes('from') && line.includes('./') && !line.includes('.js\'') && !line.includes('.js"')) {
          modified = true;
          return line.replace(/(from\s+['"]\.\.?\/[^'"]+)(['"])/g, '$1.js$2');
        }
        return line;
      });
      if (modified) {
        fs.writeFileSync(filePath, newLines.join('\n'));
        console.log(`Fixed ${filePath}`);
      }
    }
  }
}

fixImports('enerlectra-core/src/adapters');
fixImports('enerlectra-core/src/core/handlers');