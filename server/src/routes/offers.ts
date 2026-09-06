import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { env } from '../env.js';
import { requireAuth } from '../lib/auth.js';
import { aiEnabled, draftOffer } from '../lib/ai.js';
import { asyncHandler, intParam, notFound } from '../lib/http.js';
import { getLead, logActivity } from '../lib/leads.js';
import { escapeHtml, sendMail } from '../lib/mailer.js';
import { nowSql, toSql } from '../lib/time.js';
import { serializeOffer } from './leads.js';

export const offersRouter = Router();
offersRouter.use(requireAuth);

const OFFER_SELECT = `
  SELECT o.*, u.name AS created_by_name FROM offers o
    LEFT JOIN users u ON u.id = o.created_by`;

offersRouter.get('/ai-status', (_req, res) => {
  res.json({ enabled: aiEnabled(), model: aiEnabled() ? env.anthropicModel : null });
});

const draftSchema = z.object({
  leadId: z.number().int().positive(),
  instruction: z.string().trim().max(2000).default(''),
});

/** Entwurf erzeugen – KI, wenn konfiguriert, sonst Textbaustein. */
offersRouter.post(
  '/draft',
  asyncHandler(async (req, res) => {
    const { leadId, instruction } = draftSchema.parse(req.body);
    const lead = getLead(leadId);
    if (!lead) throw notFound('Lead nicht gefunden.');

    const draft = await draftOffer(lead, instruction);

    const info = db
      .prepare(
        `INSERT INTO offers (lead_id, created_by, title, summary, body, amount, status, generated_by, valid_until)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .run(
        leadId, req.user!.id, draft.title, draft.summary, draft.body, draft.amount,
        draft.generatedBy, toSql(new Date(Date.now() + 14 * 24 * 3600_000)),
      );

    const offerId = Number(info.lastInsertRowid);

    // Vorgeschlagene naechste Schritte als kundensichtbare Aufgaben anlegen
    const dueBase = Date.now();
    draft.nextSteps.forEach((step, i) => {
      db.prepare(
        `INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, due_at, recurrence, visible_to_client)
         VALUES (?, ?, ?, 'task', ?, ?, 'none', 1)`,
      ).run(leadId, lead.owner_id, req.user!.id, step, toSql(new Date(dueBase + (i + 1) * 24 * 3600_000)));
    });

    logActivity({
      leadId,
      userId: req.user!.id,
      type: 'system',
      title: draft.generatedBy === 'ai' ? 'Angebotsentwurf per KI erstellt' : 'Angebotsentwurf aus Vorlage erstellt',
      body: draft.summary,
      meta: { offerId, generatedBy: draft.generatedBy, model: draft.model ?? null },
    });

    res.status(201).json({
      offer: serializeOffer(db.prepare(`${OFFER_SELECT} WHERE o.id = ?`).get(offerId) as Record<string, unknown>),
      nextSteps: draft.nextSteps,
      note: draft.note ?? null,
      generatedBy: draft.generatedBy,
    });
  }),
);

const saveSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  summary: z.string().trim().max(1000).optional(),
  body: z.string().trim().max(40_000).optional(),
  amount: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'sent', 'accepted', 'declined']).optional(),
  validUntil: z.string().datetime().optional(),
});

offersRouter.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const before = db.prepare('SELECT * FROM offers WHERE id = ?').get(id) as
    | { id: number; lead_id: number; status: string; title: string }
    | undefined;
  if (!before) throw notFound('Angebot nicht gefunden.');

  const patch = saveSchema.parse(req.body);
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  const set = (col: string, key: string, value: unknown) => {
    sets.push(`${col} = @${key}`);
    params[key] = value;
  };

  if (patch.title !== undefined) set('title', 'title', patch.title);
  if (patch.summary !== undefined) set('summary', 'summary', patch.summary);
  if (patch.body !== undefined) set('body', 'body', patch.body);
  if (patch.amount !== undefined) set('amount', 'amount', patch.amount);
  if (patch.validUntil !== undefined) set('valid_until', 'validUntil', toSql(new Date(patch.validUntil)));
  if (patch.status !== undefined) {
    set('status', 'status', patch.status);
    if (patch.status === 'sent') set('sent_at', 'sentAt', nowSql());
    if (patch.status === 'accepted' || patch.status === 'declined') set('responded_at', 'respondedAt', nowSql());
  }
  if (sets.length) db.prepare(`UPDATE offers SET ${sets.join(', ')} WHERE id = @id`).run(params);

  res.json({
    offer: serializeOffer(db.prepare(`${OFFER_SELECT} WHERE o.id = ?`).get(id) as Record<string, unknown>),
  });
});

/** Angebot freigeben: im Portal sichtbar machen und den Kunden informieren. */
offersRouter.post(
  '/:id/send',
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(id) as
      | { id: number; lead_id: number; title: string; summary: string }
      | undefined;
    if (!offer) throw notFound('Angebot nicht gefunden.');

    const lead = getLead(offer.lead_id);
    if (!lead) throw notFound('Lead nicht gefunden.');

    db.prepare(`UPDATE offers SET status = 'sent', sent_at = ? WHERE id = ?`).run(nowSql(), id);
    db.prepare(
      `UPDATE leads SET status = CASE WHEN status IN ('new','contacted','qualified') THEN 'proposal' ELSE status END,
                        stage_changed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(nowSql(), nowSql(), lead.id);

    const portalUrl = `${env.appUrl}/portal/${lead.portal_token}`;
    await sendMail({
      to: lead.email,
      leadId: lead.id,
      template: 'offer_ready',
      subject: `Ihr persönliches Angebot liegt bereit (${lead.public_ref})`,
      html: `<p>Guten Tag ${escapeHtml(lead.first_name)},</p>
             <p>Ihr persönliches Angebot <strong>${escapeHtml(offer.title)}</strong> steht in Ihrem Kundenbereich bereit.</p>
             <p>${escapeHtml(offer.summary)}</p>
             <p><a href="${portalUrl}">Angebot ansehen</a></p>`,
      text: `Ihr Angebot "${offer.title}" steht bereit: ${portalUrl}`,
    });

    logActivity({
      leadId: lead.id,
      userId: req.user!.id,
      type: 'offer_sent',
      title: `Angebot freigegeben: ${offer.title}`,
      body: 'Im Kundenportal sichtbar, Benachrichtigung versendet.',
      meta: { offerId: id },
    });

    res.json({
      offer: serializeOffer(db.prepare(`${OFFER_SELECT} WHERE o.id = ?`).get(id) as Record<string, unknown>),
    });
  }),
);

offersRouter.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM offers WHERE id = ? AND status = 'draft'`).run(intParam(req.params.id));
  res.json({ ok: true });
});
