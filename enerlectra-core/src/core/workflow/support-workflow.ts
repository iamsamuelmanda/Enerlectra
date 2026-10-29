import { redis } from '../../infrastructure/redis.js';

/** Short-lived support conversation state shared by the Telegram adapter. */
export class SupportWorkflow {
  private static readonly QUICK_SUPPORT_KEY = 'quick_support:';

  async startQuickSupport(actorId: string): Promise<void> {
    await redis.del(`demo_state:${actorId}`);
    await redis.set(`${SupportWorkflow.QUICK_SUPPORT_KEY}${actorId}`, '1', { ex: 120 });
  }

  async isInQuickSupport(actorId: string): Promise<boolean> {
    const result = await redis.get(`${SupportWorkflow.QUICK_SUPPORT_KEY}${actorId}`);
    return result === '1';
  }

  async clearQuickSupport(actorId: string): Promise<void> {
    await redis.del(`${SupportWorkflow.QUICK_SUPPORT_KEY}${actorId}`);
  }
}
