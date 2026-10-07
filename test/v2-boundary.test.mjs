import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

test('canonical server boundary uses canonical Supabase environment names only', () => {
  const files = [
    'server/src/index.ts',
    'server/src/platform/supabase/request-client.ts',
    '.env.example',
  ].map((file) => path.join(repoRoot, file));

  for (const filePath of files) {
    const file = fs.readFileSync(filePath, 'utf8');
    assert.doesNotMatch(file, /V2_SUPABASE_/);
    assert.doesNotMatch(file, /VITE_V2_SUPABASE_/);
  }

  const requestClient = fs.readFileSync(
    path.join(repoRoot, 'server/src/platform/supabase/request-client.ts'),
    'utf8',
  );
  assert.match(requestClient, /process\.env\.SUPABASE_URL/);
  assert.match(requestClient, /process\.env\.SUPABASE_ANON_KEY/);
});

test('browser Supabase boundary contains no service-role credential', () => {
  const file = fs.readFileSync(
    path.join(repoRoot, 'client/src/lib/supabase.ts'),
    'utf8',
  );

  assert.match(file, /VITE_SUPABASE_URL/);
  assert.match(file, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(file, /SERVICE_ROLE/i);
  assert.doesNotMatch(file, /SUPABASE_SERVICE_KEY/i);
});

test('canonical action route has no legacy V2 Supabase client dependency', () => {
  const file = fs.readFileSync(
    path.join(repoRoot, 'server/src/routes/actions.ts'),
    'utf8',
  );

  assert.doesNotMatch(file, /V2_SUPABASE_/);
  assert.match(file, /createRequestScopedSupabaseClient/);
  assert.doesNotMatch(file, /createClient\(/);
});
