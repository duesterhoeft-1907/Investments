import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/index.js';
import { env } from '../env.js';
import { formatDuration, serializeLead, type LeadRow } from './leads.js';

export interface OfferDraft {
  title: string;
  summary: string;
  body: string;
  amount: number;
  nextSteps: string[];
  generatedBy: 'ai' | 'template';
  model?: string;
  note?: string;
}

export const aiEnabled = () => Boolean(env.anthropicApiKey);

/**
 * Baut aus Lead, Bedarf und dem gesamten Aktivitaetsverlauf einen Angebots-
 * entwurf. Ohne ANTHROPIC_API_KEY greift ein deterministischer Textbaustein –
 * die Funktion ist damit immer aufrufbar und nie ein harter Abhaengigkeitspunkt.
 */
export async function draftOffer(leadRow: LeadRow, instruction: string): Promise<OfferDraft> {
  const lead = serializeLead(leadRow);

  const activities = db
    .prepare(
      `SELECT a.type, a.title, a.body, a.outcome, a.duration_s, a.occurred_at, u.name AS user_name
         FROM activities a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.lead_id = ? ORDER BY a.occurred_at ASC LIMIT 60`,
    )
    .all(leadRow.id) as Array<Record<string, unknown>>;

  const history = activities
    .map((a) => {
      const when = String(a.occurred_at).slice(0, 16);
      const who = a.user_name ? ` (${a.user_name})` : '';
      const detail = [a.body, a.outcome ? `Ergebnis: ${a.outcome}` : '']
        .filter(Boolean)
        .join(' – ');
      const duration = Number(a.duration_s) > 0 ? ` [${formatDuration(Number(a.duration_s))}]` : '';
      return `- ${when} · ${a.type}${who}: ${a.title}${duration}${detail ? ` — ${detail}` : ''}`;
    })
    .join('\n');

  const dossier = [
    `Referenz: ${lead.ref}`,
    `Name: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
    `Ort: ${lead.postalCode} ${lead.city}`,
    `Fachgebiet: ${lead.assetClass ?? 'unbekannt'}`,
    `Zuständige Gruppe: ${lead.team ?? 'unbekannt'}`,
    `Berater: ${lead.owner?.name ?? 'noch nicht zugewiesen'}`,
    `Anlagevolumen: ${lead.volumeLabel || 'unbekannt'} (kalkulatorisch ${lead.volumeValue} EUR)`,
    `Anlagehorizont: ${lead.horizonLabel || 'unbekannt'}`,
    `Erfahrung: ${lead.experienceLabel || 'unbekannt'}`,
    `Ziel: ${lead.goal || '–'}`,
    `Status: ${lead.statusLabel}`,
    `Nachricht des Interessenten: ${lead.message || '–'}`,
    '',
    'Bisheriger Verlauf:',
    history || '- (noch keine Einträge)',
  ].join('\n');

  if (!aiEnabled()) {
    return templateOffer(lead, instruction, 'Kein ANTHROPIC_API_KEY gesetzt – Textbaustein verwendet.');
  }

  const system = [
    `Du bist erfahrener Anlageberater bei ${env.company.name} und schreibst den Entwurf`,
    'eines individuellen Angebots für einen Interessenten.',
    '',
    'Regeln:',
    '- Schreibe auf Deutsch, in der Sie-Form, sachlich und ohne Superlative.',
    '- Nutze ausschließlich Fakten aus dem Dossier. Erfinde keine Preise, Renditen,',
    '  Produktnamen oder Zusagen. Wo eine Zahl fehlt, formuliere einen Platzhalter',
    '  in eckigen Klammern, z. B. [Tagespreis einsetzen].',
    '- Keine Renditeversprechen und keine steuerliche oder rechtliche Beratung.',
    '- Der Entwurf geht an den Berater zur Prüfung, nicht direkt an den Kunden.',
    '',
    'Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown-Codefence:',
    '{"title": string, "summary": string, "body": string, "amount": number, "nextSteps": string[]}',
    '- title: kurzer Angebotstitel',
    '- summary: 1–2 Sätze Zusammenfassung',
    '- body: Angebotstext in Markdown, 250–450 Wörter',
    '- amount: empfohlenes Anlagevolumen in EUR als Zahl',
    '- nextSteps: 3–5 konkrete nächste Schritte',
  ].join('\n');

  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  try {
    const stream = client.messages.stream({
      model: env.anthropicModel,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system,
      messages: [
        {
          role: 'user',
          content: `Dossier:\n${dossier}\n\nZusätzliche Anweisung des Beraters:\n${
            instruction || '(keine)'
          }`,
        },
      ],
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      return templateOffer(lead, instruction, 'Das Modell hat die Anfrage abgelehnt – Textbaustein verwendet.');
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const parsed = parseDraft(text);
    if (!parsed) {
      return templateOffer(lead, instruction, 'Antwort des Modells war nicht auswertbar – Textbaustein verwendet.');
    }

    return { ...parsed, generatedBy: 'ai', model: env.anthropicModel };
  } catch (err) {
    const note =
      err instanceof Anthropic.APIError
        ? `Anthropic-API-Fehler (${err.status}) – Textbaustein verwendet.`
        : 'Angebotsentwurf über die KI nicht möglich – Textbaustein verwendet.';
    console.error('[ai] draftOffer fehlgeschlagen:', err);
    return templateOffer(lead, instruction, note);
  }
}

/** Toleranter JSON-Parser – akzeptiert auch ein in Fließtext eingebettetes Objekt. */
function parseDraft(text: string): Omit<OfferDraft, 'generatedBy'> | null {
  const candidates = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const braces = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (braces.length > 2) candidates.push(braces);

  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate.trim()) as Record<string, unknown>;
      if (typeof obj.title !== 'string' || typeof obj.body !== 'string') continue;
      return {
        title: obj.title,
        summary: typeof obj.summary === 'string' ? obj.summary : '',
        body: obj.body,
        amount: Number.isFinite(Number(obj.amount)) ? Math.round(Number(obj.amount)) : 0,
        nextSteps: Array.isArray(obj.nextSteps) ? obj.nextSteps.map(String).slice(0, 8) : [],
      };
    } catch {
      /* naechsten Kandidaten probieren */
    }
  }
  return null;
}

function templateOffer(
  lead: ReturnType<typeof serializeLead>,
  instruction: string,
  note: string,
): OfferDraft {
  const asset = lead.assetClass ?? 'Ihre gewünschte Anlageklasse';
  const body = `## Ihr persönliches Angebot

Sehr geehrte/r ${lead.name},

vielen Dank für Ihr Interesse an **${asset}**. Auf Basis unseres Gesprächs fassen wir
Ihre Ausgangslage wie folgt zusammen:

- **Anlageziel:** ${lead.goal || '[Ziel im Gespräch ergänzen]'}
- **Volumen:** ${lead.volumeLabel || '[Volumen ergänzen]'}
- **Anlagehorizont:** ${lead.horizonLabel || '[Horizont ergänzen]'}
- **Erfahrung:** ${lead.experienceLabel || '[Erfahrung ergänzen]'}

### Unser Vorschlag

Wir empfehlen einen gestaffelten Einstieg in ${asset}. Die konkrete Stückelung und die
Verwahrform stimmen wir im nächsten Gespräch auf Ihre Liquiditätsplanung ab.
Der tagesaktuelle Preis wird bei Zeichnung verbindlich festgelegt: [Tagespreis einsetzen].

### Konditionen

| Position | Wert |
| --- | --- |
| Anlagevolumen | ${lead.volumeLabel || '[einsetzen]'} |
| Aufgeld / Gebühren | [einsetzen] |
| Verwahrung | [Verwahrform einsetzen] |
| Gültigkeit | 14 Tage ab Versand |

${instruction ? `> Hinweis des Beraters: ${instruction}\n` : ''}
Ihr Ansprechpartner ${lead.owner?.name ?? '[Berater einsetzen]'} begleitet Sie durch den
gesamten Prozess.

*Dieses Dokument ist ein unverbindlicher Entwurf und stellt keine Anlageberatung dar.*`;

  return {
    title: `Angebot ${asset} – ${lead.name}`,
    summary: `Entwurf für ein Investment in ${asset} über ${lead.volumeLabel || '[Volumen]'}.`,
    body,
    amount: lead.volumeValue,
    nextSteps: [
      'Angebot prüfen und Platzhalter mit Tagespreisen füllen',
      'Rückfragen des Interessenten telefonisch klären',
      'Angebot im Kundenportal freigeben',
      'Zeichnungsunterlagen vorbereiten',
    ],
    generatedBy: 'template',
    note,
  };
}
