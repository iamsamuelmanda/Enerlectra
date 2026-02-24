// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { getSupabaseServerClient } from '../lib/supabaseServer'; // adjust path

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid. Use: Bearer <token>' });
  }

  const token = authHeader.split(' ')[1];

  const supabase = getSupabaseServerClient(token);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    console.error('Token verification failed:', error?.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach the verified user to the request
  (req as any).supabaseUser = user;

  next();
};