// server/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Supabase configuration missing for auth middleware');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export const requireAuth = async (
  req: Request & { supabaseUser?: any },
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authorization header missing or invalid. Use: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('Token verification failed:', error?.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.supabaseUser = user;
    next();
  } catch (err: any) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: err.message || 'Auth middleware error' });
  }
};

// Alias so routes that import { authenticate } continue to work
export { requireAuth as authenticate };