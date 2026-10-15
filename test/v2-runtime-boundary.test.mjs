import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('V2 migration versions are unique and contiguous', async () => {
  const files = (await readdir(new URL('../supabase/v2/migrations/', import.meta.url)))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const versions = files.map((file) => {
    const match = file.match(/^(\d{3})_.+\.sql$/);
    assert.ok(match, `V2 migration filename lacks a three-digit version prefix: ${file}`);
    return Number(match[1]);
  });
  assert.equal(new Set(versions).size, versions.length, 'duplicate V2 migration version detected');
  assert.deepEqual(
    versions,
    Array.from({ length: files.length }, (_, index) => index + 1),
    'V2 migration sequence must be contiguous and ordered',
  );
});

test('active server composition root does not mount retired protocol runtime', async () => {
  const source = await read('../server/src/index.ts');
  for (const retired of [
    'stakingRoutes', 'ledgerRoutes', 'marketplaceRoutes', 'settlementRoutes',
    'settlementCron', 'matchingCron', 'payoutProcessorCron', 'pcuMinting',
    'clusterSettlementEngine',
  ]) assert.equal(source.includes(retired), false, `legacy runtime reference remains: ${retired}`);
  assert.match(source, /SUPABASE_URL/);
  assert.match(source, /SUPABASE_ANON_KEY/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);¶»§q«^