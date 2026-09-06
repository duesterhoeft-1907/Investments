import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { intParam, notFound } from '../lib/http.js';
import { logActivity } from '../lib/leads.js';
import { nowSql, toSql } from '../lib/time.js';
import { serializeTask } from './leads.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const RECURRENCES = ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly'] as const;
type Recurrence = (typeof RECURRENCES)[number];

const TASK_SELECT = `
  SELECT t.*, u.name AS assignee_name, u.accent AS assignee_accent,
         l.first_name || ' ' || l.last_name AS lead_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN leads l ON l.id = t.lead_id`;

const listQuery = z.object({
  scope: z.enum(['mine', 'all', 'lead']).default('mine'),
  leadId: z.coerce.number().int().positive().optional(),
  status: z.enum(['open', 'done', 'cancelled', 'all']).default('open'),
  window: z.enum(['all', 'today', 'week', 'overdue']).default('all'),
});

tasksRouter.get('/', (req, res) => {
  const q = listQuery.parse(req.query);
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (q.status !== 'all') { where.push('t.status = @status'); params.status = q.status; }
  if (q.scope === 'mine') { where.push('t.assigned_to = @me'); params.me = req.user!.id; }
  if (q.scope === 'lead' || q.leadId) { where.push('t.lead_id = @leadId'); params.leadId = q.leadId ?? 0; }
  if (q.window === 'today') where.push(`date(t.due_at) = date('now')`);
  if (q.window === 'week') where.push(`t.due_at <= datetime('now', '+7 days')`);
  if (q.window === 'overdue') where.push(`t.due_at < datetime('now') AND t.status = 'open'`);

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(`${TASK_SELECT} ${clause} ORDER BY t.due_at ASC LIMIT 300`)
    .all(params) as Array<Record<string, unknown>>;
  res.json({ tasks: rows.map(serializeTask) });
});

const createSchema = z.object({
  leadId: z.number().int().positive().nullable().default(null),
  assignedTo: z.number().int().positive().nullable().optional(),
  kind: z.enum(['task', 'call', 'meeting']).default('task'),
  title: z.string().trim().min(2, 'Bitte einen Titel angeben.').max(200),
  description: z.string().trim().max(4000).default(''),
  dueAt: z.string().datetime({ message: 'Bitte einen gültigen Termin wählen.' }),
  durationMin: z.number().int().min(5).max(1440).default(30),
  recurrence: z.enum(RECURRENCES).default('none'),
  visibleToClient: z.boolean().default(false),
});

tasksRouter.post('/', (req, res) => {
  const input = createSchema.parse(req.body);
  const info = db
    .prepare(
      `INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at,
                          duration_min, recurrence, visible_to_client)
       VALUES (@leadId, @assignedTo, @createdBy, @kind, @title, @description, @dueAt,
               @durationMin, @recurrence, @visibleToClient)`,
    )
    .run({
      leadId: input.leadId,
      assignedTo: input.assignedTo ?? req.user!.id,
      createdBy: req.user!.id,
      kind: input.kind,
      title: input.title,
      description: input.description,
      dueAt: toSql(new Date(input.dueAt)),
      durationMin: input.durationMin,
      recurrence: input.recurrence,
      visibleToClient: input.visibleToClient ? 1 : 0,
    });

  const id = Number(info.lastInsertRowid);
  if (input.leadId) {
    logActivity({
      leadId: input.leadId,
      userId: req.user!.id,
      type: 'system',
      title: `${KIND_LABEL[input.kind]} geplant: ${input.title}`,
      body: input.recurrence === 'none' ? '' : `Wiederholung: ${RECURRENCE_LABEL[input.recurrence]}`,
      meta: { taskId: id, dueAt: input.dueAt },
    });
  }

  res.status(201).json({ task: serializeTask(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as Record<string, unknown>) });
});

const KIND_LABEL: Record<string, string> = { task: 'Aufgabe', call: 'Anruf', meeting: 'Termin' };
const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'einmalig',
  daily: 'täglich',
  weekly: 'wöchentlich',
  biweekly: 'alle zwei Wochen',
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
};

const patchSchema = z.object({
  status: z.enum(['open', 'done', 'cancelled']).optional(),
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  dueAt: z.string().datetime().optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
  visibleToClient: z.boolean().optional(),
});

tasksRouter.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const before = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
    | { id: number; lead_id: number | null; title: string; recurrence: Recurrence; due_at: string; kind: string; assigned_to: number | null; description: string; duration_min: number; visible_to_client: number; created_by: number | null }
    | undefined;
  if (!before) throw notFound('Aufgabe nicht gefunden.');

  const patch = patchSchema.parse(req.body);
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  if (patch.status) {
    sets.push('status = @status', 'completed_at = @completedAt');
    params.status = patch.status;
    params.completedAt = patch.status === 'done' ? nowSql() : null;
  }
  if (patch.title !== undefined) { sets.push('title = @title'); params.title = patch.title; }
  if (patch.description !== undefined) { sets.push('description = @description'); params.description = patch.description; }
  if (patch.dueAt !== undefined) { sets.push('due_at = @dueAt'); params.dueAt = toSql(new Date(patch.dueAt)); }
  if (patch.assignedTo !== undefined) { sets.push('assigned_to = @assignedTo'); params.assignedTo = patch.assignedTo; }
  if (patch.visibleToClient !== undefined) {
    sets.push('visible_to_client = @visibleToClient');
    params.visibleToClient = patch.visibleToClient ? 1 : 0;
  }
  if (sets.length) db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params);

  let followUp: Record<string, unknown> | null = null;

  // Wiederkehrende Termine erzeugen beim Abschliessen automatisch den naechsten.
  if (patch.status === 'done' && before.recurrence !== 'none') {
    const next = nextOccurrence(before.due_at, before.recurrence);
    const info = db
      .prepare(
        `INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at,
                            duration_min, recurrence, visible_to_client)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        before.lead_id, before.assigned_to, before.created_by, before.kind, before.title,
        before.description, toSql(next), before.duration_min, before.recurrence, before.visible_to_client,
      );
    followUp = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(Number(info.lastInsertRowid)) as Record<string, unknown>;
  }

  if (patch.status === 'done' && before.lead_id) {
    logActivity({
      leadId: before.lead_id,
      userId: req.user!.id,
      type: 'system',
      title: `Erledigt: ${before.title}`,
      body: followUp ? `Folgetermin automatisch angelegt (${RECURRENCE_LABEL[before.recurrence]}).` : '',
      meta: { taskId: id },
    });
  }

  res.json({
    task: serializeTask(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as Record<string, unknown>),
    followUp: followUp ? serializeTask(followUp) : null,
  });
});

tasksRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(intParam(req.params.id));
  res.json({ ok: true });
});

/** Naechster Termin einer Serie – Monatsenden werden korrekt gekappt. */
export function nextOccurrence(dueAtSql: string, recurrence: Recurrence): Date {
  const base = new Date(`${dueAtSql.replace(' ', 'T')}Z`);
  const d = new Date(base);
  switch (recurrence) {
    case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'biweekly': d.setUTCDate(d.getUTCDate() + 14); break;
    case 'monthly': addMonths(d, 1); break;
    case 'quarterly': addMonths(d, 3); break;
    default: break;
  }
  return d;
}

function addMonths(d: Date, months: number): void {
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
}
