# Capital Lead Suite

Lead-Wizard, automatisches Fachgruppen-Routing, sofortige Benachrichtigung,
interner Chat, CRM mit Reaktionszeit-Messung und Kundenportal – für eine
Investment-Beratung von Edelmetallen bis Beteiligungen.

Der Kern ist ein Versprechen: **Ein Interessent stellt eine Anfrage und hört
innerhalb von Minuten von einem echten Menschen.** Alles hier dient dazu, das
messbar einzuhalten.

Gebaut für klassisches Shared Hosting: **PHP 8.2+, MySQL/MariaDB, Vanilla JS.**
Kein Build-Schritt, kein Composer, keine Node-Abhängigkeit. Dateien hochladen,
Konfiguration eintragen, läuft.

---

## Der Ablauf in einem Zug

1. **Wizard** – Der Interessent beantwortet vier kurze Fragen (Fachgebiet,
   Volumen, Profil, Kontakt) auf einer öffentlichen, animierten Strecke.
2. **Routing** – Das gewählte Fachgebiet bestimmt die zuständige Fachgruppe
   (Gold → Edelmetalle, Immobilien → Sachwerte, …). Die Zuordnung ist im CRM
   unter *Team & Routing* jederzeit änderbar.
3. **Reaktionsuhr startet** – Der Lead bekommt eine Frist aus der SLA der
   Gruppe (z. B. 10 Minuten bei Edelmetallen).
4. **Zuweisung** – Ein Berater der Gruppe wird bestimmt: beratende Rollen
   zuerst, dann der mit den wenigsten offenen Leads. Fair und erklärbar.
5. **Alarm** – Jedes Gruppenmitglied bekommt gleichzeitig
   - eine **E-Mail** mit allen Eckdaten,
   - eine **Benachrichtigung im CRM** (Einblendung + Signalton + Glocke),
   - eine **Lead-Meldung im Gruppen-Chat** mit Direktsprung in den Vorgang.
6. **Bestätigung an den Interessenten** – E-Mail mit Ansprechpartner,
   Reaktionsversprechen und Zugangsdaten für seinen persönlichen Bereich.
7. **Erstkontakt** – Der Berater erfasst den Anruf; die Uhr stoppt, die
   Reaktionszeit wird dauerhaft gespeichert und fließt in alle Kennzahlen.
   Die offene Aufgabe „Erstkontakt herstellen" schließt sich mit.
8. **Betreuung** – Aktivitätsstream, Notizen, Sprachnotizen, wiederkehrende
   Termine, Angebotsentwurf, Freigabe im Kundenportal.

Läuft die Uhr ab, meldet ein Wächter das der ganzen Gruppe – erst als
Vorwarnung bei halber Zeit, dann als Überschreitung im Chat und in der Glocke.

---

## Auf SiteGround einrichten

### 1. Datenbank anlegen

Site Tools → **MySQL** → Datenbank und Benutzer anlegen, dem Benutzer alle
Rechte auf die Datenbank geben. Name, Benutzer und Passwort notieren.

### 2. Dateien hochladen

Das Repository hat bewusst zwei Ebenen. `public_html/` ist der einzige
Ordner, der öffentlich erreichbar sein darf:

```
~/www/deine-domain.de/
├── public_html/     ← DocumentRoot (Inhalt dieses Ordners hochladen)
├── app/             ← eine Ebene darüber
├── db/
├── bin/
└── storage/
```

Per SSH ist das ein Befehl:

```bash
cd ~/www/deine-domain.de
git clone https://github.com/duesterhoeft-1907/Investments.git tmp
mv tmp/* tmp/.htaccess . 2>/dev/null; rm -rf tmp
```

Liegt am Ende alles **innerhalb** von `public_html/`, ist das auch in Ordnung –
`app/`, `db/`, `bin/` und `storage/` bringen je eine `.htaccess` mit, die den
Zugriff über den Browser sperrt. Sauberer ist die Trennung oben.

### 3. Konfiguration eintragen

```bash
cp app/config.local.example.php app/config.local.php
nano app/config.local.php
```

Einzutragen sind Datenbank, `base_url` und – falls Mails rausgehen sollen –
die SMTP-Daten eines Postfachs aus Site Tools → **E-Mail-Konten**.
Die Datei steht in `.gitignore` und landet nie im Repository.

### 4. Schema und Demo-Daten einspielen

```bash
php db/seed.php
```

Legt Tabellen, drei Fachgruppen, acht Berater, neun Fachgebiete, die
Chat-Kanäle und eine Woche Beispiel-Historie an.
`php db/seed.php --reset` baut alles neu auf.

**Vor dem Livegang:** Demo-Konten löschen oder die Passwörter ändern.

### 5. Reaktionszeit-Wächter einhängen

Site Tools → Devs → **Cron Jobs**, jede Minute:

```
/usr/local/bin/php /home/DEIN_KONTO/www/DEINE_DOMAIN/bin/cron-sla.php
```

Den genauen PHP-Pfad zeigt die Auswahl im Cron-Dialog.
Ohne Cron greift ersatzweise eine Prüfung beim Abrufen der Ereignisse – dann
aber nur, solange jemand im CRM angemeldet ist.

### 6. Prüfen

```bash
php bin/doctor.php
```

Der Selbsttest prüft PHP-Version, Erweiterungen, Datenbank, Schreibrechte,
SMTP, den Cron und die Verzeichnisstruktur – und sagt zu jedem Punkt, was zu
tun ist. Mailversand einzeln testen:

```bash
php bin/test-mail.php deine@adresse.de
```

### Automatisch deployen (empfohlen)

Statt jedes Mal von Hand hochzuladen: `.github/workflows/deploy.yml` überträgt
bei jedem Push auf den Branch. Der GitHub-Runner hat Netzzugang zu SiteGround.

Einmalig in GitHub → Repository → **Settings → Secrets and variables →
Actions** anlegen:

| Secret | Wert | Beispiel |
| --- | --- | --- |
| `SG_HOST` | SSH-Host aus den Site Tools | `ssh.meinkonto.sg-host.com` |
| `SG_PORT` | SSH-Port | `18765` |
| `SG_USER` | SSH-Benutzer | `u1234-abcdefgh` |
| `SG_PATH` | Zielverzeichnis auf dem Server | `/home/customer/www/meine-domain.de` |
| `SG_SSH_KEY` | **privater** Schlüssel zum in SiteGround hinterlegten öffentlichen | Inhalt von `~/.ssh/id_ed25519` |

Danach läuft bei jedem Push: PHP-Syntaxprüfung → Übertragung per rsync →
Rechte setzen → `bin/doctor.php` auf dem Server. Das Ergebnis steht im
Actions-Protokoll.

Beim allerersten Lauf zusätzlich Actions → *Deploy zu SiteGround* →
**Run workflow** mit gesetztem Häkchen *Schema und Demo-Daten einspielen*.

Übertragen wird niemals `app/config.local.php` und niemals der Inhalt von
`storage/` – Konfiguration, hochgeladene Dateien, Sitzungen und Protokolle
bleiben auf dem Server unangetastet.

Von Hand geht dasselbe von jedem Rechner mit SSH-Zugang:

```bash
SG_HOST=ssh.meinkonto.sg-host.com \
SG_USER=u1234-abcdefgh \
SG_PATH=/home/customer/www/meine-domain.de \
bin/deploy.sh
```

### 7. Aufrufen

| Adresse | Was |
| --- | --- |
| `/` | Öffentlicher Lead-Wizard |
| `/app` | Internes CRM |
| `/portal` | Kundenbereich |

**Demo-Zugänge** (Passwort für alle: `Invest2026!`)

| E-Mail | Rolle |
| --- | --- |
| `admin@21capitalinvest.de` | Geschäftsführung – sieht alles, darf Routing ändern |
| `leitung@21capitalinvest.de` | Vertriebsleitung |
| `j.ahrens@21capitalinvest.de` | Berater Edelmetalle |
| `n.weber@21capitalinvest.de` | Beraterin Immobilien |
| `l.dorn@21capitalinvest.de` | Berater Kapitalmarkt |

Am eindrucksvollsten mit **zwei Fenstern**: links das CRM als `j.ahrens`,
rechts der Wizard. Eine Gold-Anfrage absenden – Einblendung, Signalton,
Chat-Eintrag und laufende Uhr erscheinen innerhalb von Sekunden.

---

## Lokal entwickeln

```bash
cp app/config.local.example.php app/config.local.php   # DB eintragen
php db/seed.php --reset
php -S localhost:8080 -t public_html bin/dev-router.php
```

`bin/dev-router.php` bildet nach, was auf dem Server die `.htaccess` macht,
und wird dort nicht gebraucht.

---

## Was drin ist

### Lead-Wizard (öffentlich)
Fünf animierte Schritte, Auswahl per Karte mit sofortigem Weitersprung,
schrittweise Validierung mit deutschen Fehlermeldungen, Honigtopf gegen Bots,
Drosselung je IP, Doppel-Einwilligung (Kontakt verpflichtend, Marketing
optional). Am Ende sieht der Interessent seinen Ansprechpartner und seine
Portal-Zugangsdaten.

### CRM
- **Dashboard** – Ø- und Median-Reaktionszeit, SLA-Quote, Pipeline-Wert,
  Abschlussquote, Verlauf, Leistung pro Fachgruppe gegen deren SLA,
  Bestenliste nach Reaktionszeit, „Wartet auf Erstkontakt" mit tickender Uhr.
  Die Diagramme sind handgezeichnetes SVG – keine Diagrammbibliothek.
- **Leads** – Board und Liste, Filter nach Zuständigkeit, Gruppe und Status,
  Suche über Name/Mail/Referenz, Sortierung u. a. nach Reaktionsfrist.
- **Lead-Detail** – laufende Uhr, Erstkontakt-Erfassung, Statusleiste,
  Übergabe an Kolleg:innen, Übernahme („Ich mache das"), Postausgang.
- **Aktivitätsstream** – lückenlos und dokumentationsfähig: Anfrage, Routing,
  Zuweisung, Erstkontakt mit gemessener Zeit, Anrufe mit Ergebnis und Dauer,
  Mails, Termine, Statuswechsel, Portal-Logins, Kundennachrichten.
- **Sprachnotizen** – Aufnahme direkt im Browser mit Pegelanzeige, Anhang am
  Stream, Abspielen in der Zeitleiste, Feld für spätere Transkription.
- **Aufgaben & Termine** – nach Überfällig/Heute/Morgen gruppiert;
  wiederkehrende Termine erzeugen beim Abhaken den Folgetermin
  (Monatsenden werden korrekt gekappt).
- **Team & Routing** – Fachgebiet-zu-Gruppe-Matrix und SLA pro Gruppe direkt
  editierbar, Präsenzanzeige, Direktnachricht per Klick.

### Interner Chat
Firmenkanal, ein Kanal je Fachgruppe und Direktnachrichten. Ungelesen-Zähler,
Online-Status, `@`-Erwähnungen erzeugen Benachrichtigungen. Neue Leads und
SLA-Überschreitungen erscheinen als anklickbare Meldung im Kanal der
zuständigen Gruppe.

### Kundenportal
Bewusst hell und ruhig, klar abgesetzt vom dunklen CRM: Fortschritt des
Vorgangs, Ansprechpartner mit Direktwahl, nächste Schritte, Angebot mit
Annehmen/Ablehnen, Unterlagen, Nachrichtenfeld zurück an den Berater.

### Angebotsentwurf
Erzeugt aus Bedarf **und dem gesamten Gesprächsverlauf** einen Entwurf samt
nächster Schritte. Mit `anthropic.api_key` über die Claude API, ohne Schlüssel
über einen strukturierten Textbaustein – die Funktion ist also nie blockiert.
Preise bleiben in beiden Fällen Platzhalter; der Entwurf geht an den Berater
zur Prüfung, nie ungeprüft an den Kunden.

---

## Technik

| Bereich | Wahl |
| --- | --- |
| Server | PHP 8.2+, kein Framework, eigener Front-Controller |
| Datenbank | MySQL/MariaDB, wechselnde Strukturen als `JSON`-Spalten |
| Echtzeit | Abruf im Sekundentakt über eine Ereignistabelle |
| Anmeldung | PHP-Sitzungen, `password_hash()`, CSRF-Token im Header |
| Mail | eigener SMTP-Client, mit Protokoll-Fallback ohne Zugang |
| Frontend | Vanilla JS als ES-Module, kein Build, kein Framework |

```
app/
├── Core/         Config, Db, Http, Auth, Router, Validator, Mailer, Smtp
├── Domain/       Leads, Intake, Events, Notify, Sla, OfferDraft
├── Controllers/  Public, Auth, Leads, Activities, Tasks, Offers, Chat,
│                 Notifications, Stats, Directory, Uploads, Portal, Events
└── Views/        drei HTML-Hüllen (Wizard, CRM, Portal)
public_html/
├── index.php     Front-Controller
├── .htaccess     Rewrite, Sicherheits-Header, Kompression
└── assets/       CSS und ES-Module – genau das, was der Browser lädt
db/               schema.sql und seed.php
bin/              cron-sla.php, doctor.php, test-mail.php, dev-router.php
storage/          Uploads, Sitzungen, Protokolle (nicht öffentlich)
```

### Warum Abruf statt WebSockets

Auf Shared Hosting werden PHP-Prozesse pro Anfrage gestartet und beendet –
dauerhafte Verbindungen gibt es nicht. Statt dessen schreibt jede Aktion ein
Ereignis in eine Tabelle mit aufsteigender ID; der Browser fragt „alles ab
Ereignis N". Für den Nutzer fühlt sich das wie Push an, denn bei einer Frist
von Minuten sind drei Sekunden ohne Bedeutung.

Im Hintergrundtab vervierfacht sich der Abstand, bei Fehlern wächst er
schrittweise. Der Wechsel auf echte WebSockets später betrifft genau zwei
Dateien: `app/Domain/Events.php` und `public_html/assets/js/core/pulse.js`.

### Gestaltung

Alle Markenfarben stehen im `:root`-Block am Anfang von
`public_html/assets/css/app.css`. Kein Bauteil fasst eine Rohfarbe an – der
Austausch ist eine Änderung an dieser einen Stelle.

Die aktuelle Palette – tiefes Obsidian mit Feingold-Akzent und je einer
Sekundärfarbe pro Fachgruppe – ist eine begründete Annahme für ein
Edelmetall-/Kapitalanlagehaus, **nicht** von der Unternehmensseite übernommen:
die Domain ist aus der Entwicklungsumgebung nicht erreichbar. Um sie zu
übernehmen, genügt vom Server aus:

```bash
curl -s https://21capitalinvest.com/en/home_en/ > /tmp/seite.html
grep -oE '#[0-9a-fA-F]{6}' /tmp/seite.html | sort | uniq -c | sort -rn | head -20
```

Bewegung ist durchgehend an `prefers-reduced-motion` gebunden.

---

## Sicherheit

- Passwörter über `password_hash()`; getrennte Sitzungen für Mitarbeitende
  und Kunden, ein Kundenlogin erbt nie CRM-Rechte.
- CSRF-Token im Header bei jedem verändernden Aufruf.
- Ausschließlich vorbereitete Anweisungen; kein SQL aus Eingaben.
- Uploads: Typ wird am Inhalt bestimmt, nicht an der Endung geglaubt; die
  Dateien liegen außerhalb des DocumentRoot und werden über PHP ausgeliefert.
  Ein Kunde sieht nur, was für ihn freigegeben ist.
- Öffentliche Wizard-Route mit Honigtopf und Drosselung je IP und Stunde.
- Anmeldung meldet bei falscher Adresse und falschem Passwort dasselbe.

### Vor dem Livegang

1. Demo-Konten löschen oder Passwörter ändern.
2. HTTPS erzwingen (Site Tools → Security → HTTPS-Enforce). Die Sitzungs-
   Cookies werden dann automatisch als `secure` gesetzt.
3. `app_env` auf `production` lassen – Fehlermeldungen gehen dann ins
   Protokoll statt in die Antwort.
4. `storage/` und die Datenbank in die Sicherung aufnehmen.

### Offene Punkte

- **Markenfarben** aus der Unternehmensseite übernehmen (siehe *Gestaltung*).
- **Aufbewahrung und Löschfristen** für Leads, Sprachnotizen und den
  Aktivitätsstream festlegen – DSGVO-Auskunft und -Löschung sind noch nicht
  als Selbstbedienung abgebildet.
- **Transkription** der Sprachnotizen: Feld und Endpunkt existieren, die
  Anbindung eines Spracherkennungsdienstes fehlt.
- **Kalender-Anbindung** (CalDAV/Exchange) für Termine, falls gewünscht.
