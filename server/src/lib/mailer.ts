import nodemailer, { type Transporter } from 'nodemailer';
import { db } from '../db/index.js';
import { env } from '../env.js';

let transporter: Transporter | null = null;
let transportMode: 'smtp' | 'log' = 'log';

export function initMailer(): void {
  if (env.smtp.host) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
    transportMode = 'smtp';
    console.log(`[mail] SMTP aktiv: ${env.smtp.host}:${env.smtp.port}`);
  } else {
    transportMode = 'log';
    console.log('[mail] Kein SMTP_HOST gesetzt – Mails werden nur protokolliert (Postausgang im CRM).');
  }
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  leadId?: number | null;
}

/**
 * Versendet eine Mail und protokolliert sie immer im email_log, damit der
 * Postausgang auch ohne SMTP-Zugang im CRM nachvollziehbar bleibt.
 */
export async function sendMail(input: MailInput): Promise<void> {
  const preview = input.text.slice(0, 4000);
  let status: 'sent' | 'failed' | 'logged' = 'logged';
  let error = '';

  if (transporter) {
    try {
      await transporter.sendMail({
        from: env.smtp.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      status = 'sent';
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
      console.error(`[mail] Versand an ${input.to} fehlgeschlagen:`, error);
    }
  } else {
    console.log(`[mail:log] → ${input.to} | ${input.subject}`);
  }

  db.prepare(
    `INSERT INTO email_log (lead_id, to_address, subject, template, preview, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.leadId ?? null, input.to, input.subject, input.template, preview, status, error);
}

export const mailMode = () => transportMode;

// ───────────────────────────── Templates ─────────────────────────────

const BRAND = { gold: '#C8A24A', ink: '#0B0F14', paper: '#F6F3EC' };

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="de"><body style="margin:0;background:${BRAND.ink};padding:32px 16px;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${BRAND.paper};border-radius:16px;overflow:hidden;">
      <tr><td style="background:${BRAND.ink};padding:24px 32px;border-bottom:2px solid ${BRAND.gold};">
        <span style="color:${BRAND.gold};font-size:20px;letter-spacing:3px;font-weight:700;">${env.company.name.toUpperCase()}</span>
      </td></tr>
      <tr><td style="padding:32px;color:#1a1a1a;font-size:15px;line-height:1.65;">
        <h1 style="margin:0 0 20px;font-size:22px;color:${BRAND.ink};">${title}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:20px 32px;background:#EDE7DA;color:#6b6b6b;font-size:12px;line-height:1.6;">
        ${env.company.name} · ${env.company.phone} · ${env.company.email}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:28px 0;"><a href="${href}" style="background:${BRAND.gold};color:${BRAND.ink};text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;display:inline-block;">${label}</a></p>`;

export interface LeadMailFacts {
  ref: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  assetClass: string;
  volumeBand: string;
  horizon: string;
  contactPref: string;
  contactWindow: string;
  message: string;
  slaMinutes: number;
}

/** Alarm an jedes Mitglied der zustaendigen Fachgruppe. */
export function teamAlertMail(lead: LeadMailFacts, agentName: string, leadUrl: string): Omit<MailInput, 'to' | 'leadId'> {
  const rows: Array<[string, string]> = [
    ['Referenz', lead.ref],
    ['Name', `${lead.firstName} ${lead.lastName}`],
    ['E-Mail', lead.email],
    ['Telefon', lead.phone || '–'],
    ['Fachgebiet', lead.assetClass],
    ['Volumen', lead.volumeBand || '–'],
    ['Horizont', lead.horizon || '–'],
    ['Kontaktwunsch', `${lead.contactPref}${lead.contactWindow ? ` (${lead.contactWindow})` : ''}`],
  ];
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;white-space:nowrap;">${k}</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(v)}</td></tr>`,
    )
    .join('');

  const html = layout(
    `Neuer Lead: ${escapeHtml(lead.firstName)} ${escapeHtml(lead.lastName)}`,
    `<p>Hallo ${escapeHtml(agentName)},</p>
     <p>soeben ist eine neue Anfrage im Fachgebiet <strong>${escapeHtml(lead.assetClass)}</strong> eingegangen.
     Bitte nimm innerhalb von <strong>${lead.slaMinutes} Minuten</strong> Kontakt auf – die Reaktionszeit wird gemessen.</p>
     <table style="font-size:14px;margin:20px 0;">${table}</table>
     ${lead.message ? `<p style="background:#fff;border-left:3px solid ${BRAND.gold};padding:12px 16px;margin:16px 0;"><em>${escapeHtml(lead.message)}</em></p>` : ''}
     ${button(leadUrl, 'Lead jetzt öffnen')}`,
  );

  const text = [
    `Neuer Lead: ${lead.firstName} ${lead.lastName} (${lead.ref})`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    lead.message ? `Nachricht: ${lead.message}` : '',
    `Reaktionsziel: ${lead.slaMinutes} Minuten`,
    leadUrl,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: `🔔 Neuer Lead · ${lead.assetClass} · ${lead.firstName} ${lead.lastName}`, html, text, template: 'team_alert' };
}

/** Eingangsbestaetigung an den Interessenten inkl. Portal-Zugang. */
export function leadWelcomeMail(
  lead: LeadMailFacts,
  portalUrl: string,
  password: string,
  contact: { name: string; title: string; phone: string; email: string } | null,
): Omit<MailInput, 'to' | 'leadId'> {
  const contactHtml = contact
    ? `<p style="background:#fff;border-radius:12px;padding:16px 20px;margin:20px 0;">
         <strong style="display:block;font-size:16px;">${escapeHtml(contact.name)}</strong>
         <span style="color:#6b6b6b;">${escapeHtml(contact.title)}</span><br/>
         ${escapeHtml(contact.phone)} · ${escapeHtml(contact.email)}
       </p>`
    : '';

  const html = layout(
    `Ihre Anfrage ist angekommen, ${escapeHtml(lead.firstName)}`,
    `<p>vielen Dank für Ihr Interesse an <strong>${escapeHtml(lead.assetClass)}</strong>.
     Ihre Anfrage liegt bereits bei unserem Fachteam – wir melden uns
     <strong>innerhalb von ${lead.slaMinutes} Minuten</strong> persönlich bei Ihnen.</p>
     ${contactHtml}
     <p>In Ihrem persönlichen Kundenbereich sehen Sie jederzeit den Stand Ihrer Anfrage,
     die nächsten Schritte und – sobald erstellt – Ihr individuelles Angebot.</p>
     <table style="font-size:14px;background:#fff;border-radius:12px;padding:16px;margin:8px 0;">
       <tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;">Zugang</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(lead.email)}</td></tr>
       <tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;">Passwort</td><td style="padding:6px 0;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:1px;">${escapeHtml(password)}</td></tr>
       <tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;">Referenz</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(lead.ref)}</td></tr>
     </table>
     ${button(portalUrl, 'Zum persönlichen Bereich')}
     <p style="font-size:13px;color:#6b6b6b;">Bitte ändern Sie das Passwort nach dem ersten Login.</p>`,
  );

  const text = `Vielen Dank für Ihre Anfrage (${lead.ref}).
Wir melden uns innerhalb von ${lead.slaMinutes} Minuten.
${contact ? `Ihr Ansprechpartner: ${contact.name}, ${contact.title}, ${contact.phone}` : ''}
Kundenbereich: ${portalUrl}
Zugang: ${lead.email}
Passwort: ${password}`;

  return { subject: `Ihre Anfrage ${lead.ref} ist angekommen – wir melden uns umgehend`, html, text, template: 'lead_welcome' };
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
