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

### 3. Einrichten – ein Befehl

```bash
php bin/setup.php
```

Das Skript fragt der Reihe nach ab, was es braucht: Datenbank, `base_url`,
optional SMTP (Site Tools → **E-Mail-Konten**) und die Firmendaten. Das
Passwort wird verdeckt eingegeben. Bevor irgendetwas geschrieben wird, prüft
es die PHP-Version, die Erweiterungen und die Datenbankverbindung – ein
Tippfehler kostet also nur einen zweiten Anlauf, keine halbfertige
Installation.

Danach schreibt es `app/config.local.php` mit Rechten `600`, legt die
Verzeichnisse unter `storage/` an, spielt Schema und Demo-Daten ein und lässt
den Selbsttest laufen. Eine vorhandene Konfiguration wird nur nach Rückfrage
überschrieben; die Datei steht in `.gitignore` und landet nie im Repository.

<details>
<summary>Lieber von Hand</summary>

```bash
cp app/config.local.example.php app/config.local.php
nano app/config.local.php          # Datenbank, base_url, SMTP
php db/seed.php                    # Schema und Demo-Daten
php bin/doctor.php                 # Selbsttest
```

</details>

### 3b. Aktualisieren einer bestehenden Installation

`schema.sql` legt nur an, was noch fehlt – neue Spalten in bestehenden
Tabellen erreicht es nie. Dafür gibt es:

```bash
php db/migrate.php          # anwenden
php db/migrate.php --dry    # nur zeigen, was zu tun wäre
```

Jeder Schritt prüft selbst, ob er nötig ist, darf beliebig oft laufen und
löscht nichts. `bin/pull-deploy.sh`, der Deploy-Workflow und `bin/setup.php`
rufen das von sich aus auf; `bin/doctor.php` meldet, wenn etwas aussteht.

### 4. Was der Seed anlegt

Tabellen, drei Fachgruppen, acht Berater, neun Fachgebiete, die Chat-Kanäle
und eine Woche Beispiel-Historie.
`php db/seed.php --reset` baut alles neu auf.

**Vor dem Livegang:** Demo-Konten löschen oder die Passwörter ändern.

### 5. Reaktionszeit-Wächter einhängen

Site Tools → Devs → **Cron Jobs**, im kleinsten Takt, den der Tarif zulässt – mit `--loop=<Takt>`, damit das Skript bis zum nächsten Start jede Minute weiterprüft:

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

### Weg A: Der Server holt sich den Stand selbst (in Betrieb)

Der einfachere Weg, und der hier benutzte — es braucht keinen SSH-Zugang von
aussen und keinen privaten Schlüssel in GitHub, nur Netz vom Server zu GitHub.
Für ein CRM ist das ein Schlüssel weniger, der an einer Stelle mehr liegt.

**Einmalig einrichten** (per SSH auf dem Server):

```bash
cd ~/www/deine-domain.de
git clone -b claude/lead-management-crm-5kniyn \
  https://github.com/duesterhoeft-1907/Investments.git .
php bin/setup.php                  # fragt alles ab, prüft, spielt ein
```

Bei einem **privaten** Repository statt HTTPS über SSH klonen und vorher einen
Deploy-Key hinterlegen: auf dem Server `ssh-keygen -t ed25519` ausführen und
den Inhalt von `~/.ssh/id_ed25519.pub` in GitHub unter
Settings → Deploy keys eintragen (Schreibrechte sind nicht nötig).

**Jede weitere Aktualisierung** ist dann ein Befehl:

```bash
cd ~/www/deine-domain.de && bin/pull-deploy.sh
```

Das Skript spult nur vor (`--ff-only`), setzt die Rechte und lässt den
Selbsttest laufen. `app/config.local.php` und der Inhalt von `storage/` stehen
in `.gitignore` und werden nie angefasst.

Wer das automatisch mag, hängt es in den Cron (Site Tools → Devs → Cron Jobs),
z. B. stündlich:

```
cd /home/customer/www/deine-domain.de && bin/pull-deploy.sh >/dev/null 2>&1
```

### Weg B: GitHub schiebt den Stand hinüber (nicht nötig)

`.github/workflows/deploy.yml` überträgt bei jedem Push auf den Branch. Der
GitHub-Runner hat Netzzugang zu SiteGround.

**Man braucht diesen Weg nicht, wenn Weg A läuft** – beide tun dasselbe, und
zweimal ausrollen ist nicht besser als einmal. Wer Weg A nutzt, legt die
folgenden Secrets gar nicht erst an. Der Workflow läuft dann trotzdem, prüft die
PHP-Syntax und überspringt das Ausrollen; der Lauf bleibt grün, es kommt keine
Fehlermail. Die Syntaxprüfung ist gerade beim Cron-Weg nützlich: dort zieht
sich der Server den Stand blind, eine kaputte Datei fiele erst an der weißen
Seite auf.

Wer den Workflow von Hand startet (*Run workflow*), will ausrollen – dann sind
fehlende Secrets sehr wohl ein Fehler und der Lauf bricht ab.

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
| `/` | Startseite |
| `/anfrage` | Öffentlicher Lead-Wizard |
| `/impressum` | Pflichtangaben und Risikohinweis |
| `/en`, `/en/contact`, `/en/imprint` | dieselben Seiten auf Englisch |
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

### Startseite (öffentlich)
`/` ist die Startseite mit den Inhalten des bisherigen Auftritts: Hero,
*Das Problem – Enteignung & Nullzinsfalle*, der Weckruf, *Die Lösung* mit den
drei Punkten des Erstgesprächs, dann der Weg in die Anfrage. Dazu
`/impressum` mit den Pflichtangaben und dem Risikohinweis, der auch im Fuß
jeder Seite steht – dort, wo die Renditeversprechen stehen, nicht zwei Klicks
entfernt. Beides gibt es auch auf Englisch unter `/en` und `/en/imprint`.

Serverseitig gerendert, nicht per JavaScript aufgebaut: eine Startseite muss
auch dann stehen, wenn ein Skript hakt, und Suchmaschinen lesen den Text so
ohne Umweg. Das Skript blendet nur ein, was ins Bild scrollt (`zoom-in`,
400 ms – die Bewegung der bisherigen Seite), und respektiert
`prefers-reduced-motion`.

### Zweisprachig: Deutsch und Englisch
Die öffentliche Strecke gibt es in beiden Sprachen: `/` und `/en`,
`/anfrage` und `/en/contact`, `/impressum` und `/en/imprint`. Der Umschalter
oben rechts führt auf **dieselbe** Seite in der anderen Sprache, nicht zurück
auf die Startseite. Im Kopf stehen `hreflang` und `canonical`, damit eine
Suchmaschine die beiden Fassungen als eine Seite in zwei Sprachen erkennt und
nicht als zwei Seiten, die einander Konkurrenz machen.

Die Texte liegen in `app/Lang/de.php` und `app/Lang/en.php`; fehlt ein
Schlüssel auf Englisch, steht dort der deutsche Satz statt einer leeren
Zeile. Die Bezeichnungen der Fachgebiete und Gruppen sind Stammdaten und
stehen in eigenen Spalten (`asset_classes.name_en`, `tagline_en`,
`description_en`, `teams.name_en`) – leer heißt: den deutschen Namen nehmen.

Was aus der Anfrage folgt, folgt der Sprache mit: die Kontaktzeitfenster
(„Mornings (9 am – 12 noon)" statt „Vormittags (9 – 12 Uhr)"), die
Fehlermeldungen, die Reaktionszusage und die Bestätigungs-E-Mail. Am Lead
bleibt die Sprache gespeichert (`leads.lang`) und steht im CRM als Merkmal
neben dem Namen – damit niemand auf Deutsch zurückruft, wo Englisch gefragt
war. Die Mail an das Fachteam bleibt deutsch: die lesen Kolleg:innen.

Intern – CRM, Verwaltung, Chat – bleibt alles deutsch.

### Lead-Wizard (öffentlich)
Fünf animierte Schritte, Auswahl per Karte mit sofortigem Weitersprung,
schrittweise Validierung in der Sprache der Seite, Honigtopf gegen Bots,
Drosselung je IP, Doppel-Einwilligung (Kontakt verpflichtend, Marketing
optional). Am Ende sieht der Interessent seinen Ansprechpartner und seine
Portal-Zugangsdaten.

#### Bewegung und Tiefe
Der Wizard ist für das Telefon gebaut und wächst nach oben, nicht umgekehrt:
kurzer Hero, damit die erste Karte nicht unter der Falte liegt, Vor- und
Nachname nebeneinander, und die Steuerleiste klebt unten im Daumenbereich –
mit einem Verlauf, hinter dem der Inhalt weich verschwindet statt an einer
Kante abgeschnitten zu werden.

Die Tiefe kommt aus Verläufen und Schatten, nicht aus Bildern: helle Kante
oben, Schatten unten, ein Lichtschein, der auf dem Rechner dem Zeiger folgt,
und eine Neigung von wenigen Grad in dessen Richtung. Beim Scrollen wandert
der Hintergrund langsamer mit als der Inhalt. Karten blenden ein, sobald sie
ins Bild kommen, versetzt; der Schrittwechsel kommt von rechts und geht nach
links, rückwärts andersherum. Ein Fortschrittsfaden am oberen Rand bleibt
auch dann sichtbar, wenn die Schrittanzeige längst weggescrollt ist.

Alles davon steckt in `assets/js/core/motion.js` und hält sich an drei
Regeln: nur `transform`, `opacity` und `filter` – alles andere lässt den
Browser das Layout neu rechnen, und das sieht man auf einem älteren Telefon
sofort. Wer *Bewegung reduzieren* eingestellt hat, bekommt keine, nicht
weniger. Und Zeigergesteuertes gibt es nur, wo ein Zeiger ist; auf dem
Telefon übernehmen Druck und Scrollen.

#### Hell oder dunkel, eckig
Alle vier Bereiche gibt es in beiden Fassungen. Oben rechts steht überall
derselbe Umschalter – auch auf den beiden Anmeldemasken, damit sich niemand
erst im Dunkeln anmelden muss, der hell arbeitet.

Wer nichts wählt, bekommt, was sein Gerät sagt: das entscheidet eine
`@media (prefers-color-scheme)`-Regel, also auch ohne JavaScript. Wer wählt,
dessen Wahl steht als `data-theme` am `<html>` und in `localStorage`, gilt
über alle Bereiche hinweg und überlebt das Neuladen. Ein kurzes Skript im
Kopf jeder Seite setzt sie, **bevor** das erste Bild gezeichnet wird – sonst
blitzte die falsche Fassung auf.

Die Farben stehen in zwei Schichten: unten die Palette der Marke, die sich
nie ändert, darüber Merkmale wie `--bg`, `--surface`, `--text`, `--hairline`.
Nur die werden umgeschaltet, und nur sie stehen in den Regeln. Zwei Tripel
tragen die Arbeit: `--auf` ist die Farbe zum Aufhellen (auf Dunkel weiß, auf
Hell dasselbe Tintenblau wie der Text), `--ab` die Schattenfarbe mit einem
Faktor `--schatten` – auf hellem Grund muss ein Schatten viel schwächer sein,
sonst wirkt er wie Schmutz.

Die Kanten sind eckig: Flächen mit 0, Schaltflächen mit 2 px, damit sie als
bedienbar von den Flächen unterschieden bleiben. Rund bleibt, was ein Zeichen
ist und keine Fläche – Statuspunkte, Ringe, der Nebel im Hintergrund.

Was sich nicht mit umschaltet, tut das mit Absicht und mit Begründung im
Quelltext: Weiß auf Rot, die Maske über dem Raster, das Markenschild im
Kundenbereich. Die Wortmarke ist weiß gezeichnet und würde auf Weiß
verschwinden – für die helle Fassung liegt sie als `logo-hell.png` daneben,
mit der Wortmarke in Textfarbe und unverändertem Türkis.

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
- **Verwaltung** – vier Registerkarten: Ruhezeiten, Zuordnung, Fachgebiete,
  Mitarbeiter. Sichtbar für Leitung und Verwaltung; Rollen, Zugänge und
  Passwörter setzt allein die Verwaltung.

#### Zuordnung per Ziehen
Zwei Bretter. Oben die Fachgebiete auf die Gruppen – ein Gebiet gehört zu
genau einer Gruppe, Ziehen verschiebt es. Unten die Mitarbeiter, und das ist
eine n:n-Beziehung (`team_members`): jemand darf in mehreren Gruppen sein.
Deshalb *fügt* Ziehen dort hinzu, statt zu verschieben – aus der Gruppe nimmt
man jemanden über das × auf seiner Karte.

Gezogen wird über Zeigereignisse, nicht über die HTML5-Schnittstelle: die gibt
es auf Touchgeräten nicht, das Brett wäre am iPad tot. Maus, Stift und Finger
laufen über denselben Code (`assets/js/core/dnd.js`), beides ist im Browser
nachgemessen.

Die letzte Person einer Gruppe lässt sich nicht herausnehmen – sonst liefen
Anfragen dieser Gruppe ins Leere.

#### Fachgebiete
Anlegen, umbenennen, Kurzzeile und Beschreibung für den Wizard, Gruppe
zuweisen. Das Kürzel entsteht aus dem Namen (Umlaute werden aufgelöst).

Gelöscht wird nie, nur stillgelegt: an einem Fachgebiet hängen Leads, und ein
Verlauf mit leerer Stelle ist kein Verlauf mehr. Stillgelegte verschwinden aus
dem Wizard, bestehende Anfragen behalten sie.

#### Ruhezeiten
Die Reaktionsuhr läuft nur während der eingetragenen Geschäftszeiten. Ohne das
wäre eine Anfrage um 23:40 Uhr zehn Minuten später „überschritten", obwohl
niemand etwas falsch gemacht hat – die Kennzahl würde die Nacht messen statt
die Arbeit.

Angenommen wird trotzdem rund um die Uhr: der Wizard bleibt offen, die Frist
beginnt zur nächsten Öffnung. Der Interessent liest dann „morgen früh ab 9:00
Uhr" statt einer Minutenzahl, die niemand halten kann.

Je Wochentag beliebig viele Zeitfenster (etwa mit Mittagspause), dazu
Feiertage und Betriebsferien als ganztägige Ausnahmen. Gerechnet wird in der
eingestellten Zeitzone, gespeichert in UTC. Die Rechnung deckt
`bin/test-hours.php` mit zwanzig Proben ab – Wochenenden, Pausen,
Zeitumstellung, kaputte Eingaben.

Abschalten geht, dann läuft die Uhr wieder rund um die Uhr; die Oberfläche
sagt, was das bedeutet.

#### Abwesenheit
Wer abwesend gemeldet ist, bekommt keine neuen Leads zugeteilt – die
Verteilung überspringt ihn. Jeder kann sich selbst abmelden, Leitung und
Verwaltung auch andere. Ist die ganze Gruppe abwesend, wird trotzdem
zugewiesen: ein Lead ohne Zuständigen wäre schlimmer als einer bei jemandem im
Urlaub, und die Gruppe wird ohnehin alarmiert.

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
db/               schema.sql, seed.php und migrate.php
bin/              setup.php, cron-sla.php, doctor.php, test-hours.php, test-mail.php, dev-router.php
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

Farben, Schriften, Rundungen und Bewegung stammen aus dem Auftritt von
21capitalinvest.com und stehen in einem `:root`-Block in
`assets/css/app.css` – kein Bauteil fasst eine Rohfarbe an.

| | |
|---|---|
| Akzent | `#21B4A6` · `#0FAF9F` · `#21DDD3` (Astra-Palette der Seite) |
| Flächen | `#061314` · `#111A28` · `#1C2A3C` |
| Text | `#EDF6F3` · `#E7EAF4` · `#D5DDEA` · `#B0BACC` |
| Überschriften | Archivo 600 |
| Fließtext | Inter Tight 400 |
| Radius | 6px, Karten 10px |
| Einblendung | `zoom-in`, 400 ms, `ease` (wie AOS auf der Seite) |

Die Schriften liegen als `woff2` unter `assets/fonts/` und werden selbst
ausgeliefert: keine fremde Domain im Ladepfad, und die Anwendung bleibt
ohne Netz nach draußen vollständig. Die Dateien stammen unverändert aus der
Auslieferung der Unternehmensseite. Inter Tight gibt es dort nur im
regulären Schnitt – wir machen es genauso.

Das Logo (`assets/brand/logo.png`) ist hell auf durchsichtigem Grund. Im
dunklen Wizard und CRM steht es frei; im hellen Kundenbereich auf einer
dunklen Auflage, damit dort dasselbe Zeichen erscheint statt eines
Ersatz-Schriftzugs.

Die Akzentfarben von Fachgruppen und Personen stehen als Daten in der
Datenbank, nicht im CSS. `db/migrate.php` stellt sie in einer bestehenden
Installation mit um – sonst bliebe die Umstellung halb sichtbar.

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
