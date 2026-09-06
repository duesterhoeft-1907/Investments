import { db } from '../db/index.js';
import { env } from '../env.js';
import { hashPassword } from './auth.js';
import {
  leadWelcomeMail,
  sendMail,
  teamAlertMail,
  type LeadMailFacts,
} from './mailer.js';
import {
  getLead,
  logActivity,
  newPortalPassword,
  newPortalToken,
  newRef,
  pickOwner,
  resolveTeamForAssetClass,
  scoreLead,
  serializeLead,
  slaDeadline,
  slaMinutesForTeam,
  teamMemberIds,
  VOLUME_BANDS,
  type SerializedLead,
} from './leads.js';
import { notify } from './notify.js';
import { emit } from './realtime.js';
import { nowSql } from './time.js';

export interface IntakeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  postalCode: string;
  country: string;
  assetClassSlug: string;
  volumeBand: string;
  horizon: string;
  experience: string;
  goal: string;
  contactPref: string;
  contactWindow: string;
  message: string;
  consentMarketing: boolean;
  source?: string;
  extra?: Record<string, unknown>;
}

export interface IntakeResult {
  lead: SerializedLead;
  portal: { url: string; email: string; password: string; token: string };
  slaMinutes: number;
  contact: { name: string; title: string; phone: string; email: string } | null;
}

/**
 * Nimmt eine Wizard-Anfrage entgegen und erledigt in einem Zug alles, was
 * "sofort reagieren" moeglich macht:
 *   1. Lead anlegen und ueber das Fachgebiet in die richtige Gruppe routen
 *   2. Reaktionsuhr starten (SLA-Deadline setzen)
 *   3. Fair einen Berater zuweisen
 *   4. Gruppe per Socket, Glocke und Mail alarmieren
 *   5. Lead-Alarm in den Gruppen-Chat posten
 *   6. Kundenportal anlegen und die Eingangsbestaetigung verschicken
 */
export async function intakeLead(input: IntakeInput): Promise<IntakeResult> {
  const assetClass = db
    .prepare('SELECT id, name, slug FROM asset_classes WHERE slug = ? AND is_active = 1')
    .get(input.assetClassSlug) as { id: number; name: string; slug: string } | undefined;

  const assetClassId = assetClass?.id ?? null;
  const teamId = resolveTeamForAssetClass(assetClassId);
  const slaMinutes = slaMinutesForTeam(teamId);
  const ownerId = pickOwner(teamId);

  const createdAt = new Date();
  const ref = newRef();
  const portalToken = newPortalToken();
  const portalPassword = newPortalPassword();
  const portalHash = await hashPassword(portalPassword);
  const band = VOLUME_BANDS[input.volumeBand];

  const info = db
    .prepare(
      `INSERT INTO leads (public_ref, first_name, last_name, email, phone, company, city, postal_code, country,
                          asset_class_id, team_id, owner_id, status, stage_changed_at, source, score,
                          volume_band, volume_value, horizon, experience, goal, contact_pref, contact_window,
                          message, wizard_payload, consent_contact, consent_marketing,
                          sla_due_at, portal_token, portal_password_hash, created_at, updated_at)
       VALUES (@ref, @firstName, @lastName, @email, @phone, @company, @city, @postalCode, @country,
               @assetClassId, @teamId, @ownerId, 'new', @createdAt, @source, @score,
               @volumeBand, @volumeValue, @horizon, @experience, @goal, @contactPref, @contactWindow,
               @message, @payload, 1, @consentMarketing,
               @slaDue, @portalToken, @portalHash, @createdAt, @createdAt)`,
    )
    .run({
      ref,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      company: input.company,
      city: input.city,
      postalCode: input.postalCode,
      country: input.country || 'DE',
      assetClassId,
      teamId,
      ownerId,
      createdAt: nowSql(),
      source: input.source ?? 'wizard',
      score: scoreLead({
        volumeBand: input.volumeBand,
        horizon: input.horizon,
        experience: input.experience,
        phone: input.phone,
        message: input.message,
      }),
      volumeBand: input.volumeBand,
      volumeValue: band?.value ?? 0,
      horizon: input.horizon,
      experience: input.experience,
      goal: input.goal,
      contactPref: input.contactPref,
      contactWindow: input.contactWindow,
      message: input.message,
      payload: JSON.stringify({ ...(input.extra ?? {}), goal: input.goal, contactWindow: input.contactWindow }),
      consentMarketing: input.consentMarketing ? 1 : 0,
      slaDue: slaDeadline(createdAt, teamId),
      portalToken,
      portalHash,
    });

  const leadId = Number(info.lastInsertRowid);
  const assetName = assetClass?.name ?? 'Allgemeine Anfrage';

  logActivity({
    leadId,
    type: 'lead_created',
    title: 'Anfrage über den Wizard eingegangen',
    body: `Fachgebiet ${assetName}${band ? ` · Volumen ${band.label}` : ''}`,
    meta: { source: input.source ?? 'wizard', assetClass: assetClass?.slug ?? null },
  });

  const owner = ownerId
    ? (db.prepare('SELECT id, name, title, phone, email FROM users WHERE id = ?').get(ownerId) as
        | { id: number; name: string; title: string; phone: string; email: string }
        | undefined)
    : undefined;

  if (owner) {
    logActivity({
      leadId,
      title: `Automatisch zugewiesen an ${owner.name}`,
      type: 'assignment',
      body: `Routing über Fachgebiet ${assetName} → Gruppe`,
      meta: { ownerId: owner.id, automatic: true },
    });
  }

  // Offene Aufgabe mit der SLA-Deadline als Faelligkeit – so taucht der neue
  // Lead auch in "Aufgaben" und in "Mein Tag" auf, nicht nur in der Liste.
  db.prepare(
    `INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at, duration_min, recurrence)
     VALUES (?, ?, NULL, 'call', 'Erstkontakt herstellen', ?, ?, 15, 'none')`,
  ).run(
    leadId,
    ownerId,
    `${input.firstName} ${input.lastName} wartet auf den Rückruf – die Reaktionszeit läuft.`,
    slaDeadline(createdAt, teamId),
  );

  const leadRow = getLead(leadId)!;
  const lead = serializeLead(leadRow);
  const leadUrl = `${env.appUrl}/app/leads/${leadId}`;
  const portalUrl = `${env.appUrl}/portal/${portalToken}`;

  // ── 4. Fachgruppe alarmieren ──
  const memberIds = teamMemberIds(teamId);
  const facts: LeadMailFacts = {
    ref,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    assetClass: assetName,
    volumeBand: band?.label ?? input.volumeBand,
    horizon: lead.horizonLabel,
    contactPref: lead.contactPrefLabel,
    contactWindow: input.contactWindow,
    message: input.message,
    slaMinutes,
  };

  for (const memberId of memberIds) {
    const isOwner = memberId === ownerId;
    notify({
      userId: memberId,
      type: isOwner ? 'assignment' : 'new_lead',
      title: isOwner
        ? `Dir zugewiesen: ${lead.name}`
        : `Neuer Lead in ${lead.team ?? 'deiner Gruppe'}`,
      body: `${assetName} · ${band?.label ?? ''} · Reaktion innerhalb von ${slaMinutes} Min.`,
      link: `/app/leads/${leadId}`,
      leadId,
      urgency: isOwner ? 'critical' : 'high',
    });
  }

  emit.toTeam(teamId ?? -1, 'lead:new', { lead, slaMinutes, ownerId });
  emit.toCompany('stats:dirty', { reason: 'lead:new' });

  // ── 5. Lead-Alarm in den Gruppen-Chat ──
  const channel = db
    .prepare(`SELECT id FROM channels WHERE type = 'team' AND team_id = ?`)
    .get(teamId) as { id: number } | undefined;

  if (channel) {
    const body = `Neuer Lead: ${lead.name} · ${assetName} · ${band?.label ?? '–'}${
      owner ? ` → ${owner.name}` : ''
    }`;
    const msgInfo = db
      .prepare(
        `INSERT INTO messages (channel_id, user_id, body, kind, lead_id, meta)
         VALUES (?, NULL, ?, 'lead_alert', ?, ?)`,
      )
      .run(channel.id, body, leadId, JSON.stringify({ ref, slaMinutes, ownerId }));
    const message = db
      .prepare(
        `SELECT m.*, u.name AS author_name, u.accent AS author_accent
           FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
      )
      .get(Number(msgInfo.lastInsertRowid));
    emit.toChannel(channel.id, 'chat:message', { message });
  }

  // ── 6. Mails raus ──
  const mailJobs: Promise<void>[] = [];
  const members = memberIds.length
    ? (db
        .prepare(
          `SELECT id, name, email FROM users WHERE id IN (${memberIds.map(() => '?').join(',')})`,
        )
        .all(...memberIds) as Array<{ id: number; name: string; email: string }>)
    : [];

  for (const member of members) {
    const tpl = teamAlertMail(facts, member.name, leadUrl);
    mailJobs.push(sendMail({ ...tpl, to: member.email, leadId }));
  }

  const contact = owner
    ? { name: owner.name, title: owner.title, phone: owner.phone, email: owner.email }
    : null;
  const welcome = leadWelcomeMail(facts, portalUrl, portalPassword, contact);
  mailJobs.push(sendMail({ ...welcome, to: input.email, leadId }));

  await Promise.allSettled(mailJobs);

  logActivity({
    leadId,
    type: 'email',
    direction: 'outbound',
    title: 'Eingangsbestätigung an den Interessenten versendet',
    body: `Portal-Zugang für ${input.email} erstellt.`,
    meta: { template: 'lead_welcome' },
  });

  return {
    lead: serializeLead(getLead(leadId)!),
    portal: { url: portalUrl, email: input.email, password: portalPassword, token: portalToken },
    slaMinutes,
    contact,
  };
}
