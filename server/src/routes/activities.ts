import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { intParam, notFound } from '../lib/http.js';
import { getLead, logActivity, markFirstContact, serializeLead } from '../lib/leads.js';
import { emit } from '../lib/realtime.js';
import { nowSql, toSql } from '../lib/time.js';
import { serializeActivity } from './leads.js';

export const activitiesRouter = Router();
activitiesRouter.use(requireAuth);

const ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'whatsapp', 'voice_note', 'system'] as const;

const createSchema = z.object({
  leadId: z.number().int().positive(),
  type: z.enum(ACTIVITY_TYPES).default('note'),
  title: z.string().trim().max(200).default(''),
  body: z.string().trim().max(10_000).default(''),
  outcome: z.string().trim().max(40).default(''),
  direction: z.enum(['inbound', 'outbound', '']).default(''),
  durationS: z.number().int().min(0).max(86_400).default(0),
  occurredAt: z.string().datetime().optional(),
  /** Zaehlt dieser Eintrag als Erstkontakt? Stoppt dann die Reaktionsuhr. */
  countsAsContact: z.boolean().default(false),
  meta: z.record(z.string(), z.unknown()).default({}),
});

const DEFAULT_TITLES: Record<string, string> = {
  note: 'Notiz',
  call: 'Anruf',
  email: 'E-Mail',
  meeting: 'Termin',
  whatsapp: 'WhatsApp-Nachricht',
  voice_note: 'Sprachnotiz',
  system: 'Systemeintrag',
};

activitiesRouter.post('/', (req, res) => {
  const input = createSchema.parse(req.body);
  const lead = getLead(input.leadId);
  if (!lead) throw notFound('Lead nicht gefunden.');

  let responseSeconds: number | null = null;
  const isContactChannel = ['call', 'email', 'meeting', 'whatsapp'].includes(input.type);
  if ((input.countsAsContact || isContactChannel) && !lead.first_contact_at) {
    responseSeconds = markFirstContact(input.leadId, req.user!.id);
  }

  const id = logActivity({
    leadId: input.leadId,
    userId: req.user!.id,
    type: input.type,
    title: input.title || DEFAULT_TITLES[input.type] || 'Eintrag',
    body: input.body,
    outcome: input.outcome,
    direction: input.direction,
    durationS: input.durationS,
    meta: input.meta,
    occurredAt: input.occurredAt ? toSql(new Date(input.occurredAt)) : nowSql(),
  });

  const row = db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.accent AS user_accent FROM activities a
         LEFT JOIN users u ON u.id = a.user_id WHERE a.id = ?`,
    )
    .get(id) as Record<string, unknown>;

  const updated = serializeLead(getLead(input.leadId)!);
  emit.toCompany('lead:updated', { lead: updated });
  emit.toCompany('activity:new', { activity: serializeActivity(row) });

  res.status(201).json({ activity: serializeActivity(row), lead: updated, responseSeconds });
});

activitiesRouter.patch('/:id/pin', (req, res) => {
  const id = intParam(req.params.id);
  const row = db.prepare('SELECT is_pinned FROM activities WHERE id = ?').get(id) as
    | { is_pinned: number }
    | undefined;
  if (!row) throw notFound('Eintrag nicht gefunden.');
  db.prepare('UPDATE activities SET is_pinned = ? WHERE id = ?').run(row.is_pinned ? 0 : 1, id);
  res.json({ ok: true, isPinned: !row.is_pinned });
});

/** Firmenweiter Aktivitaetsstream fuer das Dashboard. */
activitiesRouter.get('/stream', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 200);
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.accent AS user_accent,
              l.first_name || ' ' || l.last_name AS lead_name, l.public_ref AS lead_ref
         FROM activities a
         LEFT JOIN users u ON u.id = a.user_id
         JOIN leads l ON l.id = a.lead_id
        ORDER BY a.occurred_at DESC, a.id DESC LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>;

  res.json({
    activities: rows.map((r) => ({
      ...serializeActivity(r),
      leadName: r.lead_name,
      leadRef: r.lead_ref,
    })),
  });
});
