import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { env } from '../env.js';
import { asyncHandler } from '../lib/http.js';
import { intakeLead } from '../lib/intake.js';
import { CONTACT_PREF, EXPERIENCE, HORIZONS, VOLUME_BANDS } from '../lib/leads.js';

export const publicRouter = Router();

/** Alles, was der Wizard zum Rendern braucht – ohne Anmeldung. */
publicRouter.get('/wizard-config', (_req, res) => {
  const assetClasses = db
    .prepare(
      `SELECT ac.id, ac.slug, ac.name, ac.tagline, ac.description, ac.icon,
              t.name AS teamName, t.color AS teamColor, t.sla_minutes AS slaMinutes
         FROM asset_classes ac
         LEFT JOIN teams t ON t.id = ac.team_id
        WHERE ac.is_active = 1
        ORDER BY ac.sort_order, ac.id`,
    )
    .all();

  res.json({
    company: env.company,
    assetClasses,
    volumeBands: Object.entries(VOLUME_BANDS).map(([value, b]) => ({ value, label: b.label })),
    horizons: Object.entries(HORIZONS).map(([value, label]) => ({ value, label })),
    experience: Object.entries(EXPERIENCE).map(([value, label]) => ({ value, label })),
    contactPrefs: Object.entries(CONTACT_PREF).map(([value, label]) => ({ value, label })),
    contactWindows: [
      { value: 'vormittags', label: 'Vormittags (8 – 12 Uhr)' },
      { value: 'nachmittags', label: 'Nachmittags (12 – 17 Uhr)' },
      { value: 'abends', label: 'Abends (17 – 20 Uhr)' },
      { value: 'flexibel', label: 'Jederzeit' },
    ],
    defaultSlaMinutes: env.slaMinutes,
  });
});

const submitSchema = z.object({
  firstName: z.string().trim().min(2, 'Bitte Vornamen angeben.').max(80),
  lastName: z.string().trim().min(2, 'Bitte Nachnamen angeben.').max(80),
  email: z.string().trim().email('Bitte eine gültige E-Mail-Adresse angeben.').max(200),
  phone: z.string().trim().max(60).default(''),
  company: z.string().trim().max(120).default(''),
  city: z.string().trim().max(120).default(''),
  postalCode: z.string().trim().max(20).default(''),
  country: z.string().trim().max(4).default('DE'),
  assetClassSlug: z.string().trim().min(1, 'Bitte ein Fachgebiet wählen.').max(60),
  volumeBand: z.string().trim().max(40).default(''),
  horizon: z.string().trim().max(40).default(''),
  experience: z.string().trim().max(40).default(''),
  goal: z.string().trim().max(400).default(''),
  contactPref: z.string().trim().max(20).default('phone'),
  contactWindow: z.string().trim().max(40).default(''),
  message: z.string().trim().max(4000).default(''),
  consentContact: z.literal(true, { message: 'Ohne Einwilligung dürfen wir dich nicht kontaktieren.' }),
  consentMarketing: z.boolean().default(false),
  website: z.string().max(200).optional(), // Honeypot
});

publicRouter.post(
  '/leads',
  asyncHandler(async (req, res) => {
    const input = submitSchema.parse(req.body);

    // Honeypot: Bots fuellen unsichtbare Felder aus. Wir antworten unauffaellig.
    if (input.website) {
      res.status(202).json({ ok: true });
      return;
    }

    const result = await intakeLead({ ...input, source: 'wizard' });

    res.status(201).json({
      ref: result.lead.ref,
      slaMinutes: result.slaMinutes,
      team: result.lead.team,
      assetClass: result.lead.assetClass,
      contact: result.contact,
      portal: {
        url: result.portal.url,
        token: result.portal.token,
        email: result.portal.email,
        password: result.portal.password,
      },
    });
  }),
);
