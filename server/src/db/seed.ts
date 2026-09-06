/**
 * Baut einen vollstaendigen Demo-Datenstand: Fachgruppen, Berater, Fachgebiete,
 * Chat-Kanaele und eine Woche realistischer Lead-Historie.
 *
 *   npm run seed          – nur anlegen, wenn die Datenbank leer ist
 *   npm run seed -- --reset – bestehende Daten loeschen und neu aufbauen
 */
import { db, migrate, settings } from './index.js';
import { env } from '../env.js';
import { hashPassword } from '../lib/auth.js';
import {
  logActivity,
  newPortalPassword,
  newPortalToken,
  newRef,
  scoreLead,
  VOLUME_BANDS,
} from '../lib/leads.js';
import { addMinutes, toSql } from '../lib/time.js';

const RESET = process.argv.includes('--reset');
export const DEMO_PASSWORD = 'Invest2026!';

const TEAMS = [
  {
    slug: 'edelmetalle',
    name: 'Edelmetalle',
    description: 'Gold, Silber, Platin und Palladium – physisch, verwahrt oder besichert.',
    color: '#C8A24A',
    sla: 10,
  },
  {
    slug: 'sachwerte',
    name: 'Sachwerte & Immobilien',
    description: 'Immobilien, Diamanten, Sammler- und Kunstwerte.',
    color: '#7FA8B8',
    sla: 20,
  },
  {
    slug: 'kapitalmarkt',
    name: 'Kapitalmarkt & Beteiligungen',
    description: 'Private Equity, Fonds, Anleihen und digitale Assets.',
    color: '#A88BC4',
    sla: 15,
  },
];

const ASSET_CLASSES = [
  { slug: 'gold', name: 'Gold', team: 'edelmetalle', icon: 'coins', tagline: 'Der Klassiker der Wertsicherung', description: 'Barren und Münzen, physisch geliefert oder im Zollfreilager verwahrt.' },
  { slug: 'silber', name: 'Silber', team: 'edelmetalle', icon: 'layers', tagline: 'Industriemetall mit Hebel', description: 'Silber als Beimischung mit hoher Volatilität und industrieller Nachfrage.' },
  { slug: 'platin-palladium', name: 'Platin & Palladium', team: 'edelmetalle', icon: 'gem', tagline: 'Knappe Industriemetalle', description: 'Enge Märkte, hohe Preisdynamik, strategische Beimischung.' },
  { slug: 'immobilien', name: 'Immobilien', team: 'sachwerte', icon: 'building-2', tagline: 'Substanz mit laufendem Ertrag', description: 'Wohn- und Gewerbeobjekte, direkt oder über Beteiligungen.' },
  { slug: 'diamanten', name: 'Diamanten & Farbedelsteine', team: 'sachwerte', icon: 'diamond', tagline: 'Wert auf kleinstem Raum', description: 'Zertifizierte Investmentsteine mit internationaler Handelbarkeit.' },
  { slug: 'sammlerwerte', name: 'Sammler- & Kunstwerte', team: 'sachwerte', icon: 'palette', tagline: 'Leidenschaft mit Rendite', description: 'Kunst, Oldtimer und Sammlermünzen als Portfoliobeimischung.' },
  { slug: 'private-equity', name: 'Private Equity', team: 'kapitalmarkt', icon: 'trending-up', tagline: 'Unternehmerisch investieren', description: 'Direktbeteiligungen und Fonds abseits der Börse.' },
  { slug: 'fonds-anleihen', name: 'Fonds & Anleihen', team: 'kapitalmarkt', icon: 'chart-candlestick', tagline: 'Breit gestreut und planbar', description: 'Kuratierte Fonds- und Anleiheportfolios nach Risikoprofil.' },
  { slug: 'digital-assets', name: 'Digitale Assets', team: 'kapitalmarkt', icon: 'bitcoin', tagline: 'Reguliert in die neue Anlageklasse', description: 'Verwahrte Krypto-Investments über regulierte Partner.' },
];

const USERS = [
  { email: 'admin@21capitalinvest.de', name: 'Marlene Voss', title: 'Geschäftsführung', role: 'admin', phone: '+49 40 555 0100', accent: '#C8A24A', teams: ['edelmetalle', 'sachwerte', 'kapitalmarkt'] },
  { email: 'leitung@21capitalinvest.de', name: 'Robert Kienzle', title: 'Vertriebsleitung', role: 'manager', phone: '+49 40 555 0101', accent: '#E0B86A', teams: ['edelmetalle', 'sachwerte', 'kapitalmarkt'] },
  { email: 'j.ahrens@21capitalinvest.de', name: 'Jonas Ahrens', title: 'Senior Berater Edelmetalle', role: 'agent', phone: '+49 40 555 0110', accent: '#D8A657', teams: ['edelmetalle'] },
  { email: 's.baumann@21capitalinvest.de', name: 'Sina Baumann', title: 'Beraterin Edelmetalle', role: 'agent', phone: '+49 40 555 0111', accent: '#C99A3F', teams: ['edelmetalle'] },
  { email: 'p.hoffmann@21capitalinvest.de', name: 'Pit Hoffmann', title: 'Berater Sachwerte', role: 'agent', phone: '+49 40 555 0120', accent: '#7FA8B8', teams: ['sachwerte'] },
  { email: 'n.weber@21capitalinvest.de', name: 'Nadja Weber', title: 'Beraterin Immobilien', role: 'agent', phone: '+49 40 555 0121', accent: '#6E97A8', teams: ['sachwerte'] },
  { email: 'l.dorn@21capitalinvest.de', name: 'Lukas Dorn', title: 'Berater Kapitalmarkt', role: 'agent', phone: '+49 40 555 0130', accent: '#A88BC4', teams: ['kapitalmarkt'] },
  { email: 'e.faber@21capitalinvest.de', name: 'Elif Faber', title: 'Beraterin Beteiligungen', role: 'agent', phone: '+49 40 555 0131', accent: '#9478B4', teams: ['kapitalmarkt'] },
];

interface DemoLead {
  first: string; last: string; email: string; phone: string; city: string; plz: string;
  asset: string; band: keyof typeof VOLUME_BANDS; horizon: string; experience: string;
  goal: string; pref: string; window: string; message: string;
  minutesAgo: number; respondAfter: number | null; status: string; company?: string;
}

const LEADS: DemoLead[] = [
  { first: 'Katharina', last: 'Reimann', email: 'k.reimann@example.de', phone: '+49 171 2340011', city: 'Hamburg', plz: '20095', asset: 'gold', band: '100k-250k', horizon: 'long', experience: 'some', goal: 'Inflationsschutz für das Familienvermögen', pref: 'phone', window: 'vormittags', message: 'Wir möchten rund 150.000 € aus einer Fälligkeit in physisches Gold umschichten. Bitte um Rückruf.', minutesAgo: 18, respondAfter: 7, status: 'qualified' },
  { first: 'Bernd', last: 'Osterkamp', email: 'b.osterkamp@example.de', phone: '+49 160 8877221', city: 'München', plz: '80333', asset: 'immobilien', band: 'over-500k', horizon: 'generational', experience: 'experienced', goal: 'Aufbau eines Bestandsportfolios', pref: 'phone', window: 'nachmittags', company: 'Osterkamp Holding GmbH', message: 'Suche Objekte mit 4 % Rendite im süddeutschen Raum.', minutesAgo: 1450, respondAfter: 12, status: 'proposal' },
  { first: 'Yasmin', last: 'Talha', email: 'y.talha@example.de', phone: '+49 152 3311447', city: 'Berlin', plz: '10115', asset: 'digital-assets', band: '25k-50k', horizon: 'medium', experience: 'some', goal: 'Beimischung digitaler Assets', pref: 'email', window: 'abends', message: 'Wie funktioniert die Verwahrung über regulierte Partner?', minutesAgo: 320, respondAfter: 44, status: 'contacted' },
  { first: 'Hans-Georg', last: 'Lemke', email: 'hg.lemke@example.de', phone: '+49 175 9982210', city: 'Bremen', plz: '28195', asset: 'silber', band: '50k-100k', horizon: 'medium', experience: 'none', goal: 'Erste Absicherung gegen Geldentwertung', pref: 'phone', window: 'vormittags', message: '', minutesAgo: 6, respondAfter: null, status: 'new' },
  { first: 'Annika', last: 'Sørensen', email: 'a.sorensen@example.dk', phone: '+45 22 114 880', city: 'Flensburg', plz: '24937', asset: 'diamanten', band: '250k-500k', horizon: 'long', experience: 'experienced', goal: 'Wertspeicher mit hoher Mobilität', pref: 'whatsapp', window: 'flexibel', message: 'Interesse an zertifizierten Investmentsteinen ab 1 Karat.', minutesAgo: 2900, respondAfter: 9, status: 'won' },
  { first: 'Marco', last: 'Dellbrück', email: 'm.dellbrueck@example.de', phone: '+49 178 4455112', city: 'Köln', plz: '50667', asset: 'private-equity', band: '100k-250k', horizon: 'long', experience: 'professional', goal: 'Unternehmerische Beteiligung im Mittelstand', pref: 'phone', window: 'nachmittags', company: 'Dellbrück Beteiligungen', message: 'Bitte um Übersicht der aktuellen Zeichnungsmöglichkeiten.', minutesAgo: 4300, respondAfter: 6, status: 'proposal' },
  { first: 'Petra', last: 'Winkelmann', email: 'p.winkelmann@example.de', phone: '', city: 'Leipzig', plz: '04109', asset: 'gold', band: 'under-25k', horizon: 'short', experience: 'none', goal: 'Kleiner Einstieg zum Ausprobieren', pref: 'email', window: 'flexibel', message: 'Was kostet ein 100g-Barren inklusive Verwahrung?', minutesAgo: 5900, respondAfter: 210, status: 'lost' },
  { first: 'Tobias', last: 'Ehrlich', email: 't.ehrlich@example.de', phone: '+49 151 7766338', city: 'Stuttgart', plz: '70173', asset: 'fonds-anleihen', band: '50k-100k', horizon: 'medium', experience: 'some', goal: 'Planbarer Ertrag neben dem Depot', pref: 'phone', window: 'abends', message: 'Wie sieht ein defensives Portfolio bei Ihnen aus?', minutesAgo: 2, respondAfter: null, status: 'new' },
  { first: 'Ingrid', last: 'Falkenberg', email: 'i.falkenberg@example.de', phone: '+49 172 5544001', city: 'Düsseldorf', plz: '40213', asset: 'platin-palladium', band: '25k-50k', horizon: 'medium', experience: 'some', goal: 'Diversifikation über Industriemetalle', pref: 'phone', window: 'vormittags', message: '', minutesAgo: 780, respondAfter: 11, status: 'contacted' },
  { first: 'Sven', last: 'Marquardt', email: 's.marquardt@example.de', phone: '+49 176 3322114', city: 'Hannover', plz: '30159', asset: 'sammlerwerte', band: '100k-250k', horizon: 'long', experience: 'experienced', goal: 'Kunst als Sachwertbeimischung', pref: 'email', window: 'flexibel', message: 'Ich sammle Nachkriegsmoderne und suche Beratung zur Bewertung.', minutesAgo: 8600, respondAfter: 33, status: 'qualified' },
  { first: 'Rebecca', last: 'Thoma', email: 'r.thoma@example.de', phone: '+49 170 8811223', city: 'Frankfurt', plz: '60311', asset: 'gold', band: '250k-500k', horizon: 'generational', experience: 'professional', goal: 'Substanzsicherung im Familienbüro', pref: 'phone', window: 'vormittags', company: 'Thoma Family Office', message: 'Wir prüfen Zollfreilager in der Schweiz. Bitte um Termin.', minutesAgo: 11500, respondAfter: 4, status: 'won' },
  { first: 'Dennis', last: 'Kuypers', email: 'd.kuypers@example.de', phone: '+49 159 4477002', city: 'Essen', plz: '45127', asset: 'immobilien', band: '100k-250k', horizon: 'long', experience: 'none', goal: 'Erste Anlageimmobilie', pref: 'whatsapp', window: 'abends', message: 'Ist das mit Fremdkapital sinnvoll?', minutesAgo: 45, respondAfter: 26, status: 'contacted' },
  { first: 'Miriam', last: 'Gonzalez', email: 'm.gonzalez@example.de', phone: '+49 173 9900112', city: 'Nürnberg', plz: '90402', asset: 'digital-assets', band: 'under-25k', horizon: 'short', experience: 'some', goal: 'Kleine Position aufbauen', pref: 'email', window: 'flexibel', message: '', minutesAgo: 14000, respondAfter: 88, status: 'lost' },
  { first: 'Friedrich', last: 'Auerbach', email: 'f.auerbach@example.de', phone: '+49 174 1122556', city: 'Dresden', plz: '01067', asset: 'silber', band: '25k-50k', horizon: 'medium', experience: 'some', goal: 'Antizyklisch aufstocken', pref: 'phone', window: 'nachmittags', message: 'Wie ist das Gold-Silber-Verhältnis aktuell zu bewerten?', minutesAgo: 9, respondAfter: null, status: 'new' },
];

const CALL_NOTES = [
  ['Erstgespräch geführt', 'reached', 'Sehr aufgeschlossen. Kennt die Anlageklasse aus dem Bekanntenkreis, will Verwahrung verstehen.'],
  ['Telefonat – nicht erreicht', 'no_answer', 'Mailbox besprochen, Rückruf für morgen früh angeboten.'],
  ['Rückruf vereinbart', 'callback', 'Bittet um Rückruf nach Feierabend, ab 18:30 Uhr erreichbar.'],
  ['Bedarfsanalyse abgeschlossen', 'positive', 'Anlagehorizont und Risikoprofil geklärt, Unterlagen zugesagt.'],
] as const;

async function run(): Promise<void> {
  migrate();

  if (RESET) {
    db.exec(`DELETE FROM messages; DELETE FROM channel_members; DELETE FROM channels;
             DELETE FROM notifications; DELETE FROM email_log; DELETE FROM attachments;
             DELETE FROM offers; DELETE FROM tasks; DELETE FROM activities; DELETE FROM leads;
             DELETE FROM asset_classes; DELETE FROM team_members; DELETE FROM teams;
             DELETE FROM users; DELETE FROM settings;
             DELETE FROM sqlite_sequence;`);
    console.log('[seed] Bestehende Daten entfernt.');
  }

  const existing = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  if (existing.c > 0) {
    console.log('[seed] Datenbank enthält bereits Daten – übersprungen. (npm run seed -- --reset erzwingt Neuaufbau)');
    return;
  }

  settings.set('company_name', env.company.name);
  settings.set('sla_minutes', String(env.slaMinutes));

  // ── Fachgruppen ──
  const teamIds = new Map<string, number>();
  const insertTeam = db.prepare(
    'INSERT INTO teams (slug, name, description, color, sla_minutes) VALUES (?, ?, ?, ?, ?)',
  );
  for (const t of TEAMS) {
    teamIds.set(t.slug, Number(insertTeam.run(t.slug, t.name, t.description, t.color, t.sla).lastInsertRowid));
  }

  // ── Fachgebiete ──
  const assetIds = new Map<string, number>();
  const insertAsset = db.prepare(
    `INSERT INTO asset_classes (slug, name, tagline, description, icon, team_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  ASSET_CLASSES.forEach((a, i) => {
    assetIds.set(
      a.slug,
      Number(insertAsset.run(a.slug, a.name, a.tagline, a.description, a.icon, teamIds.get(a.team)!, i).lastInsertRowid),
    );
  });

  // ── Berater ──
  const hash = await hashPassword(DEMO_PASSWORD);
  const userIds = new Map<string, number>();
  const insertUser = db.prepare(
    `INSERT INTO users (email, password_hash, name, title, phone, role, accent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMember = db.prepare('INSERT INTO team_members (team_id, user_id, team_role) VALUES (?, ?, ?)');
  for (const u of USERS) {
    const id = Number(insertUser.run(u.email, hash, u.name, u.title, u.phone, u.role, u.accent).lastInsertRowid);
    userIds.set(u.email, id);
    for (const slug of u.teams) {
      insertMember.run(teamIds.get(slug)!, id, u.role === 'agent' ? 'member' : 'lead');
    }
  }

  // ── Chat-Kanaele ──
  const insertChannel = db.prepare(
    'INSERT INTO channels (slug, name, type, team_id, topic, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertChannelMember = db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)',
  );
  const adminId = userIds.get(USERS[0].email)!;

  const companyChannel = Number(
    insertChannel.run('allgemein', 'Allgemein', 'company', null, 'Firmenweiter Austausch', adminId).lastInsertRowid,
  );
  for (const id of userIds.values()) insertChannelMember.run(companyChannel, id);

  const teamChannels = new Map<string, number>();
  for (const t of TEAMS) {
    const cid = Number(
      insertChannel.run(t.slug, t.name, 'team', teamIds.get(t.slug)!, `Leads & Absprachen – ${t.name}`, adminId).lastInsertRowid,
    );
    teamChannels.set(t.slug, cid);
    const members = db
      .prepare('SELECT user_id FROM team_members WHERE team_id = ?')
      .all(teamIds.get(t.slug)!) as Array<{ user_id: number }>;
    for (const m of members) insertChannelMember.run(cid, m.user_id);
  }

  const insertMessage = db.prepare(
    'INSERT INTO messages (channel_id, user_id, body, kind, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const ago = (minutes: number) => toSql(addMinutes(new Date(), -minutes));
  insertMessage.run(companyChannel, adminId, 'Willkommen im internen Chat. Neue Leads landen automatisch im jeweiligen Fachgruppen-Kanal – bitte innerhalb der SLA reagieren.', 'text', ago(4320));
  insertMessage.run(companyChannel, userIds.get(USERS[1].email)!, 'Kurze Erinnerung: Reaktionszeit unter 10 Minuten ist unser Versprechen an den Interessenten. Wer nicht kann, gibt den Lead im Kanal frei.', 'text', ago(2880));
  insertMessage.run(teamChannels.get('edelmetalle')!, userIds.get('j.ahrens@21capitalinvest.de')!, 'Zollfreilager Zürich hat neue Konditionen bestätigt – ab 100k entfällt die Einlagerungsgebühr im ersten Jahr.', 'text', ago(600));
  insertMessage.run(teamChannels.get('sachwerte')!, userIds.get('n.weber@21capitalinvest.de')!, 'Zwei Objekte in München sind wieder verfügbar. Wer einen passenden Interessenten hat, bitte melden.', 'text', ago(300));

  // ── Leads inkl. Historie ──
  const insertLead = db.prepare(
    `INSERT INTO leads (public_ref, first_name, last_name, email, phone, company, city, postal_code, country,
                        asset_class_id, team_id, owner_id, status, stage_changed_at, source, score,
                        volume_band, volume_value, horizon, experience, goal, contact_pref, contact_window,
                        message, wizard_payload, consent_contact, consent_marketing,
                        sla_due_at, first_contact_at, first_contact_by, response_seconds, sla_breached,
                        portal_token, portal_password_hash, created_at, updated_at)
     VALUES (@ref, @first, @last, @email, @phone, @company, @city, @plz, 'DE',
             @assetId, @teamId, @ownerId, @status, @created, 'wizard', @score,
             @band, @value, @horizon, @experience, @goal, @pref, @window,
             @message, @payload, 1, @marketing,
             @slaDue, @firstContact, @firstBy, @responseSeconds, @breached,
             @token, @pwd, @created, @created)`,
  );

  // argon2 ist asynchron, better-sqlite3 synchron: Portal-Passwoerter vorab hashen.
  const portalHashes = await Promise.all(LEADS.map(() => hashPassword(newPortalPassword())));

  const rotation = new Map<string, number>();
  const pickAgent = (teamSlug: string): number => {
    const agents = USERS.filter((u) => u.role === 'agent' && u.teams.includes(teamSlug));
    const idx = (rotation.get(teamSlug) ?? 0) % agents.length;
    rotation.set(teamSlug, idx + 1);
    return userIds.get(agents[idx].email)!;
  };

  const insertTask = db.prepare(
    `INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at, duration_min, recurrence, status, visible_to_client)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  LEADS.forEach((l, index) => {
    const assetId = assetIds.get(l.asset)!;
    const teamSlug = ASSET_CLASSES.find((a) => a.slug === l.asset)!.team;
    const teamId = teamIds.get(teamSlug)!;
    const slaMin = TEAMS.find((t) => t.slug === teamSlug)!.sla;
    const ownerId = pickAgent(teamSlug);
    const createdAt = addMinutes(new Date(), -l.minutesAgo);
    const firstContact = l.respondAfter === null ? null : addMinutes(createdAt, l.respondAfter);
    const band = VOLUME_BANDS[l.band];

    const leadId = Number(
      insertLead.run({
        ref: newRef(),
        first: l.first,
        last: l.last,
        email: l.email,
        phone: l.phone,
        company: l.company ?? '',
        city: l.city,
        plz: l.plz,
        assetId,
        teamId,
        ownerId,
        status: l.status,
        created: toSql(createdAt),
        score: scoreLead({ volumeBand: l.band, horizon: l.horizon, experience: l.experience, phone: l.phone, message: l.message }),
        band: l.band,
        value: band.value,
        horizon: l.horizon,
        experience: l.experience,
        goal: l.goal,
        pref: l.pref,
        window: l.window,
        message: l.message,
        payload: JSON.stringify({ goal: l.goal, contactWindow: l.window }),
        marketing: index % 3 === 0 ? 1 : 0,
        slaDue: toSql(addMinutes(createdAt, slaMin)),
        firstContact: firstContact ? toSql(firstContact) : null,
        firstBy: firstContact ? ownerId : null,
        responseSeconds: l.respondAfter === null ? null : l.respondAfter * 60,
        breached: l.respondAfter !== null && l.respondAfter > slaMin ? 1 : 0,
        token: newPortalToken(),
        pwd: portalHashes[index],
      }).lastInsertRowid,
    );

    logActivity({
      leadId, userId: null, type: 'lead_created',
      title: 'Anfrage über den Wizard eingegangen',
      body: `Fachgebiet ${ASSET_CLASSES.find((a) => a.slug === l.asset)!.name} · Volumen ${band.label}`,
      meta: { source: 'wizard' }, occurredAt: toSql(createdAt),
    });
    logActivity({
      leadId, userId: null, type: 'assignment',
      title: `Automatisch zugewiesen an ${USERS.find((u) => userIds.get(u.email) === ownerId)!.name}`,
      body: `Routing über Fachgebiet → Gruppe ${TEAMS.find((t) => t.slug === teamSlug)!.name}`,
      occurredAt: toSql(addMinutes(createdAt, 0.05)),
    });

    if (firstContact) {
      const breached = l.respondAfter! > slaMin;
      logActivity({
        leadId, userId: ownerId, type: 'first_contact',
        title: 'Erstkontakt hergestellt',
        body: `Reaktionszeit: ${l.respondAfter} Min.${breached ? ' – SLA überschritten' : ' – innerhalb der SLA'}`,
        meta: { seconds: l.respondAfter! * 60, breached },
        occurredAt: toSql(firstContact),
      });

      const note = CALL_NOTES[index % CALL_NOTES.length];
      logActivity({
        leadId, userId: ownerId, type: 'call',
        title: note[0], outcome: note[1], direction: 'outbound',
        durationS: 180 + ((index * 137) % 900), body: note[2],
        occurredAt: toSql(addMinutes(firstContact, 2)),
      });

      if (['qualified', 'proposal', 'won'].includes(l.status)) {
        logActivity({
          leadId, userId: ownerId, type: 'email', direction: 'outbound',
          title: 'Unterlagen versendet',
          body: 'Produktübersicht, Verwahrkonzept und Preisliste als PDF verschickt.',
          occurredAt: toSql(addMinutes(firstContact, 90)),
        });
        insertTask.run(leadId, ownerId, ownerId, 'meeting', 'Beratungstermin', 'Persönliches Gespräch zur Feinabstimmung des Portfolios.', toSql(addMinutes(new Date(), 60 * 24 * ((index % 5) + 1))), 60, index % 4 === 0 ? 'monthly' : 'none', 'open', 1);
      }
      if (['proposal', 'won'].includes(l.status)) {
        logActivity({
          leadId, userId: ownerId, type: 'meeting',
          title: 'Beratungstermin durchgeführt', outcome: 'positive', durationS: 3600,
          body: 'Portfolio-Struktur besprochen, Angebot angekündigt.',
          occurredAt: toSql(addMinutes(firstContact, 60 * 26)),
        });
      }
      if (l.status === 'won') {
        logActivity({
          leadId, userId: ownerId, type: 'status_change',
          title: 'Status: Gewonnen', body: 'Zeichnung erfolgt, Abwicklung an das Backoffice übergeben.',
          occurredAt: toSql(addMinutes(firstContact, 60 * 50)),
        });
      }
      if (l.status === 'lost') {
        logActivity({
          leadId, userId: ownerId, type: 'status_change',
          title: 'Status: Verloren', body: 'Interessent hat sich für einen Wettbewerber entschieden.',
          occurredAt: toSql(addMinutes(firstContact, 60 * 72)),
        });
        db.prepare('UPDATE leads SET lost_reason = ? WHERE id = ?').run('Wettbewerb war schneller', leadId);
      }
    } else {
      insertTask.run(leadId, ownerId, ownerId, 'call', 'Erstkontakt herstellen', 'Sofort anrufen – die Reaktionszeit läuft.', toSql(addMinutes(createdAt, slaMin)), 15, 'none', 'open', 0);
      const channelId = teamChannels.get(teamSlug)!;
      db.prepare(
        'INSERT INTO messages (channel_id, user_id, body, kind, lead_id, meta, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)',
      ).run(channelId, `Neuer Lead: ${l.first} ${l.last} · ${ASSET_CLASSES.find((a) => a.slug === l.asset)!.name} · ${band.label}`, 'lead_alert', leadId, JSON.stringify({ ref: 'seed' }), toSql(createdAt));
    }
  });

  const counts = db.prepare('SELECT (SELECT COUNT(*) FROM leads) AS leads, (SELECT COUNT(*) FROM activities) AS acts').get();
  console.log('[seed] Fertig.', counts);
  console.log(`[seed] Login: ${USERS[0].email} / ${DEMO_PASSWORD}`);
}

run().catch((err) => {
  console.error('[seed] Fehlgeschlagen:', err);
  process.exit(1);
});
