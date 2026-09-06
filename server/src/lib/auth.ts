import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/index.js';
import { env } from '../env.js';

export type Role = 'admin' | 'manager' | 'agent';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  title: string;
  phone: string;
  role: Role;
  accent: string;
}

export interface PortalSession {
  leadId: number;
  ref: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      portal?: PortalSession;
    }
  }
}

export const STAFF_COOKIE = 'cls_staff';
export const PORTAL_COOKIE = 'cls_portal';

export const hashPassword = (plain: string) => argon2.hash(plain);
export const verifyPassword = (hash: string, plain: string) =>
  argon2.verify(hash, plain).catch(() => false);

const maxAge = env.sessionDays * 24 * 60 * 60 * 1000;

export function issueStaffCookie(res: Response, userId: number): void {
  const token = jwt.sign({ sub: String(userId), kind: 'staff' }, env.jwtSecret, {
    expiresIn: `${env.sessionDays}d`,
  });
  res.cookie(STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge,
    path: '/',
  });
}

export function issuePortalCookie(res: Response, leadId: number, ref: string): void {
  const token = jwt.sign({ sub: String(leadId), ref, kind: 'portal' }, env.jwtSecret, {
    expiresIn: '30d',
  });
  res.cookie(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearCookie(res: Response, name: string): void {
  res.clearCookie(name, { path: '/' });
}

export function loadStaffUser(id: number): SessionUser | undefined {
  return db
    .prepare(
      `SELECT id, email, name, title, phone, role, accent
         FROM users WHERE id = ? AND is_active = 1`,
    )
    .get(id) as SessionUser | undefined;
}

/** Liest das Staff-Cookie, ohne den Request zu blockieren. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[STAFF_COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret) as { sub: string; kind?: string };
      if (payload.kind === 'staff') {
        const user = loadStaffUser(Number(payload.sub));
        if (user) req.user = user;
      }
    } catch {
      /* abgelaufen oder manipuliert – Request laeuft anonym weiter */
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(req.user.id);
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Dafuer fehlen dir die Rechte.' });
      return;
    }
    next();
  };
}

export function requirePortal(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[PORTAL_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Bitte melde dich in deinem Kundenbereich an.' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret) as {
      sub: string;
      ref: string;
      kind?: string;
    };
    if (payload.kind !== 'portal') throw new Error('wrong kind');
    req.portal = { leadId: Number(payload.sub), ref: payload.ref };
    next();
  } catch {
    res.status(401).json({ error: 'Sitzung abgelaufen. Bitte erneut anmelden.' });
  }
}
