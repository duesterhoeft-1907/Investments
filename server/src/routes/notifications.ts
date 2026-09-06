import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { intParam } from '../lib/http.js';
import { unreadCount } from '../lib/notify.js';
import { toIso } from '../lib/time.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(req.user!.id, limit) as Array<Record<string, unknown>>;

  res.json({
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      leadId: n.lead_id,
      urgency: n.urgency,
      isRead: Boolean(n.is_read),
      createdAt: toIso(n.created_at as string),
    })),
    unread: unreadCount(req.user!.id),
  });
});

notificationsRouter.post('/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
    intParam(req.params.id), req.user!.id,
  );
  res.json({ ok: true, unread: unreadCount(req.user!.id) });
});

notificationsRouter.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user!.id);
  res.json({ ok: true, unread: 0 });
});

/** Postausgang – auch ohne SMTP nachvollziehbar, was rausgegangen waere. */
notificationsRouter.get('/outbox', (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, l.first_name || ' ' || l.last_name AS lead_name, l.public_ref AS lead_ref
         FROM email_log e LEFT JOIN leads l ON l.id = e.lead_id
        ORDER BY e.id DESC LIMIT 100`,
    )
    .all() as Array<Record<string, unknown>>;
  res.json({
    emails: rows.map((e) => ({
      id: e.id,
      to: e.to_address,
      subject: e.subject,
      template: e.template,
      status: e.status,
      error: e.error,
      preview: e.preview,
      leadId: e.lead_id,
      leadName: e.lead_name,
      leadRef: e.lead_ref,
      createdAt: toIso(e.created_at as string),
    })),
  });
});
