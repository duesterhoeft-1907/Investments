#!/usr/bin/env php
<?php
/**
 * Selbsttest nach dem Hochladen.
 *
 *   php bin/doctor.php
 *
 * Prüft alles, was auf einem neuen Hosting schiefgehen kann, und sagt jeweils,
 * was zu tun ist. Läuft ohne Datenbankinhalt und ohne Cron.
 */
declare(strict_types=1);

$errors = 0;
$warnings = 0;

function ok(string $m): void    { echo "  \033[32m✓\033[0m $m\n"; }
function warn(string $m): void  { global $warnings; $warnings++; echo "  \033[33m!\033[0m $m\n"; }
function fail(string $m): void  { global $errors; $errors++; echo "  \033[31m✗\033[0m $m\n"; }
function head(string $m): void  { echo "\n\033[1m$m\033[0m\n"; }

echo "\n\033[1mCapital Lead Suite – Selbsttest\033[0m\n";

head('PHP');
if (PHP_VERSION_ID >= 80200) {
    ok('PHP ' . PHP_VERSION);
} else {
    fail('PHP ' . PHP_VERSION . ' ist zu alt. Benötigt wird 8.2 oder neuer (Site Tools → Devs → PHP Manager).');
}

foreach (['pdo_mysql' => 'Datenbank', 'mbstring' => 'Umlaute', 'json' => 'API', 'fileinfo' => 'Datei-Uploads', 'openssl' => 'SMTP-Verschlüsselung'] as $ext => $why) {
    extension_loaded($ext) ? ok("Erweiterung $ext ($why)") : fail("Erweiterung $ext fehlt – wird für $why gebraucht.");
}
extension_loaded('curl') ? ok('Erweiterung curl (KI-Angebote, optional)') : warn('Erweiterung curl fehlt – der KI-Angebotsentwurf fällt auf die Vorlage zurück.');

head('Konfiguration');
if (!is_file(__DIR__ . '/../app/config.local.php')) {
    fail('app/config.local.php fehlt. Kopiere app/config.local.example.php und trage die Zugangsdaten ein.');
    echo "\n\033[31mAbbruch – ohne Konfiguration kann nichts weiter geprüft werden.\033[0m\n\n";
    exit(1);
}
ok('app/config.local.php vorhanden');

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Config;
use App\Core\Db;
use App\Core\Mailer;

$baseUrl = (string) Config::get('base_url', '');
$baseUrl !== ''
    ? ok('base_url: ' . $baseUrl)
    : warn('base_url ist leer – Links in Mails werden aus der Anfrage abgeleitet. Für den Produktivbetrieb bitte eintragen.');

head('Datenbank');
try {
    $version = Db::value('SELECT VERSION()');
    ok('Verbindung steht (' . $version . ')');

    $tables = Db::all('SHOW TABLES');
    $count = count($tables);
    if ($count === 0) {
        fail('Keine Tabellen. Einmal einspielen: php db/seed.php');
    } elseif ($count < 15) {
        warn("Nur $count Tabellen gefunden – erwartet werden 18. Schema erneut einspielen.");
    } else {
        ok("$count Tabellen vorhanden");
        $users = (int) Db::value('SELECT COUNT(*) FROM users');
        $users > 0 ? ok("$users Benutzerkonten") : warn('Keine Benutzer – php db/seed.php legt die Demo-Daten an.');

        // Spalten, die spaeter dazugekommen sind. Fehlen sie, laeuft die
        // Anwendung in Fehler, die wie Zufall aussehen – also hier nennen.
        $missing = [];
        foreach ([['users', 'away_until'], ['leads', 'sla_warn_at']] as [$table, $column]) {
            $exists = (int) Db::value(
                'SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c',
                ['t' => $table, 'c' => $column]
            );
            if ($exists === 0) {
                $missing[] = "$table.$column";
            }
        }
        $missing === []
            ? ok('Datenbankstand aktuell')
            : warn('Es fehlen Spalten (' . implode(', ', $missing) . '). Einmal nachziehen: php db/migrate.php');
    }

    // JSON-Spalten brauchen MySQL 5.7+ / MariaDB 10.2+
    Db::value("SELECT JSON_EXTRACT('{\"a\":1}', '$.a')");
    ok('JSON-Funktionen verfügbar');
} catch (Throwable $e) {
    fail('Datenbank nicht erreichbar: ' . $e->getMessage());
}

head('Schreibrechte');
foreach (['storage/uploads' => 'Sprachnotizen und Dateien', 'storage/logs' => 'Fehlerprotokoll', 'storage/sessions' => 'Anmeldungen'] as $dir => $why) {
    $path = dirname(__DIR__) . '/' . $dir;
    if (!is_dir($path)) {
        @mkdir($path, 0775, true);
    }
    is_writable($path) ? ok("$dir beschreibbar ($why)") : fail("$dir ist nicht beschreibbar – gebraucht für $why. chmod 775 setzen.");
}

head('E-Mail');
if (Mailer::isConfigured()) {
    ok('SMTP konfiguriert: ' . Config::get('smtp.host') . ':' . Config::get('smtp.port'));
    echo "    Testmail verschicken: php bin/test-mail.php deine@adresse.de\n";
} else {
    warn('Kein SMTP hinterlegt. Die Anwendung läuft, protokolliert Mails aber nur (im CRM unter „Postausgang" sichtbar).');
}

head('Reaktionszeit-Wächter');
$lastRun = Db::value("SELECT setting_value FROM settings WHERE setting_key = 'sla_last_run'");
if ($lastRun !== null && (time() - (int) $lastRun) < 300) {
    ok('Der Wächter lief vor ' . (time() - (int) $lastRun) . ' Sekunden.');
} else {
    warn('Der Wächter lief noch nicht (oder lange nicht).');
    echo "    Cron in den Site Tools eintragen (Devs → Cron Jobs), jede Minute:\n";
    echo '    ' . PHP_BINARY . ' ' . dirname(__DIR__) . "/bin/cron-sla.php\n";
    echo "    Ohne Cron greift ersatzweise eine Prüfung beim Abruf – dann aber nur,\n";
    echo "    solange jemand im CRM angemeldet ist.\n";
}

head('Verzeichnisse');
$docRootHint = dirname(__DIR__) . '/public_html';
echo "    DocumentRoot muss zeigen auf: $docRootHint\n";
if (is_file(dirname(__DIR__) . '/public_html/app/config.local.php')) {
    fail('app/ liegt im DocumentRoot! Die Konfiguration wäre öffentlich abrufbar. Bitte eine Ebene höher verschieben.');
} else {
    ok('app/ liegt außerhalb des DocumentRoot');
}

echo "\n" . str_repeat('─', 56) . "\n";
if ($errors > 0) {
    echo "\033[31m$errors Fehler\033[0m" . ($warnings ? ", \033[33m$warnings Hinweise\033[0m" : '') . " – bitte oben abarbeiten.\n\n";
    exit(1);
}
echo $warnings > 0
    ? "\033[32mAlles Wesentliche läuft\033[0m, \033[33m$warnings Hinweise\033[0m.\n\n"
    : "\033[32mAlles in Ordnung.\033[0m\n\n";
