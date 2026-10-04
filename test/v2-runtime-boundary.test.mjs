import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('active server composition root does not mount retired protocol runtime', async () => {
  const source = await read('../server/src/index.ts');
  for (const retired of [
    'stakingRoutes', 'ledgerRoutes', 'marketplaceRoutes', 'settlementRoutes',
    'settlementCron', 'matchingCron', 'payoutProcessorCron', 'pcuMinting',
    'clusterSettlementEngine',
  ]) assert.equal(source.includes(retired), false, `legacy runtime reference remains: ${retired}`);
  assert.match(source, /V2_SUPABASE_URL/);
  assert.match(source, /refusing to start without the V2 database boundary/);
  assert.match(source, /createCustomerOperationalIssuesRouter/);
  assert.match(source, /createActionsRouter/);
  assert.match(source, /Enerlectra V2 API/);
  assert.equal(source.includes('GET \/api\/clusters'), false);
});

test('core kernel does not register legacy PCU and cluster handlers', async () => {
  const source = await read('../enerlectra-core/src/bootstrap/create-kernel.ts');
  for (const retired of [
    'ShowBalanceHandler', 'ShowHistoryHandler', 'StartRedemptionHandler',
    'GenerateTokenHandler', 'ProcessMeterReadingImageHandler',
    'TelegramSender', 'WhatsAppSender',
  ]) assert.equal(source.includes(retired), false, `legacy kernel registration remains: ${retired}`);
});

test('legacy WhatsApp HTTP endpoint remains disabled until V2 channel processing is implemented', async () => {
  const source = await read('../server/src/index.ts');
  assert.match(source, /app\.post\('\/api\/webhooks\/whatsapp',[\s\S]*?res\.status\(503\)/);
});

test('legacy command factory fails closed without actor and organization context', async () => {
  const source = await read('../enerlectra-core/src/core/translation/command-factory.ts');
  assert.match(source, /TRUSTED_TENANT_CONTEXT_REQUIRED/);
  assert.equal(source.includes("'default-org'"), false);
});

test('active client router exposes only V2 landing and no legacy auth or protocol routes', async () => {
  const source = await read('../client/src/routes/router.tsx');
  for (const retired of [
    'ClusterDetailPage', 'LaunchClusterPage', 'EnergyWalletPage',
    'TradingPage', 'TransactionsPage', 'PilotDashboard',
    'SignIn', 'SignUp', 'ForgotPassword', 'ResetPassword',
  ]) assert.equal(source.includes(retired), false, `legacy client route remains: ${retired}`);
  assert.match(source, /V2Home/);
});

test('V2 landing does not link users into the legacy authentication client', async () => {
  const source = await read('../client/src/pages/V2Home.tsx');
  assert.equal(source.includes('/signin'), false);
  assert.equal(source.includes('Legacy sign-in'), false);
});

test('legacy WhatsApp handler is a no-op until canonical V2 channel identity exists', async () => {
  const source = await read('../enerlectra-core/src/adapters/whatsapp/webhook-handler.ts');
  for (const retired of [
    'communication_messages', 'resolveWhatsAppUserId',
    'processIncomingMessage', 'default-org',
  ]) assert.equal(source.includes(retired), false, `unsafe WhatsApp dependency remains: ${retired}`);
  assert.match(source, /WHATSAPP_V2_IDENTITY_ADAPTER_NOT_CONFIGURED/);
});
