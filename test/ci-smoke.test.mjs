import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('CI smoke checks', () => {
  it('loads root package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.equal(pkg.name, 'enerlectra-mvp');
    assert.ok(pkg.engines?.node);
  });

  it('has required workspace entrypoints', () => {
    assert.ok(existsSync('client/package.json'));
    assert.ok(existsSync('integrations/telegram-bot/package.json'));
    assert.ok(existsSync('integrations/telegram-bot/src/bot.ts'));
    assert.ok(existsSync('server/src/index.ts'));
  });
});
