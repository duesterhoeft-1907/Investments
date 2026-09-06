import { db } from '../db/index.js';
import { env } from '../env.js';
import { LEAD_SELECT, serializeLead, teamMemberIds, type LeadRow } from './leads.js';
import { notify } from './notify.js';
import { emit } from './realtime.js';

/**
 * Wacht ueber die Reaktionszeit: warnt, wenn die Haelfte der Zeit verstrichen
 * ist, und meldet die Ueberschreitung genau einmal an die ganze Fachgruppe.
 * Der Zustand wird auf dem Lead gespeichert, damit ein Neustart nicht doppelt alarmiert.
 */
export function startSlaWatchdog(intervalMs = 30_000): NodeJS.Timeout {
  const tick = () => {
    try {
      checkWarnings();
      checkBreaches();
    } catch (err) {
      console.error('[sla] Watchdog-Fehler:', err);
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}

function openLeads(extraWhere: string): LeadRow[] {
  return db
    .prepare(
      `${LEAD_SELECT}
        WHERE l.first_contact_at IS NULL
          AND l.status NOT IN ('won','lost')
          AND l.sla_due_at IS NOT NULL
          AND ${extraWhere}`,
    )
    .all() as LeadRow[];
}

function checkWarnings(): void {
  const ratio = env.slaWarnRatio;
  for (const lead of openLeads(`l.sla_breached = 0`)) {
    const created = Date.parse(`${lead.created_at.replace(' ', 'T')}Z`);
    const due = Date.parse(`${lead.sla_due_at!.replace(' ', 'T')}Z`);
    const now = Date.now();
    if (now >= due || now < created + (due - created) * ratio) continue;

    const alreadyWarned = db
      .prepare(`SELECT 1 FROM notifications WHERE lead_id = ? AND type = 'sla_warning' LIMIT 1`)
      .get(lead.id);
    if (alreadyWarned) continue;

    const minutesLeft = Math.max(0, Math.round((due - now) / 60_000));
    for (const userId of recipients(lead)) {
      notify({
        userId,
        type: 'sla_warning',
        title: `Noch ${minutesLeft} Min. für ${lead.first_name} ${lead.last_name}`,
        body: `${lead.asset_class_name ?? 'Anfrage'} wartet weiterhin auf den Erstkontakt.`,
        link: `/app/leads/${lead.id}`,
        leadId: lead.id,
        urgency: 'high',
      });
    }
    emit.toTeam(lead.team_id ?? -1, 'lead:sla', { lead: serializeLead(lead), state: 'warning', minutesLeft });
  }
}

function checkBreaches(): void {
  const overdue = openLeads(`l.sla_breached = 0 AND l.sla_due_at < datetime('now')`);
  if (!overdue.length) return;

  const mark = db.prepare('UPDATE leads SET sla_breached = 1 WHERE id = ?');
  for (const lead of overdue) {
    mark.run(lead.id);
    for (const userId of recipients(lead)) {
      notify({
        userId,
        type: 'sla_breach',
        title: `Reaktionszeit überschritten: ${lead.first_name} ${lead.last_name}`,
        body: `${lead.asset_class_name ?? 'Anfrage'} · seit Eingang ohne Erstkontakt.`,
        link: `/app/leads/${lead.id}`,
        leadId: lead.id,
        urgency: 'critical',
      });
    }

    const channel = db
      .prepare(`SELECT id FROM channels WHERE type = 'team' AND team_id = ?`)
      .get(lead.team_id) as { id: number } | undefined;
    if (channel) {
      const info = db
        .prepare(
          `INSERT INTO messages (channel_id, user_id, body, kind, lead_id, meta)
           VALUES (?, NULL, ?, 'lead_alert', ?, ?)`,
        )
        .run(
          channel.id,
          `SLA überschritten: ${lead.first_name} ${lead.last_name} wartet noch immer auf den Erstkontakt.`,
          lead.id,
          JSON.stringify({ breach: true }),
        );
      const message = db
        .prepare(
          `SELECT m.*, u.name AS author_name, u.accent AS author_accent
             FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
        )
        .get(Number(info.lastInsertRowid));
      emit.toChannel(channel.id, 'chat:message', { message });
    }

    emit.toTeam(lead.team_id ?? -1, 'lead:sla', { lead: serializeLead(lead), state: 'breached', minutesLeft: 0 });
  }
  emit.toCompany('stats:dirty', { reason: 'sla:breach' });
}

/** Zustaendiger Berater zuerst, sonst die ganze Gruppe. */
function recipients(lead: LeadRow): number[] {
  const members = teamMemberIds(lead.team_id);
  if (lead.owner_id && !members.includes(lead.owner_id)) members.push(lead.owner_id);
  return members;
}
