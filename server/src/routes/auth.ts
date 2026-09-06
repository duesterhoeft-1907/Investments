import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  clearCookie,
  hashPassword,
  issueStaffCookie,
  requireAuth,
  STAFF_COOKIE,
  verifyPassword,
} from '../lib/auth.js';
import { asyncHandler, badRequest, HttpError } from '../lib/http.js';
import { toIso } from '../lib/time.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const row = db
      .prepare('SELECT * FROM users WHERE lower(email) = lower(?)')
      .get(email) as { id: number; password_hash: string; is_active: number } | undefined;

    if (!row || !row.is_active || !(await verifyPassword(row.password_hash, password))) {
      throw new HttpError(401, 'E-Mail oder Passwort stimmt nicht.');
    }

    issueStaffCookie(res, row.id);
    db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(row.id);
    res.json({ user: profile(row.id) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearCookie(res, STAFF_COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  res.json({ user: profile(req.user.id) });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Mindestens 8 Zeichen.').max(200),
});

authRouter.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as
      | { password_hash: string }
      | undefined;
    if (!row || !(await verifyPassword(row.password_hash, currentPassword))) {
      throw badRequest('Aktuelles Passwort stimmt nicht.');
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      await hashPassword(newPassword),
      req.user!.id,
    );
    res.json({ ok: true });
  }),
);

export function profile(userId: number) {
  const user = db
    .prepare('SELECT id, email, name, title, phone, role, accent, last_seen_at FROM users WHERE id = ?')
    .get(userId) as
    | { id: number; email: string; name: string; title: string; phone: string; role: string; accent: string; last_seen_at: string | null }
    | undefined;
  if (!user) throw new HttpError(404, 'Benutzer nicht gefunden.');

  const teams = db
    .prepare(
      `SELECT t.id, t.slug, t.name, t.color, t.sla_minutes AS slaMinutes, tm.team_role AS teamRole
         FROM team_members tm JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = ? ORDER BY t.id`,
    )
    .all(userId);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    title: user.title,
    phone: user.phone,
    role: user.role,
    accent: user.accent,
    lastSeenAt: toIso(user.last_seen_at),
    teams,
  };
}
