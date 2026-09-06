import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { hashPassword, requireAuth, requireRole } from '../lib/auth.js';
import { asyncHandler, intParam, notFound } from '../lib/http.js';
import { onlineUserIds } from '../lib/realtime.js';
import { toIso } from '../lib/time.js';

export const directoryRouter = Router();
directoryRouter.use(requireAuth);

directoryRouter.get('/users', (_req, res) => {
  const online = new Set(onlineUserIds());
  const rows = db
    .prepare(
      `SELECT id, email, name, title, phone, role, accent, is_active, last_seen_at
         FROM users WHERE is_active = 1 ORDER BY name`,
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      title: u.title,
      phone: u.phone,
      role: u.role,
      accent: u.accent,
      online: online.has(u.id as number),
      lastSeenAt: toIso(u.last_seen_at as string | null),
      teams: db
        .prepare(
          `SELECT t.id, t.name, t.color FROM team_members tm
             JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = ?`,
        )
        .all(u.id),
    })),
  });
});

directoryRouter.get('/teams', (_req, res) => {
  const teams = db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM leads l WHERE l.team_id = t.id) AS lead_count,
              (SELECT COUNT(*) FROM leads l WHERE l.team_id = t.id AND l.first_contact_at IS NULL
                 AND l.status NOT IN ('won','lost')) AS awaiting
         FROM teams t ORDER BY t.id`,
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    teams: teams.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      color: t.color,
      slaMinutes: t.sla_minutes,
      leadCount: t.lead_count,
      awaiting: t.awaiting,
      members: db
        .prepare(
          `SELECT u.id, u.name, u.title, u.accent, tm.team_role AS teamRole
             FROM team_members tm JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = ? AND u.is_active = 1 ORDER BY u.name`,
        )
        .all(t.id),
      assetClasses: db
        .prepare('SELECT id, slug, name FROM asset_classes WHERE team_id = ? ORDER BY sort_order')
        .all(t.id),
    })),
  });
});

directoryRouter.get('/asset-classes', (_req, res) => {
  res.json({
    assetClasses: db
      .prepare(
        `SELECT ac.*, t.name AS team_name, t.color AS team_color
           FROM asset_classes ac LEFT JOIN teams t ON t.id = ac.team_id
          ORDER BY ac.sort_order, ac.id`,
      )
      .all(),
  });
});

/** Routing anpassen: welches Fachgebiet landet in welcher Gruppe. */
const routeSchema = z.object({ teamId: z.number().int().positive().nullable() });

directoryRouter.patch('/asset-classes/:id', requireRole('admin', 'manager'), (req, res) => {
  const id = intParam(req.params.id);
  const { teamId } = routeSchema.parse(req.body);
  const exists = db.prepare('SELECT 1 FROM asset_classes WHERE id = ?').get(id);
  if (!exists) throw notFound('Fachgebiet nicht gefunden.');
  db.prepare('UPDATE asset_classes SET team_id = ? WHERE id = ?').run(teamId, id);
  res.json({ ok: true });
});

const teamPatchSchema = z.object({
  slaMinutes: z.number().int().min(1).max(1440).optional(),
  description: z.string().trim().max(400).optional(),
  color: z.string().trim().max(20).optional(),
});

directoryRouter.patch('/teams/:id', requireRole('admin', 'manager'), (req, res) => {
  const id = intParam(req.params.id);
  const patch = teamPatchSchema.parse(req.body);
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if (patch.slaMinutes !== undefined) { sets.push('sla_minutes = @slaMinutes'); params.slaMinutes = patch.slaMinutes; }
  if (patch.description !== undefined) { sets.push('description = @description'); params.description = patch.description; }
  if (patch.color !== undefined) { sets.push('color = @color'); params.color = patch.color; }
  if (sets.length) db.prepare(`UPDATE teams SET ${sets.join(', ')} WHERE id = @id`).run(params);
  res.json({ ok: true });
});

const memberSchema = z.object({
  userId: z.number().int().positive(),
  action: z.enum(['add', 'remove']),
});

directoryRouter.post('/teams/:id/members', requireRole('admin', 'manager'), (req, res) => {
  const teamId = intParam(req.params.id);
  const { userId, action } = memberSchema.parse(req.body);
  const channel = db.prepare(`SELECT id FROM channels WHERE type='team' AND team_id = ?`).get(teamId) as
    | { id: number }
    | undefined;

  if (action === 'add') {
    db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)').run(teamId, userId);
    if (channel) {
      db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(channel.id, userId);
    }
  } else {
    db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);
    if (channel) {
      db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').run(channel.id, userId);
    }
  }
  res.json({ ok: true });
});

const createUserSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().max(120).default(''),
  phone: z.string().trim().max(60).default(''),
  role: z.enum(['admin', 'manager', 'agent']).default('agent'),
  accent: z.string().trim().max(20).default('#C8A24A'),
  password: z.string().min(8, 'Mindestens 8 Zeichen.').max(200),
  teamIds: z.array(z.number().int().positive()).default([]),
});

directoryRouter.post(
  '/users',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const info = db
      .prepare(
        `INSERT INTO users (email, password_hash, name, title, phone, role, accent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.email, await hashPassword(input.password), input.name, input.title, input.phone, input.role, input.accent);

    const userId = Number(info.lastInsertRowid);
    const company = db.prepare(`SELECT id FROM channels WHERE type = 'company' LIMIT 1`).get() as
      | { id: number }
      | undefined;
    if (company) {
      db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(company.id, userId);
    }
    for (const teamId of input.teamIds) {
      db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)').run(teamId, userId);
      const ch = db.prepare(`SELECT id FROM channels WHERE type='team' AND team_id = ?`).get(teamId) as
        | { id: number }
        | undefined;
      if (ch) db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)').run(ch.id, userId);
    }
    res.status(201).json({ id: userId });
  }),
);
