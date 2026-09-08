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
