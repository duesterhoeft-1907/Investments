import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { asyncHandler, badRequest, intParam, notFound } from '../lib/http.js';
import {
  formatDuration,
  getLead,
  LEAD_SELECT,
  LEAD_STATUS,
  logActivity,
  markFirstContact,
  serializeLead,
  STATUS_LABEL,
  type LeadRow,
  type LeadStatus,
} from '../lib/leads.js';
import { notify } from '../lib/notify.js';
import { emit } from '../lib/realtime.js';
import { nowSql, toIso } from '../lib/time.js';

export const leadsRouter = Router();
leadsRouter.use(requireAuth);

const listQuery = z.object({
  status: z.string().optional(),
  teamId: z.coerce.number().int().positive().optional(),
  ownerId: z.coerce.number().int().positive().optional(),
  assetClassId: z.coerce.number().int().positive().optional(),
  scope: z.enum(['all', 'mine', 'my-teams', 'unassigned', 'awaiting']).default('all'),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'oldest', 'sla', 'score', 'volume']).default('newest'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

leadsRouter.get('/', (req, res) => {
  const q = listQuery.parse(req.query);
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (q.status) {
    const list = q.status.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length) {
      where.push(`l.status IN (${list.map((_, i) => `@st${i}`).join(',')})`);
      list.forEach((s, i) => (params[`st${i}`] = s));
    }
  }
  if (q.teamId) { where.push('l.team_id = @teamId'); params.teamId = q.teamId; }
  if (q.ownerId) { where.push('l.owner_id = @ownerId'); params.ownerId = q.ownerId; }
  if (q.assetClassId) { where.push('l.asset_class_id = @assetClassId'); params.assetClassId = q.assetClassId; }

  if (q.scope === 'mine') { where.push('l.owner_id = @me'); params.me = req.user!.id; }
  if (q.scope === 'unassigned') where.push('l.owner_id IS NULL');
  if (q.scope === 'awaiting') where.push('l.first_contact_at IS NULL');
  if (q.scope === 'my-teams') {
    where.push('l.team_id IN (SELECT team_id FROM team_members WHERE user_id = @me)');
    params.me = req.user!.id;
  }
  if (q.q) {
    where.push(
      `(l.first_name LIKE @search OR l.last_name LIKE @search OR l.email LIKE @search
        OR l.company LIKE @search OR l.public_ref LIKE @search OR l.city LIKE @search)`,
    );
    params.search = `%${q.q}%`;
  }

  const order = {
    newest: 'l.created_at DESC',
    oldest: 'l.created_at ASC',
    sla: 'CASE WHEN l.first_contact_at IS NULL THEN 0 ELSE 1 END, l.sla_due_at ASC',
    score: 'l.score DESC, l.created_at DESC',
    volume: 'l.volume_value DESC, l.created_at DESC',
  }[q.sort];

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(`${LEAD_SELECT} ${clause} ORDER BY ${order} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: q.limit, offset: q.offset }) as LeadRow[];
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM leads l ${clause}`).get(params) as { c: number }
  ).c;

  res.json({ leads: rows.map(serializeLead), total });
});

leadsRouter.get('/:id', (req, res) => {
  const lead = getLead(intParam(req.params.id));
  if (!lead) throw notFound('Lead nicht gefunden.');

  const activities = db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.accent AS user_accent
         FROM activities a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.lead_id = ? ORDER BY a.occurred_at DESC, a.id DESC`,
    )
    .all(lead.id) as Array<Record<string, unknown>>;

  const attachments = db
    .prepare(
      `SELECT a.*, u.name AS uploaded_by_name FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
        WHERE a.lead_id = ? ORDER BY a.id DESC`,
    )
    .all(lead.id) as Array<Record<string, unknown>>;

  const tasks = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name, u.accent AS assignee_accent
         FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
        WHERE t.lead_id = ? ORDER BY (t.status = 'open') DESC, t.due_at ASC`,
    )
    .all(lead.id) as Array<Record<string, unknown>>;

  const offers = db
    .prepare(
      `SELECT o.*, u.name AS created_by_name FROM offers o
         LEFT JOIN users u ON u.id = o.created_by
        WHERE o.lead_id = ? ORDER BY o.id DESC`,
    )
    .all(lead.id) as Array<Record<string, unknown>>;

  const emails = db
    .prepare('SELECT * FROM email_log WHERE lead_id = ? ORDER BY id DESC LIMIT 50')
    .all(lead.id) as Array<Record<string, unknown>>;

  res.json({
    lead: serializeLead(lead),
    activities: activities.map(serializeActivity),
    attachments: attachments.map(serializeAttachment),
    tasks: tasks.map(serializeTask),
    offers: offers.map(serializeOffer),
    emails: emails.map((e) => ({
      id: e.id,
      to: e.to_address,
      subject: e.subject,
      template: e.template,
      status: e.status,
      preview: e.preview,
      createdAt: toIso(e.created_at as string),
    })),
  });
});

/** Erstkontakt bestaetigen – stoppt die Reaktionsuhr. */
const contactSchema = z.object({
  channel: z.enum(['call', 'email', 'whatsapp', 'meeting']).default('call'),
  outcome: z.string().trim().max(40).default('reached'),
  note: z.string().trim().max(4000).default(''),
  durationS: z.coerce.number().int().min(0).max(86_400).default(0),
});

leadsRouter.post('/:id/contact', (req, res) => {
  const id = intParam(req.params.id);
  const lead = getLead(id);
  if (!lead) throw notFound('Lead nicht gefunden.');

  const input = contactSchema.parse(req.body);
  const seconds = markFirstContact(id, req.user!.id);

  logActivity({
    leadId: id,
    userId: req.user!.id,
    type: input.channel,
    direction: 'outbound',
    title: CONTACT_TITLES[input.channel],
    body: input.note,
    outcome: input.outcome,
    durationS: input.durationS,
  });

  // Offene "Erstkontakt herstellen"-Aufgabe automatisch schliessen
  if (seconds !== null) {
    db.prepare(
      `UPDATE tasks SET status = 'done', completed_at = ?
        WHERE lead_id = ? AND status = 'open' AND kind = 'call' AND title LIKE 'Erstkontakt%'`,
    ).run(nowSql(), id);
  }

  const updated = serializeLead(getLead(id)!);
  emit.toCompany('lead:updated', { lead: updated });
  emit.toCompany('stats:dirty', { reason: 'contact' });

  res.json({
    lead: updated,
    responseSeconds: seconds,
    responseLabel: seconds === null ? null : formatDuration(seconds),
  });
});

const CONTACT_TITLES: Record<string, string> = {
  call: 'Anruf geführt',
  email: 'E-Mail gesendet',
  whatsapp: 'Nachricht über WhatsApp',
  meeting: 'Termin durchgeführt',
};

const updateSchema = z.object({
  status: z.enum(LEAD_STATUS).optional(),
  ownerId: z.number().int().positive().nullable().optional(),
  teamId: z.number().int().positive().nullable().optional(),
  lostReason: z.string().trim().max(400).optional(),
  phone: z.string().trim().max(60).optional(),
  email: z.string().trim().email().max(200).optional(),
  company: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  goal: z.string().trim().max(400).optional(),
  score: z.number().int().min(0).max(100).optional(),
});

leadsRouter.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const before = getLead(id);
  if (!before) throw notFound('Lead nicht gefunden.');
  const patch = updateSchema.parse(req.body);

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  const push = (col: string, key: string, value: unknown) => {
    sets.push(`${col} = @${key}`);
    params[key] = value;
  };

  if (patch.status && patch.status !== before.status) {
    push('status', 'status', patch.status);
    push('stage_changed_at', 'stageChangedAt', nowSql());
  }
  if (patch.ownerId !== undefined) push('owner_id', 'ownerId', patch.ownerId);
  if (patch.teamId !== undefined) push('team_id', 'teamId', patch.teamId);
  if (patch.lostReason !== undefined) push('lost_reason', 'lostReason', patch.lostReason);
  if (patch.phone !== undefined) push('phone', 'phone', patch.phone);
  if (patch.email !== undefined) push('email', 'email', patch.email);
  if (patch.company !== undefined) push('company', 'company', patch.company);
  if (patch.city !== undefined) push('city', 'city', patch.city);
  if (patch.goal !== undefined) push('goal', 'goal', patch.goal);
  if (patch.score !== undefined) push('score', 'score', patch.score);

  if (!sets.length) {
    res.json({ lead: serializeLead(before) });
    return;
  }

  sets.push(`updated_at = @updatedAt`);
  params.updatedAt = nowSql();
  db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = @id`).run(params);

  if (patch.status && patch.status !== before.status) {
    logActivity({
      leadId: id,
      userId: req.user!.id,
      type: 'status_change',
      title: `Status: ${STATUS_LABEL[patch.status as LeadStatus]}`,
      body: patch.lostReason ? `Grund: ${patch.lostReason}` : `Zuvor: ${STATUS_LABEL[before.status]}`,
      meta: { from: before.status, to: patch.status },
    });
  }

  if (patch.ownerId !== undefined && patch.ownerId !== before.owner_id) {
    const owner = patch.ownerId
      ? (db.prepare('SELECT name FROM users WHERE id = ?').get(patch.ownerId) as { name: string } | undefined)
      : undefined;
    logActivity({
      leadId: id,
      userId: req.user!.id,
      type: 'assignment',
      title: owner ? `Übergeben an ${owner.name}` : 'Zuweisung aufgehoben',
      meta: { from: before.owner_id, to: patch.ownerId },
    });
    if (patch.ownerId && patch.ownerId !== req.user!.id) {
      notify({
        userId: patch.ownerId,
        type: 'assignment',
        title: `${req.user!.name} hat dir einen Lead übergeben`,
        body: `${before.first_name} ${before.last_name} · ${before.asset_class_name ?? ''}`,
        link: `/app/leads/${id}`,
        leadId: id,
        urgency: 'high',
      });
    }
  }

  const updated = serializeLead(getLead(id)!);
  emit.toCompany('lead:updated', { lead: updated });
  emit.toCompany('stats:dirty', { reason: 'lead:update' });
  res.json({ lead: updated });
});

/** Lead aus der Gruppe uebernehmen ("Ich mache das"). */
leadsRouter.post('/:id/claim', (req, res) => {
  const id = intParam(req.params.id);
  const lead = getLead(id);
  if (!lead) throw notFound('Lead nicht gefunden.');

  const isMember = db
    .prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?')
    .get(lead.team_id, req.user!.id);
  if (!isMember && req.user!.role === 'agent') {
    throw badRequest('Du gehörst nicht zu der zuständigen Fachgruppe.');
  }

  db.prepare('UPDATE leads SET owner_id = ?, updated_at = ? WHERE id = ?').run(
    req.user!.id, nowSql(), id,
  );
  logActivity({
    leadId: id,
    userId: req.user!.id,
    type: 'assignment',
    title: `${req.user!.name} hat den Lead übernommen`,
    meta: { from: lead.owner_id, to: req.user!.id, claimed: true },
  });

  const updated = serializeLead(getLead(id)!);
  emit.toCompany('lead:updated', { lead: updated });
  res.json({ lead: updated });
});

leadsRouter.delete('/:id', requireRole('admin'), (req, res) => {
  const id = intParam(req.params.id);
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  emit.toCompany('stats:dirty', { reason: 'lead:delete' });
  res.json({ ok: true });
});

// ───────────────────────── Serializer ─────────────────────────

export function serializeActivity(a: Record<string, unknown>) {
  return {
    id: a.id,
    leadId: a.lead_id,
    type: a.type,
    title: a.title,
    body: a.body,
    outcome: a.outcome,
    direction: a.direction,
    durationS: a.duration_s,
    isPinned: Boolean(a.is_pinned),
    meta: safeParse(a.meta as string),
    user: a.user_id ? { id: a.user_id, name: a.user_name, accent: a.user_accent } : null,
    occurredAt: toIso(a.occurred_at as string),
    createdAt: toIso(a.created_at as string),
  };
}

export function serializeAttachment(a: Record<string, unknown>) {
  return {
    id: a.id,
    leadId: a.lead_id,
    activityId: a.activity_id,
    kind: a.kind,
    filename: a.filename,
    url: `/api/uploads/${a.stored_name}`,
    mime: a.mime,
    sizeBytes: a.size_bytes,
    durationS: a.duration_s,
    transcript: a.transcript,
    visibleToClient: Boolean(a.visible_to_client),
    uploadedBy: a.uploaded_by_name ?? null,
    createdAt: toIso(a.created_at as string),
  };
}

export function serializeTask(t: Record<string, unknown>) {
  return {
    id: t.id,
    leadId: t.lead_id,
    kind: t.kind,
    title: t.title,
    description: t.description,
    dueAt: toIso(t.due_at as string),
    durationMin: t.duration_min,
    recurrence: t.recurrence,
    status: t.status,
    completedAt: toIso(t.completed_at as string | null),
    visibleToClient: Boolean(t.visible_to_client),
    assignee: t.assigned_to ? { id: t.assigned_to, name: t.assignee_name, accent: t.assignee_accent } : null,
    leadName: t.lead_name ?? null,
    createdAt: toIso(t.created_at as string),
  };
}

export function serializeOffer(o: Record<string, unknown>) {
  return {
    id: o.id,
    leadId: o.lead_id,
    title: o.title,
    summary: o.summary,
    body: o.body,
    amount: o.amount,
    currency: o.currency,
    status: o.status,
    generatedBy: o.generated_by,
    validUntil: toIso(o.valid_until as string | null),
    sentAt: toIso(o.sent_at as string | null),
    respondedAt: toIso(o.responded_at as string | null),
    createdBy: o.created_by_name ?? null,
    createdAt: toIso(o.created_at as string),
  };
}

function safeParse(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}
