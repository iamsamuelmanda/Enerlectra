// server/src/services/posthog.ts
import { PostHog } from 'posthog-node';

export const posthog = new PostHog(
  process.env.POSTHOG_PROJECT_TOKEN || '',
  { host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com' }
);