import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import {
  formatDuration, LEAD_SELECT, LEAD_STATUS, serializeLead, STATUS_LABEL,
  type LeadRow, type LeadStatus,
} from '../lib/leads.js';
import { onlineUserIds } from '../lib/realtime.js';
import { toIso } from '../lib/time.js';

export const statsRouter = Router();
statsRouter.use(requireAuth);

/** Kennzahlen fuer das Dashboard – Schwerpunkt Reaktionsgeschwindigkeit. */
statsRouter.get('/dashboard', (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365);
  const since = `-${days} days`;

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN first_contact_at IS NULL THEN 1 ELSE 0 END) AS awaiting,
              SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) AS breached,
              SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won,
              SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lost,
              SUM(CASE WHEN status IN ('new','contacted','qualified','proposal') THEN volume_value ELSE 0 END) AS pipeline_value,
              SUM(CASE WHEN status = 'won' THEN volume_value ELSE 0 END) AS won_value,
              AVG(response_seconds) AS avg_response,
              COUNT(response_seconds) AS answered
         FROM leads WHERE created_at >= datetime('now', ?)`,
    )
    .get(since) as Record<string, number | null>;

  const median = medianResponseSeconds(since);
  const answered = Number(totals.answered ?? 0);
  const breached = Number(totals.breached ?? 0);

  // In Trichter-Reihenfolge ausgeben, damit das Dashboard die Pipeline
  // von "Neu" bis "Verloren" liest – auch fuer Stufen ohne Leads.
  const statusRows = db
    .prepare(
      `SELECT status, COUNT(*) AS count, SUM(volume_value) AS value
         FROM leads WHERE created_at >= datetime('now', ?) GROUP BY status`,
    )
    .all(since) as Array<{ status: LeadStatus; count: number; value: number }>;
  const byStatus = LEAD_STATUS.map((status) => {
    const row = statusRows.find((r) => r.status === status);
    return { status, count: row?.count ?? 0, value: row?.value ?? 0 };
  });

  const byTeam = db
    .prepare(
      `SELECT t.id, t.name, t.color, t.sla_minutes AS slaMinutes,
              COUNT(l.id) AS leads,
              AVG(l.response_seconds) AS avgResponse,
              SUM(CASE WHEN l.sla_breached = 1 THEN 1 ELSE 0 END) AS breached,
              SUM(CASE WHEN l.first_contact_at IS NULL THEN 1 ELSE 0 END) AS awaiting,
              SUM(CASE WHEN l.status = 'won' THEN 1 ELSE 0 END) AS won
         FROM teams t
         LEFT JOIN leads l ON l.team_id = t.id AND l.created_at >= datetime('now', ?)
        GROUP BY t.id ORDER BY t.id`,
    )
    .all(since) as Array<Record<string, number | string | null>>;

  const byAsset = db
    .prepare(
      `SELECT ac.name, ac.slug, COUNT(l.id) AS leads, SUM(l.volume_value) AS value
         FROM asset_classes ac
         LEFT JOIN leads l ON l.asset_class_id = ac.id AND l.created_at >= datetime('now', ?)
        GROUP BY ac.id ORDER BY leads DESC`,
    )
    .all(since) as Array<Record<string, number | string>>;

  const leaderboard = db
    .prepare(
      `SELECT u.id, u.name, u.accent, u.title,
              COUNT(l.id) AS leads,
              AVG(l.response_seconds) AS avgResponse,
              SUM(CASE WHEN l.status = 'won' THEN 1 ELSE 0 END) AS won,
              SUM(CASE WHEN l.sla_breached = 1 THEN 1 ELSE 0 END) AS breached
         FROM users u
         LEFT JOIN leads l ON l.owner_id = u.id AND l.created_at >= datetime('now', ?)
        WHERE u.is_active = 1
        GROUP BY u.id
        HAVING leads > 0
        ORDER BY (avgResponse IS NULL), avgResponse ASC`,
    )
    .all(since) as Array<Record<string, number | string | null>>;

  const timeline = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS leads,
              AVG(response_seconds) AS avgResponse,
              SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won
         FROM leads WHERE created_at >= datetime('now', ?)
        GROUP BY day ORDER BY day`,
    )
    .all(since) as Array<Record<string, number | string | null>>;

  const urgent = db
    .prepare(
      `${LEAD_SELECT} WHERE l.first_contact_at IS NULL AND l.status NOT IN ('won','lost')
        ORDER BY l.sla_due_at ASC LIMIT 12`,
    )
    .all() as LeadRow[];

  const avgResponse = totals.avg_response ? Math.round(Number(totals.avg_response)) : null;

  res.json({
    range: { days },
    totals: {
      leads: Number(totals.total ?? 0),
      awaiting: Number(totals.awaiting ?? 0),
      breached,
      won: Number(totals.won ?? 0),
      lost: Number(totals.lost ?? 0),
      pipelineValue: Number(totals.pipeline_value ?? 0),
      wonValue: Number(totals.won_value ?? 0),
      answered,
      avgResponseSeconds: avgResponse,
      avgResponseLabel: avgResponse === null ? null : formatDuration(avgResponse),
      medianResponseSeconds: median,
      medianResponseLabel: median === null ? null : formatDuration(median),
      slaComplianceRate: answered === 0 ? null : Math.round(((answered - breached) / answered) * 100),
      conversionRate:
        Number(totals.total ?? 0) === 0
          ? 0
          : Math.round((Number(totals.won ?? 0) / Number(totals.total)) * 100),
    },
    byStatus: byStatus.map((s) => ({ ...s, label: STATUS_LABEL[s.status] ?? s.status })),
    byTeam: byTeam.map((t) => ({
      ...t,
      avgResponse: t.avgResponse === null ? null : Math.round(Number(t.avgResponse)),
      avgResponseLabel: t.avgResponse === null ? null : formatDuration(Math.round(Number(t.avgResponse))),
    })),
    byAsset,
    leaderboard: leaderboard.map((l) => ({
      ...l,
      avgResponse: l.avgResponse === null ? null : Math.round(Number(l.avgResponse)),
      avgResponseLabel: l.avgResponse === null ? null : formatDuration(Math.round(Number(l.avgResponse))),
    })),
    timeline,
    urgent: urgent.map(serializeLead),
    onlineUserIds: onlineUserIds(),
  });
});

/** Meine offenen Punkte – der Einstieg in den Arbeitstag. */
statsRouter.get('/my-day', (req, res) => {
  const me = req.user!.id;

  const myLeads = db
    .prepare(
      `${LEAD_SELECT} WHERE l.owner_id = ? AND l.status NOT IN ('won','lost')
        ORDER BY (l.first_contact_at IS NULL) DESC, l.sla_due_at ASC LIMIT 25`,
    )
    .all(me) as LeadRow[];

  const tasks = db
    .prepare(
      `SELECT t.*, l.first_name || ' ' || l.last_name AS lead_name,
              u.name AS assignee_name, u.accent AS assignee_accent
         FROM tasks t
         LEFT JOIN leads l ON l.id = t.lead_id
         LEFT JOIN users u ON u.id = t.assigned_to
        WHERE t.assigned_to = ? AND t.status = 'open'
        ORDER BY t.due_at ASC LIMIT 25`,
    )
    .all(me) as Array<Record<string, unknown>>;

  const stats = db
    .prepare(
      `SELECT COUNT(*) AS open,
              SUM(CASE WHEN first_contact_at IS NULL THEN 1 ELSE 0 END) AS awaiting,
              AVG(response_seconds) AS avgResponse
         FROM leads WHERE owner_id = ? AND created_at >= datetime('now','-30 days')`,
    )
    .get(me) as Record<string, number | null>;

  res.json({
    leads: myLeads.map(serializeLead),
    tasks: tasks.map((t) => ({
      id: t.id,
      leadId: t.lead_id,
      leadName: t.lead_name,
      kind: t.kind,
      title: t.title,
      description: t.description,
      dueAt: toIso(t.due_at as string),
      recurrence: t.recurrence,
      status: t.status,
    })),
    stats: {
      open: Number(stats.open ?? 0),
      awaiting: Number(stats.awaiting ?? 0),
      avgResponseSeconds: stats.avgResponse ? Math.round(Number(stats.avgResponse)) : null,
      avgResponseLabel: stats.avgResponse ? formatDuration(Math.round(Number(stats.avgResponse))) : null,
    },
  });
});

function medianResponseSeconds(since: string): number | null {
  const rows = db
    .prepare(
      `SELECT response_seconds AS s FROM leads
        WHERE response_seconds IS NOT NULL AND created_at >= datetime('now', ?)
        ORDER BY response_seconds`,
    )
    .all(since) as Array<{ s: number }>;
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid].s : Math.round((rows[mid - 1].s + rows[mid].s) / 2);
}
