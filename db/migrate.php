<?php
/**
 * Bringt eine bestehende Datenbank auf den aktuellen Stand.
 *
 *   php db/migrate.php          anwenden
 *   php db/migrate.php --dry    nur zeigen, was zu tun waere
 *
 * schema.sql legt nur an, was fehlt (CREATE TABLE IF NOT EXISTS). Neue
 * Spalten in bestehenden Tabellen erreicht es nie – dafuer ist diese Datei da.
 * Jeder Schritt prueft selbst, ob er noetig ist, und darf beliebig oft
 * laufen. Nichts hier loescht Daten.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Db;

$dry = in_array('--dry', $argv, true);

/** Existiert die Spalte bereits? */
function hasColumn(string $table, string $column): bool
{
    return Db::value(
        'SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c',
        ['t' => $table, 'c' => $column]
    ) > 0;
}

/** Existiert die Tabelle bereits? */
function hasTable(string $table): bool
{
    return Db::value(
        'SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = :t',
        ['t' => $table]
    ) > 0;
}

/** Existiert der Index bereits? */
function hasIndex(string $table, string $index): bool
{
    return Db::value(
        'SELECT COUNT(*) FROM information_schema.statistics
          WHERE table_schema = DATABASE() AND table_name = :t AND index_name = :i',
        ['t' => $table, 'i' => $index]
    ) > 0;
}

/**
 * Die Schritte in der Reihenfolge ihrer Entstehung.
 * check() sagt, ob noch etwas zu tun ist; sql() macht es.
 *
 * sql darf auch eine Funktion sein, die die Anweisungen erst beim Anwenden
 * baut – dann fragt der Schritt die Datenbank nicht schon beim Einlesen.
 *
 * @var list<array{name:string, check:callable():bool, sql:list<string>|callable():list<string>}> $steps
 */
$steps = [
    [
        'name'  => 'Abwesenheit je Mitarbeiter',
        'check' => static fn (): bool => !hasColumn('users', 'away_until'),
        'sql'   => [
            "ALTER TABLE users
               ADD COLUMN away_until DATETIME NULL AFTER is_active,
               ADD COLUMN away_note  VARCHAR(160) NOT NULL DEFAULT '' AFTER away_until",
        ],
    ],
    [
        'name'  => 'Vorwarnzeitpunkt am Lead',
        'check' => static fn (): bool => !hasColumn('leads', 'sla_warn_at'),
        'sql'   => [
            'ALTER TABLE leads ADD COLUMN sla_warn_at DATETIME NULL AFTER sla_due_at',
        ],
    ],
    [
        'name'  => 'Index auf den Vorwarnzeitpunkt',
        'check' => static fn (): bool => !hasIndex('leads', 'idx_leads_sla_warn'),
        'sql'   => [
            'CREATE INDEX idx_leads_sla_warn ON leads (sla_warn_at)',
        ],
    ],
    [
        'name'  => 'Farben auf das Erscheinungsbild der Marke umstellen',
        // Die Akzentfarben stehen als Daten in der Datenbank, nicht im CSS:
        // Gruppen und Personen tragen ihre eigene. Ohne diesen Schritt bliebe
        // eine bestehende Installation golden, während alles ringsum türkis
        // ist – die Umstellung wäre halb sichtbar und sähe nach Fehler aus.
        'check' => static fn (): bool => (int) Db::value(
            "SELECT (SELECT COUNT(*) FROM teams WHERE color IN ('#C8A24A','#E0B86A','#D8A657','#C99A3F','#7FA8B8','#6E97A8','#A88BC4','#9478B4'))
                  + (SELECT COUNT(*) FROM users WHERE accent IN ('#C8A24A','#E0B86A','#D8A657','#C99A3F','#7FA8B8','#6E97A8','#A88BC4','#9478B4'))"
        ) > 0,
        'sql'   => [
            "UPDATE teams SET color = CASE color
                 WHEN '#C8A24A' THEN '#21B4A6' WHEN '#E0B86A' THEN '#21DDD3'
                 WHEN '#D8A657' THEN '#0FAF9F' WHEN '#C99A3F' THEN '#0B8479'
                 WHEN '#7FA8B8' THEN '#7F9FB8' WHEN '#6E97A8' THEN '#5F86A3'
                 WHEN '#A88BC4' THEN '#9B8BC4' WHEN '#9478B4' THEN '#8271AF'
                 ELSE color END",
            "UPDATE users SET accent = CASE accent
                 WHEN '#C8A24A' THEN '#21B4A6' WHEN '#E0B86A' THEN '#21DDD3'
                 WHEN '#D8A657' THEN '#0FAF9F' WHEN '#C99A3F' THEN '#0B8479'
                 WHEN '#7FA8B8' THEN '#7F9FB8' WHEN '#6E97A8' THEN '#5F86A3'
                 WHEN '#A88BC4' THEN '#9B8BC4' WHEN '#9478B4' THEN '#8271AF'
                 ELSE accent END",
            "ALTER TABLE teams ALTER COLUMN color SET DEFAULT '#21B4A6'",
            "ALTER TABLE users ALTER COLUMN accent SET DEFAULT '#21B4A6'",
        ],
    ],
    [
        // Englische Fassung der Fachgebiete und Gruppen.
        //
        // Die Bezeichnungen stehen in der Datenbank und nicht im Quelltext –
        // sie sind gepflegte Stammdaten. Ohne eigene Spalten stuende auf der
        // englischen Anfragestrecke mitten in englischen Saetzen "Sachwerte
        // & Immobilien". Leer heisst: nimm den deutschen Text.
        'name'  => 'Englische Bezeichnungen für Fachgebiete und Gruppen',
        'check' => static fn (): bool => !hasColumn('asset_classes', 'name_en'),
        'sql'   => [
            "ALTER TABLE asset_classes
               ADD COLUMN name_en        VARCHAR(120)  NOT NULL DEFAULT '' AFTER name,
               ADD COLUMN tagline_en     VARCHAR(200)  NOT NULL DEFAULT '' AFTER tagline,
               ADD COLUMN description_en VARCHAR(400)  NOT NULL DEFAULT '' AFTER description",
            "ALTER TABLE teams
               ADD COLUMN name_en VARCHAR(120) NOT NULL DEFAULT '' AFTER name",
        ],
    ],
    [
        // Die Uebersetzungen der ausgelieferten Stammdaten.
        //
        // Nur dort, wo noch nichts steht: wer eine Bezeichnung im Backend
        // selbst angepasst hat, behaelt sie.
        'name'  => 'Übersetzungen der ausgelieferten Fachgebiete eintragen',
        // Nur die ausgelieferten Fachgebiete zaehlen. Ohne diese Einschraenkung
        // bliebe der Schritt fuer immer offen, sobald jemand ein eigenes
        // Fachgebiet ohne Uebersetzung anlegt – und meldete bei jedem Lauf
        // eine Aenderung, die gar keine ist.
        'check' => static fn (): bool => hasColumn('asset_classes', 'name_en')
            && (int) Db::value(
                "SELECT COUNT(*) FROM asset_classes
                  WHERE name_en = '' AND slug IN ('gold','silber','platin-palladium','immobilien',
                        'diamanten','sammlerwerte','private-equity','fonds-anleihen','digital-assets')"
            ) > 0,
        'sql'   => static function (): array {
            $fachgebiete = [
                'gold'             => ['Gold', 'The classic store of value', 'Bars and coins, physically delivered or held in a bonded warehouse.'],
                'silber'           => ['Silver', 'An industrial metal with leverage', 'Silver as an admixture with high volatility and industrial demand.'],
                'platin-palladium' => ['Platinum & palladium', 'Scarce industrial metals', 'Narrow markets, strong price dynamics, a strategic admixture.'],
                'immobilien'       => ['Real estate', 'Substance with a running yield', 'Residential and commercial property, directly or through holdings.'],
                'diamanten'        => ['Diamonds & coloured gemstones', 'Value in the smallest of spaces', 'Certified investment stones that trade internationally.'],
                'sammlerwerte'     => ['Collectibles & art', 'Passion with a return', 'Art, classic cars and collector coins as a portfolio admixture.'],
                'private-equity'   => ['Private equity', 'Investing entrepreneurially', 'Direct holdings and funds away from the stock exchange.'],
                'fonds-anleihen'   => ['Funds & bonds', 'Broadly spread and plannable', 'Curated fund and bond portfolios by risk profile.'],
                'digital-assets'   => ['Digital assets', 'Regulated entry into the new asset class', 'Custodied crypto investments through regulated partners.'],
            ];
            $gruppen = [
                'edelmetalle'  => 'Precious Metals',
                'sachwerte'    => 'Tangible Assets & Real Estate',
                'kapitalmarkt' => 'Capital Markets & Holdings',
            ];

            $sql = [];
            foreach ($fachgebiete as $slug => [$name, $tagline, $description]) {
                $sql[] = sprintf(
                    "UPDATE asset_classes SET name_en = %s, tagline_en = %s, description_en = %s
                      WHERE slug = %s AND name_en = ''",
                    Db::pdo()->quote($name),
                    Db::pdo()->quote($tagline),
                    Db::pdo()->quote($description),
                    Db::pdo()->quote($slug)
                );
            }
            foreach ($gruppen as $slug => $name) {
                $sql[] = sprintf(
                    "UPDATE teams SET name_en = %s WHERE slug = %s AND name_en = ''",
                    Db::pdo()->quote($name),
                    Db::pdo()->quote($slug)
                );
            }
            return $sql;
        },
    ],
    [
        // Die Sprache, in der die Anfrage gestellt wurde.
        //
        // Ohne sie bekaeme jemand, der die englische Strecke ausgefuellt
        // hat, eine deutsche Bestaetigungsmail – und im CRM wuesste
        // niemand, in welcher Sprache zurueckzurufen ist.
        'name'  => 'Sprache am Lead',
        'check' => static fn (): bool => !hasColumn('leads', 'lang'),
        'sql'   => [
            "ALTER TABLE leads ADD COLUMN lang CHAR(2) NOT NULL DEFAULT 'de' AFTER country",
        ],
    ],
    [
        // Kunden als eigene Groesse.
        //
        // Bisher war jede Anfrage ein Fremder: wer sich zum dritten Mal
        // meldete, wurde dreimal neu erfasst, bekam drei Portalzugaenge –
        // und im Portal funktionierte nur der neueste, weil die Anmeldung
        // die juengste Anfrage zur Adresse nahm. Die anderen beiden waren
        // fuer den Kunden verschwunden.
        'name'  => 'Kundentabelle anlegen',
        'check' => static fn (): bool => (int) Db::value(
            "SELECT COUNT(*) FROM information_schema.tables
              WHERE table_schema = DATABASE() AND table_name = 'customers'"
        ) === 0,
        'sql'   => [
            "CREATE TABLE customers (
               id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
               email                VARCHAR(190) NOT NULL,
               first_name           VARCHAR(80)  NOT NULL DEFAULT '',
               last_name            VARCHAR(80)  NOT NULL DEFAULT '',
               phone                VARCHAR(60)  NOT NULL DEFAULT '',
               company              VARCHAR(160) NOT NULL DEFAULT '',
               city                 VARCHAR(120) NOT NULL DEFAULT '',
               postal_code          VARCHAR(20)  NOT NULL DEFAULT '',
               country              VARCHAR(4)   NOT NULL DEFAULT 'DE',
               lang                 CHAR(2)      NOT NULL DEFAULT 'de',
               portal_password_hash VARCHAR(255) NULL,
               portal_last_login    DATETIME     NULL,
               note                 VARCHAR(1000) NOT NULL DEFAULT '',
               created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
               updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
               PRIMARY KEY (id),
               UNIQUE KEY uq_customers_email (email)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ],
    ],
    [
        'name'  => 'Anfragen mit dem Kunden verbinden',
        'check' => static fn (): bool => !hasColumn('leads', 'customer_id'),
        'sql'   => [
            'ALTER TABLE leads ADD COLUMN customer_id INT UNSIGNED NULL AFTER public_ref',
            'ALTER TABLE leads ADD KEY idx_leads_customer (customer_id)',
            'ALTER TABLE leads ADD CONSTRAINT fk_lead_customer
               FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL',
        ],
    ],
    [
        // Bestand nachziehen: aus den vorhandenen Anfragen die Kunden
        // bilden. Gruppiert wird ueber die kleingeschriebene E-Mail; die
        // Stammdaten kommen aus der juengsten Anfrage, denn die ist die
        // aktuellste. Das Portalpasswort ebenso – es ist das einzige, das
        // der Kunde ueberhaupt kennt.
        'name'  => 'Bestehende Anfragen Kunden zuordnen',
        'check' => static fn (): bool => hasColumn('leads', 'customer_id')
            && (int) Db::value('SELECT COUNT(*) FROM leads WHERE customer_id IS NULL') > 0,
        'sql'   => [
            "INSERT INTO customers (email, first_name, last_name, phone, company, city, postal_code,
                                    country, lang, portal_password_hash, portal_last_login, created_at)
             SELECT LOWER(TRIM(l.email)),
                    SUBSTRING_INDEX(GROUP_CONCAT(l.first_name ORDER BY l.id DESC SEPARATOR 0x1f), 0x1f, 1),
                    SUBSTRING_INDEX(GROUP_CONCAT(l.last_name  ORDER BY l.id DESC SEPARATOR 0x1f), 0x1f, 1),
                    SUBSTRING_INDEX(GROUP_CONCAT(l.phone      ORDER BY l.id DESC SEPARATOR 0x1f), 0x1f, 1),
                    SUBSTRING_INDEX(GROUP_CONCAT(l.company    ORDER BY l.id DESC SEPARATOR 0x1f), 0x1f, 1),
                    SUBSTRING_INDEX(GROUP_CONCAT(l.city       ORDER BY l.id DESC SEPARATOR 0x1f), 0x1f, 1),
                    SUBSTRING_INDEX(GROUP_CONCAT(l.postal_code ORDER BY l.id DESC SEPARATOR 0x1f), 0x1f, 1),
                    SUBSTRING_INDEX(GROUP_CONCAT(l.country    ORDER BY l.id DESC SEPARATOR 0x1f), 0x1f, 1),
                    SUBSTRING_INDEX(GROUP_CONCAT(l.lang       ORDER BY l.id DESC SEPARATOR 0x1f), 0x1f, 1),
                    SUBSTRING_INDEX(GROUP_CONCAT(l.portal_password_hash ORDER BY l.id DESC SEPARATOR 0x1f), 0x1f, 1),
                    MAX(l.portal_last_login),
                    MIN(l.created_at)
               FROM leads l
              WHERE l.customer_id IS NULL AND l.email <> ''
              GROUP BY LOWER(TRIM(l.email))
             ON DUPLICATE KEY UPDATE customers.id = customers.id",
            "UPDATE leads l
               JOIN customers c ON c.email = LOWER(TRIM(l.email))
                SET l.customer_id = c.id
              WHERE l.customer_id IS NULL",
        ],
    ],
    [
        // Zweitadressen.
        //
        // Wer unter zwei Adressen schreibt, wurde zweimal gezaehlt. Beim
        // Zusammenfuehren muessen beide Adressen erhalten bleiben – sonst
        // legt die naechste Anfrage von der aufgeloesten Adresse prompt
        // wieder einen neuen Kunden an, und die Arbeit war umsonst.
        'name'  => 'Tabelle für weitere E-Mail-Adressen',
        'check' => static fn (): bool => (int) Db::value(
            "SELECT COUNT(*) FROM information_schema.tables
              WHERE table_schema = DATABASE() AND table_name = 'customer_emails'"
        ) === 0,
        'sql'   => [
            "CREATE TABLE customer_emails (
               id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
               customer_id INT UNSIGNED NOT NULL,
               email       VARCHAR(190) NOT NULL,
               is_primary  TINYINT(1)   NOT NULL DEFAULT 0,
               created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
               PRIMARY KEY (id),
               UNIQUE KEY uq_customer_email (email),
               KEY idx_customer_email_owner (customer_id),
               CONSTRAINT fk_customer_email FOREIGN KEY (customer_id)
                 REFERENCES customers(id) ON DELETE CASCADE
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ],
    ],
    [
        'name'  => 'Bekannte Adressen eintragen',
        'check' => static fn (): bool => (int) Db::value(
            "SELECT COUNT(*) FROM information_schema.tables
              WHERE table_schema = DATABASE() AND table_name = 'customer_emails'"
        ) > 0 && (int) Db::value(
            'SELECT COUNT(*) FROM customers c
              WHERE NOT EXISTS (SELECT 1 FROM customer_emails e WHERE e.customer_id = c.id)'
        ) > 0,
        'sql'   => [
            'INSERT IGNORE INTO customer_emails (customer_id, email, is_primary, created_at)
             SELECT c.id, c.email, 1, c.created_at FROM customers c',
        ],
    ],
    [
        // Profilbild je Mitarbeiter.
        //
        // Der Interessent sieht im Kundenbereich und in der Bestaetigung,
        // wer sich meldet. Ein Gesicht dazu ist der Unterschied zwischen
        // "jemand aus dem Vertrieb" und "Nadja Weber".
        'name'  => 'Profilbild am Mitarbeiter',
        'check' => static fn (): bool => !hasColumn('users', 'avatar_file'),
        'sql'   => [
            "ALTER TABLE users ADD COLUMN avatar_file VARCHAR(80) NOT NULL DEFAULT '' AFTER accent",
        ],
    ],
    [
        // Push-Anmeldungen je Geraet.
        //
        // Ein Mensch hat Telefon, Rechner und vielleicht ein Tablet. Jedes
        // meldet sich einzeln an und bekommt einzeln zugestellt; faellt eines
        // dauerhaft aus (Browser geloescht, Anmeldung zurueckgezogen), wird
        // genau diese Zeile entfernt und nicht der ganze Mensch.
        'name'  => 'Push-Anmeldungen',
        'check' => static fn (): bool => !hasTable('push_subscriptions'),
        'sql'   => [
            "CREATE TABLE push_subscriptions (
               id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
               user_id     INT UNSIGNED NOT NULL,
               endpoint    VARCHAR(500) NOT NULL,
               p256dh      VARCHAR(200) NOT NULL DEFAULT '',
               auth_key    VARCHAR(100) NOT NULL DEFAULT '',
               user_agent  VARCHAR(190) NOT NULL DEFAULT '',
               fehler      TINYINT UNSIGNED NOT NULL DEFAULT 0,
               last_ok_at  DATETIME NULL,
               created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
               PRIMARY KEY (id),
               UNIQUE KEY uq_push_endpoint (endpoint(191)),
               KEY idx_push_user (user_id),
               CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ],
    ],
    [
        // Telegram je Mitarbeiter.
        //
        // Gespeichert wird die Chat-Kennung, die der Bot beim ersten /start
        // meldet. Ohne sie geht nichts hinaus – niemand wird ungefragt
        // angeschrieben.
        'name'  => 'Telegram-Kennung am Mitarbeiter',
        'check' => static fn (): bool => !hasColumn('users', 'telegram_chat_id'),
        'sql'   => [
            "ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(32) NOT NULL DEFAULT '' AFTER phone",
        ],
    ],
    [
        // Nachrichten bearbeiten und zuruecknehmen.
        //
        // Geloescht wird nicht wirklich: die Zeile bleibt, der Text
        // verschwindet. Sonst reisst eine Antwort im Verlauf ins Leere.
        'name'  => 'Bearbeitet und zurueckgenommen an Nachrichten',
        'check' => static fn (): bool => !hasColumn('messages', 'edited_at'),
        'sql'   => [
            'ALTER TABLE messages ADD COLUMN edited_at DATETIME NULL AFTER meta',
            'ALTER TABLE messages ADD COLUMN deleted_at DATETIME NULL AFTER edited_at',
        ],
    ],
    [
        // Reaktionen.
        //
        // Ein Daumen spart eine Nachricht "ok, mach ich" – und im Kanal
        // dreissig Zeilen am Tag.
        'name'  => 'Reaktionen auf Nachrichten',
        'check' => static fn (): bool => !hasTable('message_reactions'),
        'sql'   => [
            "CREATE TABLE message_reactions (
               message_id INT UNSIGNED NOT NULL,
               user_id    INT UNSIGNED NOT NULL,
               emoji      VARCHAR(16) NOT NULL,
               created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
               PRIMARY KEY (message_id, user_id, emoji),
               KEY idx_reaction_message (message_id),
               CONSTRAINT fk_reaction_msg FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
               CONSTRAINT fk_reaction_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ],
    ],
];

$done = 0;
foreach ($steps as $step) {
    if (!$step['check']()) {
        echo "[migrate] übersprungen: {$step['name']}\n";
        continue;
    }
    if ($dry) {
        echo "[migrate] offen: {$step['name']}\n";
        continue;
    }
    $anweisungen = is_callable($step['sql']) ? ($step['sql'])() : $step['sql'];
    foreach ($anweisungen as $sql) {
        Db::pdo()->exec($sql);
    }
    echo "[migrate] angewendet: {$step['name']}\n";
    $done++;
}

echo $dry
    ? "[migrate] Probelauf – nichts geändert.\n"
    : "[migrate] Fertig. $done Schritt(e) angewendet.\n";
