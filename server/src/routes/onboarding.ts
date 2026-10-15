import { Router, type Request, type Response } from 'express';
import type { SupabaseClient, User } from '@supabase/supabase-js';

function bearer(req: Request): string {
  const value = req.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ')
    ? value.slice(7).trim()
    : '';
}

function verifiedIdentity(db: SupabaseClient, token: string): Promise<User | null> {
  if (!token) return Promise.resolve(null);
  return db.auth.getUser(token).then(({ data, error }) => {
    const user = data.user;
    if (error || !user || !user.id || !user.email || !user.email_confirmed_at) return null;
    return user;
  });
}

export function createOnboardingRouter(db: SupabaseClient): Router {
  const router = Router();

  router.post('/organizations', async (req: Request, res: Response) => {
    const user = await verifiedIdentity(db, bearer(req));
    if (!user) return res.status(401).json({ error: 'A valid session with a verified email is required', code: 'VERIFIED_SESSION_REQUIRED' });

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const intent = req.body?.intent;
    const ownerEmail = typeof req.body?.ownerEmail === 'string' ? req.body.ownerEmail.trim().toLowerCase() : null;
    if (!name || name.length > 120) return res.status(400).json({ error: 'Organization name must contain 1–120 characters', code: 'INVALID_ORGANIZATION_NAME' });
    if (intent !== 'OWNER' && intent !== 'DELEGATED_OPERATOR') return res.status(400).json({ error: 'Invalid onboarding intent', code: 'INVALID_CREATOR_INTENT' });
    if (intent === 'DELEGATED_OPERATOR' && (!ownerEmail || ownerEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))) {
      return res.status(400).json({ error: 'A valid owner email is required', code: 'VALID_OWNER_EMAIL_REQUIRED' });
    }

    const { data, error } = await db.rpc('server_create_onboarding_organization', {
      p_auth_user_id: user.id,
      p_verified_email: user.email,
      p_name: name,
      p_intent: intent,
      p_owner_email: intent === 'DELEGATED_OPERATOR' ? ownerEmail : null,
    });
    if (error) {
      const known = new Map<string, { status: number; code: string }>([
        ['ACTOR_INACTIVE', { status: 403, code: 'ACTOR_INACTIVE' }],
        ['ONBOARDING_ROLE_MISSING', { status: 503, code: 'ONBOARDING_ROLE_MISSING' }],
        ['VALID_OWNER_EMAIL_REQUIRED', { status: 400, code: 'VALID_OWNER_EMAIL_REQUIRED' }],
      ]);
      const match = [...known.entries()].find(([key]) => error.message.includes(key));
      return res.status(match?.[1].status ?? 500).json({
        error: match ? 'Onboarding could not be completed' : 'Onboarding service failed',
        code: match?.[1].code ?? 'ONBOARDING_FAILED',
      });
    }
    return res.status(201).json(data);
  });

  router.post('/invitations/accept', async (req: Request, res: Response) => {
    const user = await verifiedIdentity(db, bearer(req));
    if (!user) return res.status(401).json({ error: 'A valid session with a verified email is required', code: 'VERIFIED_SESSION_REQUIRED' });
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token.length < 32 || token.length > 256) return res.status(400).json({ error: 'Invalid invitation token', code: 'INVITATION_TOKEN_INVALID' });

    const { data, error } = await db.rpc('server_accept_organization_invitation', {
      p_auth_user_id: user.id,
      p_verified_email: user.email,
      p_token: token,
    });
    if (error) {
      const known = new Map<string, { status: number; code: string }>([
        ['ACTOR_INACTIVE', { status: 403, code: 'ACTOR_INACTIVE' }],
        ['INVITATION_INVALID_OR_EXPIRED', { status: 410, code: 'INVITATION_INVALID_OR_EXPIRED' }],
        ['INVITATION_EMAIL_MISMATCH', { status: 403, code: 'INVITATION_EMAIL_MISMATCH' }],
      ]);
      const match = [...known.entries()].find(([key]) => error.message.includes(key));
      return res.status(match?.[1].status ?? 500).json({
        error: match ? 'Invitation could not be accepted' : 'Invitation service failed',
        code: match?.[1].code ?? 'INVITATION_ACCEPTANCE_FAILED',
      });
    }
    return res.json(data);
  });

  return router;
}

export default createOnboardingRouter;
