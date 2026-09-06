import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { env } from '../env.js';
import {
  clearCookie,
  hashPassword,
  issuePortalCookie,
  PORTAL_COOKIE,
  requirePortal,
  verifyPassword,
} from '../lib/auth.js';
import { asyncHandler, badRequest, HttpError, notFound } from '../lib/http.js';
import { getLead, logActivity, serializeLead, STATUS_LABEL, type LeadStatus } from '../lib/leads.js';
import { notify } from '../lib/notify.js';
import { emit } from '../lib/realtime.js';
import { nowSql, toIso } from '../lib/time.js';

export const portalRouter = Router();

/** Oeffentlicher Teaser: bestaetigt, dass der Link gueltig ist – ohne Daten preiszugeben. */
portalRouter.get('/preview/:token', (req, res) => {
  const lead = db
    .prepare(
      `SELECT l.first_name, l.public_ref, ac.name AS asset_class, u.name AS owner_name
         FROM leads l
         LEFT JOIN asset_classes ac ON ac.id = l.asset_class_id
         LEFT JOIN users u ON u.id = l.owner_id
        WHERE l.portal_token = ?`,
    )
    .get(String(req.params.token)) as
    | { first_name: string; public_ref: string; asset_class: string | null; owner_name: string | null }
    | undefined;

  if (!lead) throw notFound('Dieser Zugang ist nicht (mehr) gültig.');

  res.json({
    firstName: lead.first_name,
    ref: lead.public_ref,
    assetClass: lead.asset_class,
    advisor: lead.owner_name,
    company: env.company,
  });
});

const loginSchema = z.object({
  token: z.string().trim().min(8).max(64).optional(),
  email: z.string().trim().email('Bitte gültige E-Mail-Adresse angeben.').max(200),
  password: z.string().min(1).max(200),
});

portalRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { token, email, password } = loginSchema.parse(req.body);
    const row = (
      token
        ? db.prepare('SELECT * FROM leads WHERE portal_token = ?').get(token)
        : db.prepare('SELECT * FROM leads WHERE lower(email) = lower(?) ORDER BY id DESC LIMIT 1').get(email)
    ) as { id: number; email: string; portal_password_hash: string | null; portal_token: string | null } | undefined;

    if (
      !row ||
      !row.portal_password_hash ||
      row.email.toLowerCase() !== email.toLowerCase() ||
      !(await verifyPassword(row.portal_password_hash, password))
    ) {
      throw new HttpError(401, 'E-Mail oder Passwort stimmt nicht.');
    }

    db.prepare('UPDATE leads SET portal_last_login = ? WHERE id = ?').run(nowSql(), row.id);
    issuePortalCookie(res, row.id, row.portal_token ?? '');

    logActivity({
      leadId: row.id,
      type: 'portal_login',
      title: 'Kunde hat sich im Portal angemeldet',
    });

    res.json({ ok: true, token: row.portal_token });
  }),
);

portalRouter.post('/logout', (_req, res) => {
  clearCookie(res, PORTAL_COOKIE);
  res.json({ ok: true });
});

/** Alles, was der Kunde auf seiner Landing sieht. */
portalRouter.get('/me', requirePortal, (req, res) => {
  const lead = getLead(req.portal!.leadId);
  if (!lead) throw notFound('Vorgang nicht gefunden.');

  const serialized = serializeLead(lead);
  const advisor = lead.owner_id
    ? (db
        .prepare('SELECT id, name, title, phone, email, accent FROM users WHERE id = ?')
        .get(lead.owner_id) as Record<string, unknown> | undefined)
    : undefined;

  const nextSteps = db
    .prepare(
      `SELECT id, kind, title, description, due_at, status FROM tasks
        WHERE lead_id = ? AND visible_to_client = 1 AND status != 'cancelled'
        ORDER BY (status = 'open') DESC, due_at ASC LIMIT 20`,
    )
    .all(lead.id) as Array<Record<string, unknown>>;

  const offers = db
    .prepare(
      `SELECT id, title, summary, body, amount, currency, status, valid_until, sent_at
         FROM offers WHERE lead_id = ? AND status != 'draft' ORDER BY id DESC`,
    )
    .all(lead.id) as Array<Record<string, unknown>>;

  const documents = db
    .prepare(
      `SELECT id, filename, stored_name, mime, size_bytes, created_at FROM attachments
        WHERE lead_id = ? AND visible_to_client = 1 ORDER BY id DESC`,
    )
    .all(lead.id) as Array<Record<string, unknown>>;

  const conversation = db
    .prepare(
      `SELECT a.id, a.type, a.title, a.body, a.occurred_at, u.name AS user_name
         FROM activities a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.lead_id = ? AND a.type IN ('client_message','offer_sent','meeting','first_contact','lead_created')
        ORDER BY a.occurred_at DESC LIMIT 30`,
    )
    .all(lead.id) as Array<Record<string, unknown>>;

  const STAGES: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won'];

  res.json({
    company: env.company,
    lead: {
      ref: serialized.ref,
      firstName: serialized.firstName,
      lastName: serialized.lastName,
      email: serialized.email,
      phone: serialized.phone,
      assetClass: serialized.assetClass,
      volumeLabel: serialized.volumeLabel,
      horizonLabel: serialized.horizonLabel,
      goal: serialized.goal,
      status: serialized.status,
      statusLabel: serialized.statusLabel,
      createdAt: serialized.createdAt,
      stageIndex: Math.max(0, STAGES.indexOf(serialized.status as LeadStatus)),
      stages: STAGES.map((s) => ({ key: s, label: STATUS_LABEL[s] })),
    },
    advisor: advisor
      ? {
          name: advisor.name,
          title: advisor.title,
          phone: advisor.phone,
          email: advisor.email,
          accent: advisor.accent,
        }
      : null,
    nextSteps: nextSteps.map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      description: t.description,
      dueAt: toIso(t.due_at as string),
      done: t.status === 'done',
    })),
    offers: offers.map((o) => ({
      id: o.id,
      title: o.title,
      summary: o.summary,
      body: o.body,
      amount: o.amount,
      currency: o.currency,
      status: o.status,
      validUntil: toIso(o.valid_until as string | null),
      sentAt: toIso(o.sent_at as string | null),
    })),
    documents: documents.map((d) => ({
      id: d.id,
      filename: d.filename,
      url: `/api/uploads/${d.stored_name}`,
      mime: d.mime,
      sizeBytes: d.size_bytes,
      createdAt: toIso(d.created_at as string),
    })),
    conversation: conversation.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.title,
      body: c.body,
      author: c.user_name ?? null,
      occurredAt: toIso(c.occurred_at as string),
    })),
  });
});

const messageSchema = z.object({ body: z.string().trim().min(2, 'Bitte eine Nachricht eingeben.').max(4000) });

/** Nachricht des Kunden – landet im Aktivitaetsstream und alarmiert den Berater. */
portalRouter.post('/messages', requirePortal, (req, res) => {
  const { body } = messageSchema.parse(req.body);
  const lead = getLead(req.portal!.leadId);
  if (!lead) throw notFound('Vorgang nicht gefunden.');

  logActivity({
    leadId: lead.id,
    type: 'client_message',
    direction: 'inbound',
    title: 'Nachricht aus dem Kundenportal',
    body,
  });

  if (lead.owner_id) {
    notify({
      userId: lead.owner_id,
      type: 'client_message',
      title: `Nachricht von ${lead.first_name} ${lead.last_name}`,
      body: body.slice(0, 160),
      link: `/app/leads/${lead.id}`,
      leadId: lead.id,
      urgency: 'high',
    });
  }
  emit.toCompany('lead:updated', { lead: serializeLead(getLead(lead.id)!) });

  res.status(201).json({ ok: true });
});

const offerResponseSchema = z.object({
  offerId: z.number().int().positive(),
  decision: z.enum(['accepted', 'declined']),
  note: z.string().trim().max(2000).default(''),
});

portalRouter.post('/offers/respond', requirePortal, (req, res) => {
  const { offerId, decision, note } = offerResponseSchema.parse(req.body);
  const lead = getLead(req.portal!.leadId);
  if (!lead) throw notFound('Vorgang nicht gefunden.');

  const offer = db.prepare('SELECT * FROM offers WHERE id = ? AND lead_id = ?').get(offerId, lead.id) as
    | { id: number; title: string; status: string }
    | undefined;
  if (!offer) throw notFound('Angebot nicht gefunden.');
  if (offer.status !== 'sent') throw badRequest('Dieses Angebot kann nicht mehr beantwortet werden.');

  db.prepare('UPDATE offers SET status = ?, responded_at = ? WHERE id = ?').run(decision, nowSql(), offerId);
  db.prepare('UPDATE leads SET status = ?, stage_changed_at = ?, updated_at = ? WHERE id = ?').run(
    decision === 'accepted' ? 'won' : 'lost', nowSql(), nowSql(), lead.id,
  );

  logActivity({
    leadId: lead.id,
    type: 'client_message',
    direction: 'inbound',
    title: decision === 'accepted' ? `Angebot angenommen: ${offer.title}` : `Angebot abgelehnt: ${offer.title}`,
    body: note,
    meta: { offerId, decision },
  });

  if (lead.owner_id) {
    notify({
      userId: lead.owner_id,
      type: 'client_message',
      title: decision === 'accepted' ? '🎉 Angebot angenommen' : 'Angebot abgelehnt',
      body: `${lead.first_name} ${lead.last_name} · ${offer.title}`,
      link: `/app/leads/${lead.id}`,
      leadId: lead.id,
      urgency: 'critical',
    });
  }
  emit.toCompany('lead:updated', { lead: serializeLead(getLead(lead.id)!) });
  emit.toCompany('stats:dirty', { reason: 'offer:respond' });

  res.json({ ok: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Mindestens 8 Zeichen.').max(200),
});

portalRouter.post(
  '/password',
  requirePortal,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const row = db.prepare('SELECT portal_password_hash FROM leads WHERE id = ?').get(req.portal!.leadId) as
      | { portal_password_hash: string | null }
      | undefined;
    if (!row?.portal_password_hash || !(await verifyPassword(row.portal_password_hash, currentPassword))) {
      throw badRequest('Aktuelles Passwort stimmt nicht.');
    }
    db.prepare('UPDATE leads SET portal_password_hash = ? WHERE id = ?').run(
      await hashPassword(newPassword), req.portal!.leadId,
    );
    res.json({ ok: true });
  }),
);
