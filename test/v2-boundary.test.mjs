import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

test('V2 server config names are explicit and do not fall back to legacy Supabase env names', () => {
  const file = fs.readFileSync(
    path.join(repoRoot, 'server/src/platform/config/v2.ts'),
    'utf8'
  );

  assert.match(file, /V2_SUPABASE_URL/);
  assert.match(file, /V2_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(file, /process\.env\.SUPABASE_URL/);
  assert.doesNotMatch(file, /process\.env\.SUPABASE_SERVICE_KEY/);
});

test('V2 browser boundary contains no service-role credential', () => {
  const file = fs.readFileSync(
    path.join(repoRoot, 'client/src/lib/supabase-v2.ts'),
    'utf8'
  );

  assert.match(file, /VITE_V2_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(file, /SERVICE_ROLE/i);
  assert.doesNotMatch(file, /SUPABASE_SERVICE_KEY/i);
});

test('V2 modules do not import quarantined legacy domain paths', () => {
  const roots = [
    path.join(repoRoot, 'server/src/platform'),
    path.join(repoRoot, 'client/src/lib/supabase-v2.ts'),
  ];

  const forbidden = [
    /pcu/i,
    /cluster/i,
    /marketplace/i,
    /settlement/i,
    /treasury/i,
    /staking/i,
    /blockchain/i,
    /energy_wallet/i,
  ];

  for (const root of roots) {
    const files = [];
    if (fs.statSync(root).isFile()) {
      files.push(root);
    } else {
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(full);
        }
      };
      walk(root);
    }

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        assert.doesNotMatch(
          content,
          new RegExp(`from\\s+['"][^'"]*\\${pattern.source}[^'"]*['"]`, pattern.flags),
          `${file} imports a quarantined legacy domain`
        );
      }
    }
  }
});
