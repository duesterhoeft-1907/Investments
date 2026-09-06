import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, forbidden, intParam, notFound } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { emit } from '../lib/realtime.js';
import { nowSql, toIso } from '../lib/time.js';

export const chatRouter = Router();
chatRouter.use(requireAuth);

function assertMember(channelId: number, userId: number): void {
  const member = db
    .prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?')
    .get(channelId, userId);
  if (!member) throw forbidden('Du bist kein Mitglied dieses Kanals.');
}

/** Alle Kanaele des Nutzers inkl. ungelesener Nachrichten und Vorschau. */
chatRouter.get('/channels', (req, res) => {
  const me = req.user!.id;
  const rows = db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.type, c.team_id, c.topic,
              t.color AS team_color,
              cm.last_read_at,
              (SELECT COUNT(*) FROM messages m
                WHERE m.channel_id = c.id AND m.created_at > cm.last_read_at
                  AND (m.user_id IS NULL OR m.user_id != @me)) AS unread,
              (SELECT m.body FROM messages m WHERE m.channel_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
              (SELECT m.created_at FROM messages m WHERE m.channel_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at
         FROM channel_members cm
         JOIN channels c ON c.id = cm.channel_id
         LEFT JOIN teams t ON t.id = c.team_id
        WHERE cm.user_id = @me
        ORDER BY CASE c.type WHEN 'company' THEN 0 WHEN 'team' THEN 1 ELSE 2 END, c.name`,
    )
    .all({ me }) as Array<Record<string, unknown>>;

  const channels = rows.map((c) => {
    // Ein DM traegt den Namen des jeweils anderen Teilnehmers.
    let name = c.name as string;
    let partner: { id: number; name: string; accent: string } | null = null;
    if (c.type === 'dm') {
      const other = db
        .prepare(
          `SELECT u.id, u.name, u.accent FROM channel_members cm
             JOIN users u ON u.id = cm.user_id
            WHERE cm.channel_id = ? AND cm.user_id != ? LIMIT 1`,
        )
        .get(c.id, me) as { id: number; name: string; accent: string } | undefined;
      if (other) {
        name = other.name;
        partner = other;
      }
    }
    return {
      id: c.id,
      slug: c.slug,
      name,
      type: c.type,
      teamId: c.team_id,
      teamColor: c.team_color,
      topic: c.topic,
      unread: Number(c.unread ?? 0),
      lastBody: c.last_body ?? '',
      lastAt: toIso(c.last_at as string | null),
      partner,
    };
  });

  res.json({ channels, totalUnread: channels.reduce((sum, c) => sum + c.unread, 0) });
});

chatRouter.get('/channels/:id/messages', (req, res) => {
  const channelId = intParam(req.params.id);
  assertMember(channelId, req.user!.id);

  const before = req.query.before ? Number(req.query.before) : null;
  const limit = Math.min(Number(req.query.limit) || 60, 200);

  const rows = db
    .prepare(
      `SELECT m.*, u.name AS author_name, u.accent AS author_accent, u.title AS author_title,
              l.first_name || ' ' || l.last_name AS lead_name, l.public_ref AS lead_ref
         FROM messages m
         LEFT JOIN users u ON u.id = m.user_id
         LEFT JOIN leads l ON l.id = m.lead_id
        WHERE m.channel_id = ? ${before ? 'AND m.id < ?' : ''}
        ORDER BY m.id DESC LIMIT ?`,
    )
    .all(...(before ? [channelId, before, limit] : [channelId, limit])) as Array<Record<string, unknown>>;

  res.json({ messages: rows.reverse().map(serializeMessage), hasMore: rows.length === limit });
});

const sendSchema = z.object({
  body: z.string().trim().min(1, 'Nachricht darf nicht leer sein.').max(4000),
  leadId: z.number().int().positive().nullable().optional(),
});

chatRouter.post('/channels/:id/messages', (req, res) => {
  const channelId = intParam(req.params.id);
  const me = req.user!;
  assertMember(channelId, me.id);
  const input = sendSchema.parse(req.body);

  const info = db
    .prepare('INSERT INTO messages (channel_id, user_id, body, kind, lead_id) VALUES (?, ?, ?, ?, ?)')
    .run(channelId, me.id, input.body, 'text', input.leadId ?? null);

  const message = serializeMessage(
    db
      .prepare(
        `SELECT m.*, u.name AS author_name, u.accent AS author_accent, u.title AS author_title,
                l.first_name || ' ' || l.last_name AS lead_name, l.public_ref AS lead_ref
           FROM messages m
           LEFT JOIN users u ON u.id = m.user_id
           LEFT JOIN leads l ON l.id = m.lead_id
          WHERE m.id = ?`,
      )
      .get(Number(info.lastInsertRowid)) as Record<string, unknown>,
  );

  db.prepare('UPDATE channel_members SET last_read_at = ? WHERE channel_id = ? AND user_id = ?').run(
    nowSql(), channelId, me.id,
  );
  emit.toChannel(channelId, 'chat:message', { message });

  // @-Erwaehnungen und Direktnachrichten erzeugen eine Benachrichtigung.
  const channel = db.prepare('SELECT name, type FROM channels WHERE id = ?').get(channelId) as
    | { name: string; type: string }
    | undefined;
  const others = db
    .prepare('SELECT user_id FROM channel_members WHERE channel_id = ? AND user_id != ?')
    .all(channelId, me.id) as Array<{ user_id: number }>;

  const mentionedNames = [...input.body.matchAll(/@([\wäöüÄÖÜß.-]+)/g)].map((m) => m[1].toLowerCase());
  for (const { user_id: uid } of others) {
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(uid) as { name: string } | undefined;
    const isMentioned =
      mentionedNames.length > 0 &&
      user !== undefined &&
      mentionedNames.some((n) => user.name.toLowerCase().split(' ').some((part) => part.startsWith(n)));

    if (channel?.type === 'dm' || isMentioned) {
      notify({
        userId: uid,
        type: isMentioned ? 'mention' : 'chat_message',
        title: channel?.type === 'dm' ? `Nachricht von ${me.name}` : `${me.name} hat dich erwähnt`,
        body: input.body.slice(0, 160),
        link: `/app/chat/${channelId}`,
        urgency: 'normal',
      });
    }
  }

  res.status(201).json({ message });
});

chatRouter.post('/channels/:id/read', (req, res) => {
  const channelId = intParam(req.params.id);
  assertMember(channelId, req.user!.id);
  db.prepare('UPDATE channel_members SET last_read_at = ? WHERE channel_id = ? AND user_id = ?').run(
    nowSql(), channelId, req.user!.id,
  );
  res.json({ ok: true });
});

/** Direktnachricht oeffnen bzw. den bestehenden Kanal wiederverwenden. */
chatRouter.post('/dm/:userId', (req, res) => {
  const otherId = intParam(req.params.userId, 'Benutzer-ID');
  const me = req.user!.id;
  if (otherId === me) throw badRequest('Du kannst dir nicht selbst schreiben.');

  const other = db.prepare('SELECT id, name FROM users WHERE id = ? AND is_active = 1').get(otherId) as
    | { id: number; name: string }
    | undefined;
  if (!other) throw notFound('Benutzer nicht gefunden.');

  const existing = db
    .prepare(
      `SELECT c.id FROM channels c
        WHERE c.type = 'dm'
          AND (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) = 2
          AND EXISTS (SELECT 1 FROM channel_members a WHERE a.channel_id = c.id AND a.user_id = ?)
          AND EXISTS (SELECT 1 FROM channel_members b WHERE b.channel_id = c.id AND b.user_id = ?)
        LIMIT 1`,
    )
    .get(me, otherId) as { id: number } | undefined;

  if (existing) {
    res.json({ channelId: existing.id });
    return;
  }

  const info = db
    .prepare(`INSERT INTO channels (slug, name, type, created_by) VALUES (NULL, ?, 'dm', ?)`)
    .run(other.name, me);
  const channelId = Number(info.lastInsertRowid);
  const add = db.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)');
  add.run(channelId, me);
  add.run(channelId, otherId);

  emit.joinChannel(me, channelId);
  emit.joinChannel(otherId, channelId);
  emit.toUser(otherId, 'chat:channel', { channelId });

  res.status(201).json({ channelId });
});

function serializeMessage(m: Record<string, unknown>) {
  return {
    id: m.id,
    channelId: m.channel_id,
    body: m.body,
    kind: m.kind,
    leadId: m.lead_id,
    leadName: m.lead_name ?? null,
    leadRef: m.lead_ref ?? null,
    meta: safeParse(m.meta as string),
    author: m.user_id
      ? { id: m.user_id, name: m.author_name, accent: m.author_accent, title: m.author_title }
      : null,
    createdAt: toIso(m.created_at as string),
  };
}

function safeParse(v: string): Record<string, unknown> {
  try {
    return JSON.parse(v || '{}');
  } catch {
    return {};
  }
}
