import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const liveIntegrationSuites = [
  'test/v2-action-http-integration.test.mjs',
  'test/v2-action-integration.test.mjs',
  'test/v2-actor-channel-privilege-integration.test.mjs',
  'test/v2-customer-operational-issue-integration.test.mjs',
  'test/v2-multi-tenant-boundary.test.mjs',
  'test/v2-operational-intelligence.test.mjs',
  'test/v2-self-service-onboarding.test.mjs',
  'test/v2-verification-evidence-integration.test.mjs',
];

test('live integration suites fail closed when strict mode has no credentials', () => {
  for (const suite of liveIntegrationSuites) {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--test', suite],
      {
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          ...process.env,
          REQUIRE_LIVE_INTEGRATION: 'true',
          SUPABASE_URL: '',
          SUPABASE_ANON_KEY: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        },
      },
    );

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert.notEqual(result.error?.code, 'ETIMEDOUT', `${suite} timed out while checking fail-closed behavior`);
    assert.notEqual(result.status, 0, `${suite} unexpectedly exited successfully without required credentials`);
    assert.match(
      output,
      /REQUIRE_LIVE_INTEGRATION=true/,
      `${suite} failed for a reason other than the explicit missing-credentials guard:\n${output}`,
    );
  }
});
