// enerlectra-core/src/utils/format.ts
import crypto from 'node:crypto';

export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

export function generateReadingKey(
  userId: string,
  clusterId: string,
  meterType: string,
  period: string,
  readingKwh: number
): string {
  const raw = `${userId}:${clusterId}:${meterType}:${period}:${readingKwh.toFixed(2)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function normalizePhoneNumber(input: string): string | null {
  const cleaned = input.replace(/\s+/g, '');
  let n = cleaned;
  if (n.startsWith('0')) n = '+260' + n.slice(1);
  if (n.startsWith('260')) n = '+' + n;
  return /^\+260\d{9}$/.test(n) ? n : null;
}

export function dbErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === '42P01') return 'Database table missing. Run the migration script in Supabase.';
  return `Query failed: ${error.message || 'unknown error'}`;
}
