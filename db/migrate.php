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
 * @var list<array{name:string, check:callable():bool, sql:list<string>}> $steps
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
    foreach ($step['sql'] as $sql) {
        Db::pdo()->exec($sql);
    }
    echo "[migrate] angewendet: {$step['name']}\n";
    $done++;
}

echo $dry
    ? "[migrate] Probelauf – nichts geändert.\n"
    : "[migrate] Fertig. $done Schritt(e) angewendet.\n";
