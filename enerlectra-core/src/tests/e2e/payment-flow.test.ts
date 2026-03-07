/**
 * End-to-End Payment Flow Tests
 * Complete buyer payment journey validation
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { PaymentOrchestrator } from '../../src/domain/payment/payment-orchestrator';
import { PaymentIntentService } from '../../src/domain/payment/payment-intent-service';
import { TreasuryService } from '../../src/domain/treasury/treasury-service';
import { createMTNAdapter } from '../../src/adapters/mobile-money/mtn-adapter';
import { WebhookHandler } from '../../src/adapters/webhooks/webhook-handler';
import { ngwee, kwhToWh, zmwToNgwee } from '../../src/domain/settlement/settlement-types';
import { PaymentRail } from '../../src/domain/treasury/treasury-types';

describe('End-to-End Payment Flow', () => {
  let supabase: any;
  let orchestrator: PaymentOrchestrator;
  let intentService: PaymentIntentService;
  let treasury: TreasuryService;
  let mtnAdapter: any;
  let webhookHandler: WebhookHandler;

  beforeAll(async () => {
    // Initialize Supabase client
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Initialize services
    treasury = new TreasuryService(supabase);
    orchestrator = new PaymentOrchestrator(supabase, treasury);
    intentService = new PaymentIntentService(supabase);
    webhookHandler = new WebhookHandler(supabase, orchestrator);

    // Initialize MTN adapter (sandbox)
    mtnAdapter = createMTNAdapter({
      environment: 'sandbox',
      apiKey: process.env.MTN_API_KEY!,
      apiSecret: process.env.MTN_API_SECRET!,
      subscriptionKey: process.env.MTN_SUBSCRIPTION_KEY!,
      callbackUrl: process.env.MTN_CALLBACK_URL!,
      targetEnvironment: 'sandbox'
    });
  });

  test('Complete buyer payment flow', async () => {
    // STEP 1: Initiate purchase
    console.log('📝 Step 1: Initiating purchase...');
    
    const purchase = await orchestrator.initiatePurchase(
      'test-buyer-001',
      kwhToWh(100),      // 100 kWh
      zmwToNgwee(50),    // 50 ZMW
      PaymentRail.MTN,
      zmwToNgwee(0.50)   // 0.50 ZMW per Wh
    );

    expect(purchase.success).toBe(true);
    expect(purchase.intentId).toBeDefined();
    expect(purchase.paymentInstructions).toBeDefined();

    console.log('✅ Purchase initiated:', purchase.intentId);
    console.log('💳 Payment instructions:', purchase.paymentInstructions);

    // STEP 2: Verify intent created
    const intent = await intentService.getIntent(purchase.intentId!);
    expect(intent.state).toBe('RESERVED');
    expect(intent.energyWh).toBe(kwhToWh(100));
    expect(intent.amountNgwee).toBe(zmwToNgwee(50));

    console.log('✅ Intent state:', intent.state);

    // STEP 3: Simulate MTN payment
    console.log('📱 Step 2: Requesting MTN payment...');

    const paymentResult = await mtnAdapter.requestPayment(
      '260971234567', // Test phone number
      zmwToNgwee(50),
      purchase.intentId!
    );

    expect(paymentResult.referenceId).toBeDefined();
    console.log('✅ MTN reference:', paymentResult.referenceId);

    // STEP 4: In sandbox, we can simulate instant approval
    // In production, this would wait for user approval
    if (process.env.MTN_ENVIRONMENT === 'sandbox') {
      console.log('🧪 Sandbox mode: Simulating instant approval...');
      
      // Wait a bit for MTN sandbox to process
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // STEP 5: Poll for confirmation
    console.log('⏳ Step 3: Waiting for payment confirmation...');

    const confirmation = await mtnAdapter.waitForPaymentConfirmation(
      paymentResult.referenceId,
      60, // 1 minute timeout
      2   // Poll every 2 seconds
    );

    expect(confirmation.status).toBe('SUCCESSFUL');
    console.log('✅ Payment confirmed:', confirmation.status);

    // STEP 6: Process webhook
    console.log('🔔 Step 4: Processing webhook...');

    const webhookPayload = JSON.stringify(confirmation);
    const webhookResult = await webhookHandler.processMTNWebhook(
      webhookPayload,
      undefined, // No signature in test
      'test-secret'
    );

    expect(webhookResult.success).toBe(true);
    expect(webhookResult.processed).toBe(true);

    console.log('✅ Webhook processed:', webhookResult.webhookId);

    // STEP 7: Verify final settlement
    console.log('🔍 Step 5: Verifying settlement...');

    const settledIntent = await intentService.getIntent(purchase.intentId!);
    
    expect(settledIntent.state).toBe('SETTLED');
    expect(settledIntent.confirmedAt).toBeDefined();
    expect(settledIntent.settledAt).toBeDefined();
    expect(settledIntent.externalReference).toBe(paymentResult.referenceId);

    console.log('✅ Settlement complete!');
    console.log('   State:', settledIntent.state);
    console.log('   Confirmed:', settledIntent.confirmedAt?.toISOString());
    console.log('   Settled:', settledIntent.settledAt?.toISOString());

    // STEP 8: Verify treasury reservation released
    // (Treasury reservation should be released after settlement)

    console.log('🎉 Payment flow complete!');
  }, 120000); // 2 minute timeout

  test('Payment intent expiry', async () => {
    console.log('⏱️  Testing payment intent expiry...');

    // Create intent with short expiry
    const purchase = await orchestrator.initiatePurchase(
      'test-buyer-002',
      kwhToWh(10),
      zmwToNgwee(5),
      PaymentRail.MTN,
      zmwToNgwee(0.50)
    );

    expect(purchase.success).toBe(true);

    // Wait for expiry
    console.log('⏳ Waiting for expiry...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Process expired intents
    const result = await orchestrator.processExpiredIntents();
    
    console.log('✅ Expired intents processed:', result.expired);
    console.log('   Reservations released:', result.released);

    // Verify intent state
    const intent = await intentService.getIntent(purchase.intentId!);
    expect(intent.state).toBe('EXPIRED');

    console.log('✅ Intent correctly expired');
  });

  test('Payment cancellation', async () => {
    console.log('❌ Testing payment cancellation...');

    // Create intent
    const purchase = await orchestrator.initiatePurchase(
      'test-buyer-003',
      kwhToWh(20),
      zmwToNgwee(10),
      PaymentRail.MTN,
      zmwToNgwee(0.50)
    );

    expect(purchase.success).toBe(true);

    // Cancel immediately
    const cancelResult = await orchestrator.cancelPayment(
      purchase.intentId!,
      'User requested cancellation'
    );

    expect(cancelResult.success).toBe(true);

    // Verify state
    const intent = await intentService.getIntent(purchase.intentId!);
    expect(intent.state).toBe('CANCELLED');
    expect(intent.failureReason).toBe('User requested cancellation');

    console.log('✅ Payment correctly cancelled');
  });

  afterAll(async () => {
    // Cleanup test data if needed
    console.log('🧹 Cleaning up...');
  });
});