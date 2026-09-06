# Capital Lead Suite

Lead-Wizard, automatisches Fachgruppen-Routing, Echtzeit-Benachrichtigung,
interner Chat, CRM mit Reaktionszeit-Messung und Kundenportal – für eine
Investment-Beratung von Edelmetallen bis Beteiligungen.

Der Kern ist ein Versprechen: **Ein Interessent stellt eine Anfrage und hört
innerhalb von Minuten von einem echten Menschen.** Alles in diesem Projekt
dient dazu, das messbar einzuhalten.

---

## Der Ablauf in einem Zug

1. **Wizard** – Der Interessent beantwortet vier kurze Fragen (Fachgebiet,
   Volumen, Profil, Kontakt) auf einer öffentlichen, animierten Strecke.
2. **Routing** – Das gewählte Fachgebiet bestimmt die zuständige Fachgruppe
   (Gold → Edelmetalle, Immobilien → Sachwerte, …). Die Zuordnung ist im CRM
   unter *Team & Routing* jederzeit änderbar.
3. **Reaktionsuhr startet** – Der Lead bekommt eine Deadline aus der SLA der
   Gruppe (z. B. 10 Minuten bei Edelmetallen).
4. **Zuweisung** – Ein Berater der Gruppe wird per Round-Robin bestimmt:
   beratende Rollen zuerst, dann der mit den wenigsten offenen Leads.
5. **Alarm** – Jedes Gruppenmitglied bekommt gleichzeitig
   - eine **E-Mail** mit allen Eckdaten,
   - eine **Push-Benachrichtigung** im CRM (Toast + Signalton + Glocke),
   - eine **Lead-Meldung im Gruppen-Chat** mit Direktsprung in den Vorgang.
6. **Bestätigung an den Interessenten** – E-Mail mit Ansprechpartner,
   Reaktionsversprechen und Zugangsdaten für seinen persönlichen Bereich.
7. **Erstkontakt** – Der Berater erfasst den Anruf; die Uhr stoppt, die
   Reaktionszeit wird dauerhaft gespeichert und fließt in alle Kennzahlen.
8. **Betreuung** – Aktivitätsstream, Notizen, Sprachnotizen, wiederkehrende
   Termine, Angebotsentwurf, Freigabe im Kundenportal.

Läuft die Uhr ab, meldet ein Watchdog das der ganzen Gruppe – erst als
Vorwarnung bei halber Zeit, dann als Überschreitung im Chat und in der Glocke.

---

## Schnellstart

```bash
npm install
cp .env.example .env       # optional – ohne .env laufen sinnvolle Defaults
npm run seed               # Demo-Daten: 3 Gruppen, 8 Berater, 14 Leads
npm run dev                # API auf :4000, Frontend auf :5173
```

Aufrufen:

| Adresse | Was |
| --- | --- |
| <http://localhost:5173/> | Öffentlicher Lead-Wizard |
| <http://localhost:5173/app> | Internes CRM (Login nötig) |
| <http://localhost:5173/portal> | Kundenbereich (Zugang aus der Bestätigungsmail) |

**Demo-Zugänge** (Passwort für alle: `Invest2026!`)

| E-Mail | Rolle |
| --- | --- |
| `admin@21capitalinvest.de` | Geschäftsführung – sieht alles, darf Routing ändern |
| `leitung@21capitalinvest.de` | Vertriebsleitung |
| `j.ahrens@21capitalinvest.de` | Berater Edelmetalle |
| `n.weber@21capitalinvest.de` | Beraterin Immobilien |
| `l.dorn@21capitalinvest.de` | Berater Kapitalmarkt |

Am eindrucksvollsten ist der Ablauf mit **zwei Fenstern**: links das CRM als
`j.ahrens`, rechts der Wizard. Eine Gold-Anfrage absenden – der Toast, der
Signalton, der Chat-Eintrag und die laufende Uhr erscheinen sofort.

`npm run seed -- --reset` baut den Demo-Stand neu auf.

---

## Was drin ist

### Lead-Wizard (öffentlich)
Fünf animierte Schritte, Auswahl per Karte mit sofortigem Weitersprung,
schrittweise Validierung mit deutschen Fehlermeldungen, Honeypot gegen Bots,
Doppel-Einwilligung (Kontakt verpflichtend, Marketing optional). Am Ende
sieht der Interessent seinen Ansprechpartner und seine Portal-Zugangsdaten.

### CRM
- **Dashboard** – Ø- und Median-Reaktionszeit, SLA-Quote, Pipeline-Wert,
  Abschlussquote, Verlauf, Leistung pro Fachgruppe gegen deren SLA,
  Bestenliste nach Reaktionszeit, „Wartet auf Erstkontakt" mit tickender Uhr.
- **Leads** – Board (Kanban) und Liste, Filter nach Zuständigkeit, Gruppe,
  Status, Suche über Name/Mail/Referenz, Sortierung u. a. nach Reaktionsfrist.
- **Lead-Detail** – laufende Uhr, Erstkontakt-Erfassung, Statusleiste,
  Übergabe an Kolleg:innen, Übernahme („Ich mache das"), Postausgang.
- **Aktivitätsstream** – lückenlos und dokumentationsfähig: Anfrage, Routing,
  Zuweisung, Erstkontakt mit gemessener Zeit, Anrufe mit Ergebnis und Dauer,
  Mails, Termine, Statuswechsel, Portal-Logins, Kundennachrichten.
- **Sprachnotizen** – Aufnahme direkt im Browser mit Pegelanzeige, Anhang am
  Stream, Abspielen in der Zeitleiste, Feld für spätere Transkription.
- **Aufgaben & Termine** – nach Überfällig/Heute/Morgen gruppiert;
  wiederkehrende Termine erzeugen beim Abhaken automatisch den Folgetermin
  (Monatsenden werden korrekt gekappt).
- **Team & Routing** – Fachgebiet-zu-Gruppe-Matrix und SLA pro Gruppe direkt
  editierbar, Präsenzanzeige, Direktnachricht per Klick.

### Interner Chat
Firmenkanal, ein Kanal je Fachgruppe und Direktnachrichten. Ungelesen-Zähler,
Tipp-Anzeige, Online-Status, `@`-Erwähnungen erzeugen Benachrichtigungen.
Neue Leads und SLA-Überschreitungen erscheinen als anklickbare Meldung im
Kanal der zuständigen Gruppe.

### Kundenportal
Bewusst hell und ruhig gehalten, klar abgesetzt vom dunklen CRM: Fortschritt
des Vorgangs, Ansprechpartner mit Direktwahl, nächste Schritte, Angebot mit
Annehmen/Ablehnen, Unterlagen, Nachrichtenfeld zurück an den Berater.

### Angebotsentwurf
Erzeugt aus Bedarf **und dem gesamten Gesprächsverlauf** einen Entwurf samt
nächster Schritte. Mit `ANTHROPIC_API_KEY` über die Claude API, ohne Schlüssel
über einen strukturierten Textbaustein – die Funktion ist also nie blockiert.
Preise bleiben in beiden Fällen Platzhalter; der Entwurf geht an den Berater
zur Prüfung, nie ungeprüft an den Kunden.

---

## Technik

| Bereich | Wahl |
| --- | --- |
| Server | Node 20+, Express 5, TypeScript |
| Datenbank | SQLite (better-sqlite3, WAL), Schema in `server/src/db/schema.sql` |
| Echtzeit | Socket.IO (Räume je Nutzer, Gruppe, Kanal) |
| Auth | Argon2id + JWT im httpOnly-Cookie, getrennte Sitzungen für Mitarbeitende und Kunden |
| Mail | Nodemailer, mit Protokoll-Fallback ohne SMTP |
| Frontend | React 19, Vite 7, Tailwind 4, Framer Motion, Recharts |

Ein Monorepo mit npm-Workspaces: `server/` und `web/`.

```
server/src
├── db/          Schema, Migration, Seed
├── lib/         Auth, Mail, Realtime, Benachrichtigungen, SLA-Watchdog,
│                Lead-Domäne, Intake-Pipeline, KI-Entwurf
└── routes/      auth, public, portal, leads, activities, tasks, offers,
                 chat, notifications, stats, directory, uploads
web/src
├── components/  UI-Bausteine, App-Rahmen, SLA-Uhr, Sprachaufnahme
├── lib/         API-Client, Session/Socket, Formatierung, Typen
└── pages/       Wizard, Login, Dashboard, Leads, LeadDetail, Tasks,
                 Chat, Team, Portal
```

### Gestaltung

Alle Markenfarben liegen als CSS-Variablen in **einem** Block am Anfang von
`web/src/index.css` (`@theme`). Komponenten fassen keine Rohfarben an. Sobald
die finalen Hex-Werte der Unternehmensseite vorliegen, ist der Austausch eine
Änderung an dieser einen Stelle.

Die aktuelle Palette – tiefes Obsidian mit Feingold-Akzent und je einer
Sekundärfarbe pro Fachgruppe – ist eine begründete Annahme für ein
Edelmetall-/Kapitalanlagehaus, **nicht** von `21capitalinvest.com`
übernommen: die Domain ist aus dieser Entwicklungsumgebung nicht erreichbar.

Bewegung ist durchgehend an `prefers-reduced-motion` gebunden.

---

## Betrieb

```bash
npm run build      # Server nach server/dist, Frontend nach web/dist
npm start          # startet den kompilierten Server
npm run typecheck  # TypeScript über beide Workspaces
```

Vor dem Produktivbetrieb:

1. `JWT_SECRET` ersetzen (`openssl rand -hex 32`).
2. SMTP-Zugang eintragen – sonst werden Mails nur protokolliert.
3. `APP_URL` und `CORS_ORIGINS` auf die echte Domain setzen.
4. HTTPS terminieren; die Cookies werden bei `NODE_ENV=production`
   automatisch als `secure` gesetzt.
5. `data/` und `uploads/` in die Sicherung aufnehmen.

### Offene Punkte für den Produktivbetrieb

- **Markenfarben** aus der Unternehmensseite übernehmen (siehe *Gestaltung*).
- **Aufbewahrung und Löschfristen** für Leads, Sprachnotizen und den
  Aktivitätsstream festlegen – DSGVO-Auskunft und -Löschung sind noch nicht
  als Selbstbedienung abgebildet.
- **Transkription** der Sprachnotizen: Feld und Endpunkt existieren, die
  Anbindung eines Spracherkennungsdienstes fehlt.
- **Rate-Limit** auf der öffentlichen Wizard-Route ergänzen (heute schützt
  nur der Honeypot).
- **Kalender-Anbindung** (CalDAV/Exchange) für Termine, falls gewünscht.
