import { customAlphabet } from 'nanoid';
import { db } from '../db/index.js';
import { env } from '../env.js';
import { addMinutes, nowSql, secondsBetween, toIso, toSql } from './time.js';

const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const refId = customAlphabet(REF_ALPHABET, 6);
const pwdId = customAlphabet('23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', 10);
const tokenId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24);

export const newRef = () => `LD-${refId()}`;
export const newPortalPassword = () => pwdId();
export const newPortalToken = () => tokenId();

/** Investitionsbaender des Wizards inkl. Mittelwert fuer Pipeline-Summen. */
export const VOLUME_BANDS: Record<string, { label: string; value: number; score: number }> = {
  'under-25k': { label: 'bis 25.000 €', value: 15_000, score: 5 },
  '25k-50k': { label: '25.000 – 50.000 €', value: 37_500, score: 12 },
  '50k-100k': { label: '50.000 – 100.000 €', value: 75_000, score: 20 },
  '100k-250k': { label: '100.000 – 250.000 €', value: 175_000, score: 30 },
  '250k-500k': { label: '250.000 – 500.000 €', value: 375_000, score: 38 },
  'over-500k': { label: 'über 500.000 €', value: 750_000, score: 45 },
};

export const HORIZONS: Record<string, string> = {
  short: 'kurzfristig (bis 2 Jahre)',
  medium: 'mittelfristig (2 – 5 Jahre)',
  long: 'langfristig (5 – 10 Jahre)',
  generational: 'Generationen (10+ Jahre)',
};

export const EXPERIENCE: Record<string, string> = {
  none: 'keine Vorerfahrung',
  some: 'erste Erfahrungen',
  experienced: 'erfahren',
  professional: 'professionell / institutionell',
};

export const CONTACT_PREF: Record<string, string> = {
  phone: 'Telefon',
  email: 'E-Mail',
  whatsapp: 'WhatsApp',
};

export const LEAD_STATUS = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Neu',
  contacted: 'Kontaktiert',
  qualified: 'Qualifiziert',
  proposal: 'Angebot',
  won: 'Gewonnen',
  lost: 'Verloren',
};

export interface LeadRow {
  id: number;
  public_ref: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  postal_code: string;
  country: string;
  asset_class_id: number | null;
  team_id: number | null;
  owner_id: number | null;
  status: LeadStatus;
  stage_changed_at: string;
  source: string;
  score: number;
  volume_band: string;
  volume_value: number;
  horizon: string;
  experience: string;
  goal: string;
  contact_pref: string;
  contact_window: string;
  message: string;
  wizard_payload: string;
  consent_contact: number;
  consent_marketing: number;
  sla_due_at: string | null;
  first_contact_at: string | null;
  first_contact_by: number | null;
  response_seconds: number | null;
  sla_breached: number;
  portal_token: string | null;
  portal_last_login: string | null;
  lost_reason: string;
  created_at: string;
  updated_at: string;
  asset_class_name?: string | null;
  asset_class_slug?: string | null;
  team_name?: string | null;
  team_color?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  owner_accent?: string | null;
}

export const LEAD_SELECT = `
  SELECT l.*,
         ac.name  AS asset_class_name,
         ac.slug  AS asset_class_slug,
         t.name   AS team_name,
         t.color  AS team_color,
         u.name   AS owner_name,
         u.email  AS owner_email,
         u.accent AS owner_accent
    FROM leads l
    LEFT JOIN asset_classes ac ON ac.id = l.asset_class_id
    LEFT JOIN teams t          ON t.id  = l.team_id
    LEFT JOIN users u          ON u.id  = l.owner_id`;

export function serializeLead(row: LeadRow) {
  const slaDue = toIso(row.sla_due_at);
  const firstContact = toIso(row.first_contact_at);
  return {
    id: row.id,
    ref: row.public_ref,
    firstName: row.first_name,
    lastName: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    phone: row.phone,
    company: row.company,
    city: row.city,
    postalCode: row.postal_code,
    country: row.country,
    assetClassId: row.asset_class_id,
    assetClass: row.asset_class_name ?? null,
    assetClassSlug: row.asset_class_slug ?? null,
    teamId: row.team_id,
    team: row.team_name ?? null,
    teamColor: row.team_color ?? null,
    ownerId: row.owner_id,
    owner: row.owner_name ? { id: row.owner_id, name: row.owner_name, email: row.owner_email, accent: row.owner_accent } : null,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status] ?? row.status,
    stageChangedAt: toIso(row.stage_changed_at),
    source: row.source,
    score: row.score,
    volumeBand: row.volume_band,
    volumeLabel: VOLUME_BANDS[row.volume_band]?.label ?? row.volume_band,
    volumeValue: row.volume_value,
    horizon: row.horizon,
    horizonLabel: HORIZONS[row.horizon] ?? row.horizon,
    experience: row.experience,
    experienceLabel: EXPERIENCE[row.experience] ?? row.experience,
    goal: row.goal,
    contactPref: row.contact_pref,
    contactPrefLabel: CONTACT_PREF[row.contact_pref] ?? row.contact_pref,
    contactWindow: row.contact_window,
    message: row.message,
    wizard: safeJson(row.wizard_payload),
    consentMarketing: Boolean(row.consent_marketing),
    slaDueAt: slaDue,
    firstContactAt: firstContact,
    firstContactBy: row.first_contact_by,
    responseSeconds: row.response_seconds,
    slaBreached: Boolean(row.sla_breached),
    hasPortal: Boolean(row.portal_token),
    portalToken: row.portal_token,
    portalLastLogin: toIso(row.portal_last_login),
    lostReason: row.lost_reason,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export type SerializedLead = ReturnType<typeof serializeLead>;

export function safeJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getLead(id: number): LeadRow | undefined {
  return db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(id) as LeadRow | undefined;
}

/** Fachgebiet → Fachgruppe. Ohne Zuordnung faellt der Lead auf das Standardteam. */
export function resolveTeamForAssetClass(assetClassId: number | null): number | null {
  if (assetClassId) {
    const row = db.prepare('SELECT team_id FROM asset_classes WHERE id = ?').get(assetClassId) as
      | { team_id: number | null }
      | undefined;
    if (row?.team_id) return row.team_id;
  }
  const fallback = db
    .prepare('SELECT id FROM teams ORDER BY id LIMIT 1')
    .get() as { id: number } | undefined;
  return fallback?.id ?? null;
}

export function teamMemberIds(teamId: number | null): number[] {
  if (!teamId) return [];
  return (
    db
      .prepare(
        `SELECT tm.user_id AS id FROM team_members tm
          JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ? AND u.is_active = 1
         ORDER BY tm.user_id`,
      )
      .all(teamId) as Array<{ id: number }>
  ).map((r) => r.id);
}

/**
 * Round-Robin innerhalb der Gruppe: der Berater mit den wenigsten offenen Leads
 * bekommt den naechsten. Bei Gleichstand entscheidet, wer am laengsten nichts
 * bekommen hat – so bleibt die Verteilung fair und nachvollziehbar.
 *
 * Beratende Rollen gehen immer vor: Leitung und Geschaeftsfuehrung sind zwar in
 * jeder Gruppe, sollen aber nur einspringen, wenn kein Berater verfuegbar ist.
 */
export function pickOwner(teamId: number | null): number | null {
  if (!teamId) return null;
  const row = db
    .prepare(
      `SELECT u.id,
              CASE u.role WHEN 'agent' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END AS role_rank,
              (SELECT COUNT(*) FROM leads l
                WHERE l.owner_id = u.id AND l.status IN ('new','contacted','qualified','proposal')) AS open_leads,
              COALESCE((SELECT MAX(l2.created_at) FROM leads l2 WHERE l2.owner_id = u.id), '1970-01-01') AS last_assigned
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ? AND u.is_active = 1
        ORDER BY role_rank ASC, open_leads ASC, last_assigned ASC, u.id ASC
        LIMIT 1`,
    )
    .get(teamId) as { id: number } | undefined;
  return row?.id ?? null;
}

export function slaMinutesForTeam(teamId: number | null): number {
  if (!teamId) return env.slaMinutes;
  const row = db.prepare('SELECT sla_minutes FROM teams WHERE id = ?').get(teamId) as
    | { sla_minutes: number }
    | undefined;
  return row?.sla_minutes || env.slaMinutes;
}

/** Einfaches, erklaerbares Scoring von 0–100. */
export function scoreLead(input: {
  volumeBand: string;
  horizon: string;
  experience: string;
  phone: string;
  message: string;
}): number {
  let score = 20;
  score += VOLUME_BANDS[input.volumeBand]?.score ?? 0;
  if (input.horizon === 'long' || input.horizon === 'generational') score += 10;
  if (input.experience === 'experienced') score += 8;
  if (input.experience === 'professional') score += 12;
  if (input.phone.trim()) score += 8;
  if (input.message.trim().length > 40) score += 5;
  return Math.max(0, Math.min(100, score));
}

export function logActivity(input: {
  leadId: number;
  userId?: number | null;
  type: string;
  title: string;
  body?: string;
  outcome?: string;
  direction?: string;
  durationS?: number;
  meta?: Record<string, unknown>;
  occurredAt?: string;
}): number {
  const info = db
    .prepare(
      `INSERT INTO activities (lead_id, user_id, type, title, body, outcome, direction, duration_s, meta, occurred_at)
       VALUES (@leadId, @userId, @type, @title, @body, @outcome, @direction, @durationS, @meta, @occurredAt)`,
    )
    .run({
      leadId: input.leadId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      outcome: input.outcome ?? '',
      direction: input.direction ?? '',
      durationS: input.durationS ?? 0,
      meta: JSON.stringify(input.meta ?? {}),
      occurredAt: input.occurredAt ?? nowSql(),
    });
  return Number(info.lastInsertRowid);
}

/**
 * Stoppt die Reaktionsuhr. Idempotent – nur die allererste Kontaktaufnahme zaehlt.
 * Gibt die gemessene Reaktionszeit in Sekunden zurueck, sonst null.
 */
export function markFirstContact(leadId: number, userId: number | null): number | null {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId) as LeadRow | undefined;
  if (!lead || lead.first_contact_at) return null;

  const now = nowSql();
  const seconds = secondsBetween(lead.created_at, now);
  const breached = lead.sla_due_at ? now > lead.sla_due_at : false;

  db.prepare(
    `UPDATE leads
        SET first_contact_at = ?, first_contact_by = ?, response_seconds = ?, sla_breached = ?,
            status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
            stage_changed_at = CASE WHEN status = 'new' THEN ? ELSE stage_changed_at END,
            updated_at = ?
      WHERE id = ?`,
  ).run(now, userId, seconds, breached ? 1 : 0, now, now, leadId);

  logActivity({
    leadId,
    userId,
    type: 'first_contact',
    title: 'Erstkontakt hergestellt',
    body: `Reaktionszeit: ${formatDuration(seconds)}${breached ? ' – SLA überschritten' : ' – innerhalb der SLA'}`,
    meta: { seconds, breached },
  });

  return seconds;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} Sek.`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} Min. ${seconds % 60} Sek.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Std. ${minutes % 60} Min.`;
  return `${Math.floor(hours / 24)} Tg. ${hours % 24} Std.`;
}

export function slaDeadline(from: Date, teamId: number | null): string {
  return toSql(addMinutes(from, slaMinutesForTeam(teamId)));
}
