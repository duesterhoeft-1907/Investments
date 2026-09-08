<?php
/**
 * Baut einen vollständigen Demo-Stand: Fachgruppen, Berater, Fachgebiete,
 * Chat-Kanäle und eine Woche realistischer Lead-Historie.
 *
 *   php db/seed.php            nur anlegen, wenn die Datenbank leer ist
 *   php db/seed.php --reset    alles löschen und neu aufbauen
 */
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Auth;
use App\Core\Db;
use App\Domain\Leads;

const DEMO_PASSWORD = 'Invest2026!';

$reset = in_array('--reset', $argv, true);

// ── Schema sicherstellen ──
$schema = file_get_contents(__DIR__ . '/schema.sql');
if ($schema === false) {
    fwrite(STDERR, "schema.sql nicht lesbar.\n");
    exit(1);
}
// Kommentarzeilen zuerst entfernen: sonst beginnt die per Semikolon
// getrennte Anweisung mit "--" und wuerde als reiner Kommentar verworfen –
// die CREATE TABLE dahinter ginge lautlos verloren.
$statements = [];
$buffer = '';
foreach (preg_split('/\R/', $schema) ?: [] as $line) {
    $trimmed = trim($line);
    if ($trimmed === '' || str_starts_with($trimmed, '--')) {
        continue;
    }
    $buffer .= $line . "\n";
    if (str_ends_with($trimmed, ';')) {
        $statements[] = trim($buffer);
        $buffer = '';
    }
}
if (trim($buffer) !== '') {
    $statements[] = trim($buffer);
}
foreach ($statements as $statement) {
    Db::pdo()->exec(rtrim($statement, "; \n\r\t"));
}

if ($reset) {
    Db::pdo()->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ([
        'events', 'presence', 'rate_limits', 'messages', 'channel_members', 'channels',
        'notifications', 'email_log', 'attachments', 'offers', 'tasks', 'activities',
        'leads', 'asset_classes', 'team_members', 'teams', 'users', 'settings',
    ] as $table) {
        Db::pdo()->exec("TRUNCATE TABLE $table");
    }
    Db::pdo()->exec('SET FOREIGN_KEY_CHECKS = 1');
    echo "[seed] Bestehende Daten entfernt.\n";
}

if ((int) Db::value('SELECT COUNT(*) FROM users') > 0) {
    echo "[seed] Datenbank enthält bereits Daten – übersprungen. (php db/seed.php --reset erzwingt Neuaufbau)\n";
    exit(0);
}

// ─────────────────────────── Stammdaten ───────────────────────────

// Slug, Name, englischer Name, Beschreibung, Farbe, Reaktionszeit
$teams = [
    ['edelmetalle', 'Edelmetalle', 'Precious Metals', 'Gold, Silber, Platin und Palladium – physisch, verwahrt oder besichert.', '#21B4A6', 10],
    ['sachwerte', 'Sachwerte & Immobilien', 'Tangible Assets & Real Estate', 'Immobilien, Diamanten, Sammler- und Kunstwerte.', '#7F9FB8', 20],
    ['kapitalmarkt', 'Kapitalmarkt & Beteiligungen', 'Capital Markets & Holdings', 'Private Equity, Fonds, Anleihen und digitale Assets.', '#9B8BC4', 15],
];

$teamIds = [];
foreach ($teams as $i => [$slug, $name, $nameEn, $description, $color, $sla]) {
    $teamIds[$slug] = Db::insert(
        'INSERT INTO teams (slug, name, name_en, description, color, sla_minutes, sort_order)
         VALUES (:slug, :name, :name_en, :description, :color, :sla, :sort)',
        ['slug' => $slug, 'name' => $name, 'name_en' => $nameEn, 'description' => $description,
         'color' => $color, 'sla' => $sla, 'sort' => $i]
    );
}

// Slug, Name, Gruppe, Symbol, Zeile, Beschreibung – und dieselben drei Texte
// auf Englisch fuer /en/contact. Leer bliebe zulaessig; dann stuende dort der
// deutsche Text.
$assetClasses = [
    ['gold', 'Gold', 'edelmetalle', 'coins', 'Der Klassiker der Wertsicherung', 'Barren und Münzen, physisch geliefert oder im Zollfreilager verwahrt.',
        'Gold', 'The classic store of value', 'Bars and coins, physically delivered or held in a bonded warehouse.'],
    ['silber', 'Silber', 'edelmetalle', 'layers', 'Industriemetall mit Hebel', 'Silber als Beimischung mit hoher Volatilität und industrieller Nachfrage.',
        'Silver', 'An industrial metal with leverage', 'Silver as an admixture with high volatility and industrial demand.'],
    ['platin-palladium', 'Platin & Palladium', 'edelmetalle', 'gem', 'Knappe Industriemetalle', 'Enge Märkte, hohe Preisdynamik, strategische Beimischung.',
        'Platinum & palladium', 'Scarce industrial metals', 'Narrow markets, strong price dynamics, a strategic admixture.'],
    ['immobilien', 'Immobilien', 'sachwerte', 'building', 'Substanz mit laufendem Ertrag', 'Wohn- und Gewerbeobjekte, direkt oder über Beteiligungen.',
        'Real estate', 'Substance with a running yield', 'Residential and commercial property, directly or through holdings.'],
    ['diamanten', 'Diamanten & Farbedelsteine', 'sachwerte', 'diamond', 'Wert auf kleinstem Raum', 'Zertifizierte Investmentsteine mit internationaler Handelbarkeit.',
        'Diamonds & coloured gemstones', 'Value in the smallest of spaces', 'Certified investment stones that trade internationally.'],
    ['sammlerwerte', 'Sammler- & Kunstwerte', 'sachwerte', 'palette', 'Leidenschaft mit Rendite', 'Kunst, Oldtimer und Sammlermünzen als Portfoliobeimischung.',
        'Collectibles & art', 'Passion with a return', 'Art, classic cars and collector coins as a portfolio admixture.'],
    ['private-equity', 'Private Equity', 'kapitalmarkt', 'trending', 'Unternehmerisch investieren', 'Direktbeteiligungen und Fonds abseits der Börse.',
        'Private equity', 'Investing entrepreneurially', 'Direct holdings and funds away from the stock exchange.'],
    ['fonds-anleihen', 'Fonds & Anleihen', 'kapitalmarkt', 'chart', 'Breit gestreut und planbar', 'Kuratierte Fonds- und Anleiheportfolios nach Risikoprofil.',
        'Funds & bonds', 'Broadly spread and plannable', 'Curated fund and bond portfolios by risk profile.'],
    ['digital-assets', 'Digitale Assets', 'kapitalmarkt', 'bitcoin', 'Reguliert in die neue Anlageklasse', 'Verwahrte Krypto-Investments über regulierte Partner.',
        'Digital assets', 'Regulated entry into the new asset class', 'Custodied crypto investments through regulated partners.'],
];

$assetIds = [];
$assetTeam = [];
$assetName = [];
foreach ($assetClasses as $i => [$slug, $name, $team, $icon, $tagline, $description, $nameEn, $taglineEn, $descriptionEn]) {
    $assetIds[$slug] = Db::insert(
        'INSERT INTO asset_classes (slug, name, name_en, tagline, tagline_en, description, description_en,
                                    icon, team_id, sort_order)
         VALUES (:slug, :name, :name_en, :tagline, :tagline_en, :description, :description_en,
                 :icon, :team, :sort)',
        ['slug' => $slug, 'name' => $name, 'name_en' => $nameEn,
         'tagline' => $tagline, 'tagline_en' => $taglineEn,
         'description' => $description, 'description_en' => $descriptionEn,
         'icon' => $icon, 'team' => $teamIds[$team], 'sort' => $i]
    );
    $assetTeam[$slug] = $team;
    $assetName[$slug] = $name;
}

$users = [
    ['admin@21capitalinvest.de', 'Marlene Voss', 'Geschäftsführung', 'admin', '+49 40 555 0100', '#21B4A6', ['edelmetalle', 'sachwerte', 'kapitalmarkt']],
    ['leitung@21capitalinvest.de', 'Robert Kienzle', 'Vertriebsleitung', 'manager', '+49 40 555 0101', '#21DDD3', ['edelmetalle', 'sachwerte', 'kapitalmarkt']],
    ['j.ahrens@21capitalinvest.de', 'Jonas Ahrens', 'Senior Berater Edelmetalle', 'agent', '+49 40 555 0110', '#0FAF9F', ['edelmetalle']],
    ['s.baumann@21capitalinvest.de', 'Sina Baumann', 'Beraterin Edelmetalle', 'agent', '+49 40 555 0111', '#0B8479', ['edelmetalle']],
    ['p.hoffmann@21capitalinvest.de', 'Pit Hoffmann', 'Berater Sachwerte', 'agent', '+49 40 555 0120', '#7F9FB8', ['sachwerte']],
    ['n.weber@21capitalinvest.de', 'Nadja Weber', 'Beraterin Immobilien', 'agent', '+49 40 555 0121', '#5F86A3', ['sachwerte']],
    ['l.dorn@21capitalinvest.de', 'Lukas Dorn', 'Berater Kapitalmarkt', 'agent', '+49 40 555 0130', '#9B8BC4', ['kapitalmarkt']],
    ['e.faber@21capitalinvest.de', 'Elif Faber', 'Beraterin Beteiligungen', 'agent', '+49 40 555 0131', '#8271AF', ['kapitalmarkt']],
];

$hash = Auth::hash(DEMO_PASSWORD);
$userIds = [];
foreach ($users as [$email, $name, $title, $role, $phone, $accent, $memberOf]) {
    $id = Db::insert(
        'INSERT INTO users (email, password_hash, name, title, phone, role, accent)
         VALUES (:email, :hash, :name, :title, :phone, :role, :accent)',
        ['email' => $email, 'hash' => $hash, 'name' => $name, 'title' => $title,
         'phone' => $phone, 'role' => $role, 'accent' => $accent]
    );
    $userIds[$email] = $id;
    foreach ($memberOf as $slug) {
        Db::run(
            'INSERT INTO team_members (team_id, user_id, team_role) VALUES (:t, :u, :r)',
            ['t' => $teamIds[$slug], 'u' => $id, 'r' => $role === 'agent' ? 'member' : 'lead']
        );
    }
}

// ─────────────────────────── Chat-Kanäle ───────────────────────────

$adminId = $userIds['admin@21capitalinvest.de'];

$companyChannel = Db::insert(
    "INSERT INTO channels (slug, name, type, topic, created_by)
     VALUES ('allgemein', 'Allgemein', 'company', 'Firmenweiter Austausch', :by)",
    ['by' => $adminId]
);
foreach ($userIds as $id) {
    Db::run('INSERT INTO channel_members (channel_id, user_id) VALUES (:c, :u)', ['c' => $companyChannel, 'u' => $id]);
}

$teamChannels = [];
foreach ($teams as [$slug, $name]) {
    $channelId = Db::insert(
        "INSERT INTO channels (slug, name, type, team_id, topic, created_by)
         VALUES (:slug, :name, 'team', :team, :topic, :by)",
        ['slug' => $slug, 'name' => $name, 'team' => $teamIds[$slug],
         'topic' => 'Leads & Absprachen – ' . $name, 'by' => $adminId]
    );
    $teamChannels[$slug] = $channelId;
    foreach (Db::all('SELECT user_id FROM team_members WHERE team_id = :t', ['t' => $teamIds[$slug]]) as $member) {
        Db::run(
            'INSERT IGNORE INTO channel_members (channel_id, user_id) VALUES (:c, :u)',
            ['c' => $channelId, 'u' => (int) $member['user_id']]
        );
    }
}

$ago = static fn (int $minutes): string => gmdate('Y-m-d H:i:s', time() - $minutes * 60);

$seedMessages = [
    [$companyChannel, $adminId, 'Willkommen im internen Chat. Neue Leads landen automatisch im jeweiligen Fachgruppen-Kanal – bitte innerhalb der SLA reagieren.', 4320],
    [$companyChannel, $userIds['leitung@21capitalinvest.de'], 'Kurze Erinnerung: Reaktionszeit unter 10 Minuten ist unser Versprechen an den Interessenten. Wer nicht kann, gibt den Lead im Kanal frei.', 2880],
    [$teamChannels['edelmetalle'], $userIds['j.ahrens@21capitalinvest.de'], 'Zollfreilager Zürich hat neue Konditionen bestätigt – ab 100k entfällt die Einlagerungsgebühr im ersten Jahr.', 600],
    [$teamChannels['sachwerte'], $userIds['n.weber@21capitalinvest.de'], 'Zwei Objekte in München sind wieder verfügbar. Wer einen passenden Interessenten hat, bitte melden.', 300],
];
foreach ($seedMessages as [$channel, $author, $body, $minutes]) {
    Db::run(
        "INSERT INTO messages (channel_id, user_id, body, kind, created_at) VALUES (:c, :u, :b, 'text', :at)",
        ['c' => $channel, 'u' => $author, 'b' => $body, 'at' => $ago($minutes)]
    );
}

// ─────────────────────────── Leads ───────────────────────────

$leads = [
    ['Katharina', 'Reimann', 'k.reimann@example.de', '+49 171 2340011', 'Hamburg', '20095', 'gold', '100k-250k', 'long', 'some', 'Inflationsschutz für das Familienvermögen', 'phone', 'vormittags', 'Wir möchten rund 150.000 € aus einer Fälligkeit in physisches Gold umschichten. Bitte um Rückruf.', 18, 7, 'qualified', ''],
    ['Bernd', 'Osterkamp', 'b.osterkamp@example.de', '+49 160 8877221', 'München', '80333', 'immobilien', 'over-500k', 'generational', 'experienced', 'Aufbau eines Bestandsportfolios', 'phone', 'nachmittags', 'Suche Objekte mit 4 % Rendite im süddeutschen Raum.', 1450, 12, 'proposal', 'Osterkamp Holding GmbH'],
    ['Yasmin', 'Talha', 'y.talha@example.de', '+49 152 3311447', 'Berlin', '10115', 'digital-assets', '25k-50k', 'medium', 'some', 'Beimischung digitaler Assets', 'email', 'abends', 'Wie funktioniert die Verwahrung über regulierte Partner?', 320, 44, 'contacted', ''],
    ['Hans-Georg', 'Lemke', 'hg.lemke@example.de', '+49 175 9982210', 'Bremen', '28195', 'silber', '50k-100k', 'medium', 'none', 'Erste Absicherung gegen Geldentwertung', 'phone', 'vormittags', '', 6, null, 'new', ''],
    ['Annika', 'Sörensen', 'a.sorensen@example.dk', '+45 22 114 880', 'Flensburg', '24937', 'diamanten', '250k-500k', 'long', 'experienced', 'Wertspeicher mit hoher Mobilität', 'whatsapp', 'flexibel', 'Interesse an zertifizierten Investmentsteinen ab 1 Karat.', 2900, 9, 'won', ''],
    ['Marco', 'Dellbrück', 'm.dellbrueck@example.de', '+49 178 4455112', 'Köln', '50667', 'private-equity', '100k-250k', 'long', 'professional', 'Unternehmerische Beteiligung im Mittelstand', 'phone', 'nachmittags', 'Bitte um Übersicht der aktuellen Zeichnungsmöglichkeiten.', 4300, 6, 'proposal', 'Dellbrück Beteiligungen'],
    ['Petra', 'Winkelmann', 'p.winkelmann@example.de', '', 'Leipzig', '04109', 'gold', 'under-25k', 'short', 'none', 'Kleiner Einstieg zum Ausprobieren', 'email', 'flexibel', 'Was kostet ein 100g-Barren inklusive Verwahrung?', 5900, 210, 'lost', ''],
    ['Tobias', 'Ehrlich', 't.ehrlich@example.de', '+49 151 7766338', 'Stuttgart', '70173', 'fonds-anleihen', '50k-100k', 'medium', 'some', 'Planbarer Ertrag neben dem Depot', 'phone', 'abends', 'Wie sieht ein defensives Portfolio bei Ihnen aus?', 2, null, 'new', ''],
    ['Ingrid', 'Falkenberg', 'i.falkenberg@example.de', '+49 172 5544001', 'Düsseldorf', '40213', 'platin-palladium', '25k-50k', 'medium', 'some', 'Diversifikation über Industriemetalle', 'phone', 'vormittags', '', 780, 11, 'contacted', ''],
    ['Sven', 'Marquardt', 's.marquardt@example.de', '+49 176 3322114', 'Hannover', '30159', 'sammlerwerte', '100k-250k', 'long', 'experienced', 'Kunst als Sachwertbeimischung', 'email', 'flexibel', 'Ich sammle Nachkriegsmoderne und suche Beratung zur Bewertung.', 8600, 33, 'qualified', ''],
    ['Rebecca', 'Thoma', 'r.thoma@example.de', '+49 170 8811223', 'Frankfurt', '60311', 'gold', '250k-500k', 'generational', 'professional', 'Substanzsicherung im Familienbüro', 'phone', 'vormittags', 'Wir prüfen Zollfreilager in der Schweiz. Bitte um Termin.', 11500, 4, 'won', 'Thoma Family Office'],
    ['Dennis', 'Kuypers', 'd.kuypers@example.de', '+49 159 4477002', 'Essen', '45127', 'immobilien', '100k-250k', 'long', 'none', 'Erste Anlageimmobilie', 'whatsapp', 'abends', 'Ist das mit Fremdkapital sinnvoll?', 45, 26, 'contacted', ''],
    ['Miriam', 'Gonzalez', 'm.gonzalez@example.de', '+49 173 9900112', 'Nürnberg', '90402', 'digital-assets', 'under-25k', 'short', 'some', 'Kleine Position aufbauen', 'email', 'flexibel', '', 14000, 88, 'lost', ''],
    ['Friedrich', 'Auerbach', 'f.auerbach@example.de', '+49 174 1122556', 'Dresden', '01067', 'silber', '25k-50k', 'medium', 'some', 'Antizyklisch aufstocken', 'phone', 'nachmittags', 'Wie ist das Gold-Silber-Verhältnis aktuell zu bewerten?', 9, null, 'new', ''],
];

$callNotes = [
    ['Erstgespräch geführt', 'reached', 'Sehr aufgeschlossen. Kennt die Anlageklasse aus dem Bekanntenkreis, will Verwahrung verstehen.'],
    ['Telefonat – nicht erreicht', 'no_answer', 'Mailbox besprochen, Rückruf für morgen früh angeboten.'],
    ['Rückruf vereinbart', 'callback', 'Bittet um Rückruf nach Feierabend, ab 18:30 Uhr erreichbar.'],
    ['Bedarfsanalyse abgeschlossen', 'positive', 'Anlagehorizont und Risikoprofil geklärt, Unterlagen zugesagt.'],
];

$rotation = [];
$pickAgent = static function (string $teamSlug) use (&$rotation, $users, $userIds): int {
    $agents = array_values(array_filter(
        $users,
        static fn (array $u): bool => $u[3] === 'agent' && in_array($teamSlug, $u[6], true)
    ));
    $index = ($rotation[$teamSlug] ?? 0) % count($agents);
    $rotation[$teamSlug] = $index + 1;
    return $userIds[$agents[$index][0]];
};

$nameOf = [];
foreach ($users as $u) {
    $nameOf[$userIds[$u[0]]] = $u[1];
}

foreach ($leads as $index => $l) {
    [$first, $last, $email, $phone, $city, $plz, $asset, $band, $horizon, $experience,
     $goal, $pref, $window, $message, $minutesAgo, $respondAfter, $status, $company] = $l;

    $teamSlug = $assetTeam[$asset];
    $teamId = $teamIds[$teamSlug];
    // Die ganze Zeile auseinandernehmen statt einen Index zu zaehlen: eine
    // zusaetzliche Spalte in $teams hat den Zugriff schon einmal still
    // verschoben, und die Reaktionszeit stand dann auf einer Farbe.
    [, , , , , $slaMinutes] = $teams[array_search($teamSlug, array_column($teams, 0), true)];
    $ownerId = $pickAgent($teamSlug);
    $createdAt = $ago($minutesAgo);
    $volume = Leads::VOLUME_BANDS[$band];
    $firstContactAt = $respondAfter === null ? null : gmdate('Y-m-d H:i:s', strtotime($createdAt) + $respondAfter * 60);
    $breached = $respondAfter !== null && $respondAfter > $slaMinutes;

    $leadId = Db::insert(
        'INSERT INTO leads (public_ref, first_name, last_name, email, phone, company, city, postal_code, country,
                            asset_class_id, team_id, owner_id, status, stage_changed_at, source, score,
                            volume_band, volume_value, horizon, experience, goal, contact_pref, contact_window,
                            message, wizard_payload, consent_contact, consent_marketing,
                            sla_due_at, first_contact_at, first_contact_by, response_seconds, sla_breached, sla_warned,
                            portal_token, portal_password_hash, created_at, updated_at)
         VALUES (:ref, :first, :last, :email, :phone, :company, :city, :plz, :country,
                 :asset, :team, :owner, :status, :created, :source, :score,
                 :band, :value, :horizon, :experience, :goal, :pref, :window,
                 :message, :payload, 1, :marketing,
                 :slaDue, :firstContact, :firstBy, :responseSeconds, :breached, :warned,
                 :token, :pwd, :createdAt, :updatedAt)',
        [
            'ref'      => Leads::newRef(),
            'first'    => $first, 'last' => $last, 'email' => $email, 'phone' => $phone,
            'company'  => $company, 'city' => $city, 'plz' => $plz, 'country' => 'DE',
            'asset'    => $assetIds[$asset], 'team' => $teamId, 'owner' => $ownerId,
            'status'   => $status, 'created' => $createdAt, 'source' => 'wizard',
            // Native Prepared Statements erlauben keinen Platzhalter zweimal –
            // dieselbe Zeit bekommt daher drei eigene Namen.
            'createdAt' => $createdAt, 'updatedAt' => $createdAt,
            'score'    => Leads::score($band, $horizon, $experience, $phone, $message),
            'band'     => $band, 'value' => $volume['value'],
            'horizon'  => $horizon, 'experience' => $experience, 'goal' => $goal,
            'pref'     => $pref, 'window' => $window, 'message' => $message,
            'payload'  => json_encode(['goal' => $goal, 'contactWindow' => $window], JSON_UNESCAPED_UNICODE),
            'marketing'=> $index % 3 === 0 ? 1 : 0,
            'slaDue'   => gmdate('Y-m-d H:i:s', strtotime($createdAt) + $slaMinutes * 60),
            'firstContact'    => $firstContactAt,
            'firstBy'         => $firstContactAt === null ? null : $ownerId,
            'responseSeconds' => $respondAfter === null ? null : $respondAfter * 60,
            'breached'        => $breached ? 1 : 0,
            'warned'          => $firstContactAt === null ? 0 : 1,
            'token'           => Leads::newPortalToken(),
            'pwd'             => $hash,
        ]
    );

    Leads::logActivity($leadId, 'lead_created', 'Anfrage über den Wizard eingegangen',
        body: 'Fachgebiet ' . $assetName[$asset] . ' · Volumen ' . $volume['label'],
        meta: ['source' => 'wizard'], occurredAt: $createdAt);

    Leads::logActivity($leadId, 'assignment', 'Automatisch zugewiesen an ' . $nameOf[$ownerId],
        body: 'Routing über Fachgebiet → Gruppe ' . $teams[array_search($teamSlug, array_column($teams, 0), true)][1],
        occurredAt: gmdate('Y-m-d H:i:s', strtotime($createdAt) + 3));

    if ($firstContactAt !== null) {
        Leads::logActivity($leadId, 'first_contact', 'Erstkontakt hergestellt', $ownerId,
            'Reaktionszeit: ' . $respondAfter . ' Min.' . ($breached ? ' – SLA überschritten' : ' – innerhalb der SLA'),
            meta: ['seconds' => $respondAfter * 60, 'breached' => $breached], occurredAt: $firstContactAt);

        $note = $callNotes[$index % count($callNotes)];
        Leads::logActivity($leadId, 'call', $note[0], $ownerId, $note[2], $note[1], 'outbound',
            180 + (($index * 137) % 900), occurredAt: gmdate('Y-m-d H:i:s', strtotime($firstContactAt) + 120));

        if (in_array($status, ['qualified', 'proposal', 'won'], true)) {
            Leads::logActivity($leadId, 'email', 'Unterlagen versendet', $ownerId,
                'Produktübersicht, Verwahrkonzept und Preisliste als PDF verschickt.', direction: 'outbound',
                occurredAt: gmdate('Y-m-d H:i:s', strtotime($firstContactAt) + 5400));

            Db::run(
                "INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at, duration_min, recurrence, visible_to_client)
                 VALUES (:lead, :owner, :owner2, 'meeting', 'Beratungstermin',
                         'Persönliches Gespräch zur Feinabstimmung des Portfolios.',
                         DATE_ADD(NOW(), INTERVAL :days DAY), 60, :recurrence, 1)",
                ['lead' => $leadId, 'owner' => $ownerId, 'owner2' => $ownerId,
                 'days' => ($index % 5) + 1, 'recurrence' => $index % 4 === 0 ? 'monthly' : 'none']
            );
        }
        if (in_array($status, ['proposal', 'won'], true)) {
            Leads::logActivity($leadId, 'meeting', 'Beratungstermin durchgeführt', $ownerId,
                'Portfolio-Struktur besprochen, Angebot angekündigt.', 'positive', durationS: 3600,
                occurredAt: gmdate('Y-m-d H:i:s', strtotime($firstContactAt) + 93600));
        }
        if ($status === 'won') {
            Leads::logActivity($leadId, 'status_change', 'Status: Gewonnen', $ownerId,
                'Zeichnung erfolgt, Abwicklung an das Backoffice übergeben.',
                occurredAt: gmdate('Y-m-d H:i:s', strtotime($firstContactAt) + 180000));
        }
        if ($status === 'lost') {
            Leads::logActivity($leadId, 'status_change', 'Status: Verloren', $ownerId,
                'Interessent hat sich für einen Wettbewerber entschieden.',
                occurredAt: gmdate('Y-m-d H:i:s', strtotime($firstContactAt) + 259200));
            Db::run('UPDATE leads SET lost_reason = :r WHERE id = :id',
                ['r' => 'Wettbewerb war schneller', 'id' => $leadId]);
        }
    } else {
        Db::run(
            "INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at, duration_min, recurrence)
             VALUES (:lead, :owner, NULL, 'call', 'Erstkontakt herstellen', 'Sofort anrufen – die Reaktionszeit läuft.',
                     :due, 15, 'none')",
            ['lead' => $leadId, 'owner' => $ownerId,
             'due' => gmdate('Y-m-d H:i:s', strtotime($createdAt) + $slaMinutes * 60)]
        );

        Db::run(
            "INSERT INTO messages (channel_id, user_id, body, kind, lead_id, created_at)
             VALUES (:channel, NULL, :body, 'lead_alert', :lead, :at)",
            ['channel' => $teamChannels[$teamSlug],
             'body' => 'Neuer Lead: ' . $first . ' ' . $last . ' · ' . $assetName[$asset] . ' · ' . $volume['label'],
             'lead' => $leadId, 'at' => $createdAt]
        );
    }
}

$counts = Db::one('SELECT (SELECT COUNT(*) FROM leads) AS leads,
                          (SELECT COUNT(*) FROM activities) AS activities,
                          (SELECT COUNT(*) FROM tasks) AS tasks');

echo "[seed] Fertig. Leads: {$counts['leads']}, Verlaufseinträge: {$counts['activities']}, Aufgaben: {$counts['tasks']}\n";
echo '[seed] Login: admin@21capitalinvest.de / ' . DEMO_PASSWORD . "\n";
