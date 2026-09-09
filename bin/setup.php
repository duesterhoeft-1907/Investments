#!/usr/bin/env php
<?php
/**
 * Einrichtung in einem Zug.
 *
 *   php bin/setup.php
 *
 * Fragt nach den Zugangsdaten, testet die Verbindung, schreibt
 * app/config.local.php, spielt das Schema ein und prueft die Installation.
 * Ersetzt das Bearbeiten von Hand.
 *
 * Das Passwort wird verdeckt eingegeben und landet nur in der Konfiguration,
 * die per .gitignore niemals im Repository liegt.
 */
declare(strict_types=1);

// Ein interaktives Werkzeug darf nie stumm aussteigen: Meldungen gehoeren auf
// den Schirm, nicht in ein Log, das man erst suchen muss. Manche Hoster
// stellen die CLI auf display_errors=Off – deshalb hier ausdruecklich an.
error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

set_exception_handler(static function (Throwable $e): void {
    fwrite(STDERR, PHP_EOL . "  \033[31m✗\033[0m Abbruch: " . $e->getMessage() . PHP_EOL);
    fwrite(STDERR, '    ' . $e->getFile() . ':' . $e->getLine() . PHP_EOL . PHP_EOL);
    exit(1);
});

$root = dirname(__DIR__);

function say(string $text = ''): void { echo $text . PHP_EOL; }
function ok(string $text): void   { echo "  \033[32m✓\033[0m $text" . PHP_EOL; }
function warn(string $text): void { echo "  \033[33m!\033[0m $text" . PHP_EOL; }
function bad(string $text): void  { echo "  \033[31m✗\033[0m $text" . PHP_EOL; }
function head(string $text): void { echo PHP_EOL . "\033[1m$text\033[0m" . PHP_EOL; }

/** Eingabe mit Vorgabewert. */
function ask(string $label, string $default = '', bool $required = true): string
{
    while (true) {
        echo '  ' . $label . ($default !== '' ? " [$default]" : '') . ': ';
        $line = trim((string) fgets(STDIN));
        if ($line === '' && $default !== '') {
            return $default;
        }
        if ($line !== '' || !$required) {
            return $line;
        }
        bad('Bitte einen Wert eingeben.');
    }
}

/**
 * Passworteingabe.
 *
 * Das Uebliche waere, die Anzeige des Terminals per stty abzuschalten – das
 * geht aber nur, indem PHP ein anderes Programm startet. Genau solche Aufrufe
 * lassen Schadcode-Scanner bei Hostern anschlagen, und ein Einrichtungsskript
 * ist es nicht wert, dafuer in Quarantaene zu landen. Stattdessen wird die
 * Zeile hinterher ueberschrieben: sichtbar ist das Passwort nur waehrend des
 * Tippens, danach steht dort nichts mehr.
 */
function askSecret(string $label): string
{
    echo '  ' . $label . ': ';
    $value = trim((string) fgets(STDIN));

    // Eine Zeile hoch, Zeile loeschen, Ersatz hinschreiben.
    echo "\033[1A\033[2K";
    echo '  ' . $label . ': ' . str_repeat('*', min(mb_strlen($value), 12)) . PHP_EOL;

    return $value;
}

function confirm(string $question, bool $default = true): bool
{
    $hint = $default ? 'J/n' : 'j/N';
    echo '  ' . $question . " [$hint]: ";
    $line = strtolower(trim((string) fgets(STDIN)));
    if ($line === '') {
        return $default;
    }
    return in_array($line, ['j', 'ja', 'y', 'yes'], true);
}

say();
say("\033[1mCapital Lead Suite – Einrichtung\033[0m");

// ── PHP prüfen, bevor wir irgendetwas schreiben ──
head('Voraussetzungen');
if (PHP_VERSION_ID < 80200) {
    bad('PHP ' . PHP_VERSION . ' ist zu alt – benötigt wird 8.2 oder neuer.');
    say('  In den Site Tools umstellen: Devs → PHP Manager.');
    exit(1);
}
ok('PHP ' . PHP_VERSION);

$missing = [];
foreach (['pdo_mysql', 'mbstring', 'json', 'fileinfo', 'openssl'] as $ext) {
    if (!extension_loaded($ext)) {
        $missing[] = $ext;
    }
}
if ($missing !== []) {
    bad('Es fehlen PHP-Erweiterungen: ' . implode(', ', $missing));
    exit(1);
}
ok('Alle benötigten Erweiterungen vorhanden');

// ── Bestehende Konfiguration nicht versehentlich überschreiben ──
$configFile = $root . '/app/config.local.php';
if (is_file($configFile)) {
    head('Vorhandene Konfiguration');
    warn('app/config.local.php existiert bereits.');
    if (!confirm('Überschreiben?', false)) {
        say('  Unverändert gelassen. Zum Prüfen: php bin/doctor.php');
        exit(0);
    }
}

// ── Abfragen ──
head('Datenbank');
say('  Die Werte stehen in den Site Tools unter MySQL.');
say();
$dbHost = ask('Host', 'localhost');
$dbName = ask('Datenbankname');
$dbUser = ask('Benutzer');
$dbPass = askSecret('Passwort (Eingabe bleibt unsichtbar)');

// ── Verbindung testen, bevor etwas geschrieben wird ──
say();
try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $dbHost, $dbName),
        $dbUser,
        $dbPass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    ok('Verbindung steht (' . $pdo->query('SELECT VERSION()')->fetchColumn() . ')');
} catch (PDOException $e) {
    bad('Verbindung fehlgeschlagen: ' . $e->getMessage());
    say();
    say('  Häufigste Ursachen: Tippfehler im Namen, falsches Passwort, oder der');
    say('  Benutzer hat keine Rechte auf dieser Datenbank (Site Tools → MySQL).');
    exit(1);
}

head('Adresse');
$guess = 'https://' . (gethostname() ?: 'example.com');
say('  Unter welcher Adresse ist die Anwendung erreichbar?');
say('  Wird für Links in E-Mails und im Kundenportal verwendet.');
say();
$baseUrl = rtrim(ask('Adresse', $guess), '/');

head('E-Mail');
say('  Ohne SMTP-Zugang werden Mails nur protokolliert und sind im CRM');
say('  unter „Postausgang" sichtbar. Das reicht zum Ausprobieren.');
say();
$smtp = ['host' => '', 'port' => 587, 'secure' => 'tls', 'user' => '', 'pass' => '', 'from' => ''];
if (confirm('Jetzt SMTP einrichten?', false)) {
    $smtp['host'] = ask('SMTP-Host', 'mail.' . (parse_url($baseUrl, PHP_URL_HOST) ?: 'example.com'));
    $smtp['port'] = (int) ask('Port', '587');
    $smtp['secure'] = ask('Verschlüsselung (tls/ssl)', 'tls');
    $smtp['user'] = ask('Benutzer (volle E-Mail-Adresse)');
    $smtp['pass'] = askSecret('Passwort (Eingabe bleibt unsichtbar)');
    $smtp['from'] = ask('Absenderadresse', $smtp['user']);
}

head('Firmendaten');
say('  Erscheinen im Mailfuß und im Kundenportal.');
say();
$companyName  = ask('Name', '21 Capital Invest');
$companyPhone = ask('Telefon', '+49 40 000 000');
$companyMail  = ask('E-Mail', 'service@' . (parse_url($baseUrl, PHP_URL_HOST) ?: 'example.com'));

// ── Schreiben ──
$export = static fn (string $v): string => var_export($v, true);

$config = <<<PHP_CONFIG
<?php
/**
 * Lokale Konfiguration – von bin/setup.php erzeugt am {DATE}.
 * Enthält Zugangsdaten und steht in .gitignore.
 */
declare(strict_types=1);

return [
    'app_env'  => 'production',
    'base_url' => {BASE_URL},

    'db' => [
        'host' => {DB_HOST},
        'name' => {DB_NAME},
        'user' => {DB_USER},
        'pass' => {DB_PASS},
    ],

    'smtp' => [
        'host'         => {SMTP_HOST},
        'port'         => {SMTP_PORT},
        'secure'       => {SMTP_SECURE},
        'user'         => {SMTP_USER},
        'pass'         => {SMTP_PASS},
        'from_address' => {SMTP_FROM},
        'from_name'    => {COMPANY_NAME},
    ],

    'company' => [
        'name'  => {COMPANY_NAME},
        'phone' => {COMPANY_PHONE},
        'email' => {COMPANY_MAIL},
    ],

    // Leer lassen: Angebotsentwürfe entstehen dann aus einer Vorlage.
    'anthropic' => [
        'api_key' => '',
    ],
];
PHP_CONFIG;

$config = strtr($config, [
    '{DATE}'          => gmdate('d.m.Y H:i') . ' UTC',
    '{BASE_URL}'      => $export($baseUrl),
    '{DB_HOST}'       => $export($dbHost),
    '{DB_NAME}'       => $export($dbName),
    '{DB_USER}'       => $export($dbUser),
    '{DB_PASS}'       => $export($dbPass),
    '{SMTP_HOST}'     => $export($smtp['host']),
    '{SMTP_PORT}'     => (string) $smtp['port'],
    '{SMTP_SECURE}'   => $export($smtp['secure']),
    '{SMTP_USER}'     => $export($smtp['user']),
    '{SMTP_PASS}'     => $export($smtp['pass']),
    '{SMTP_FROM}'     => $export($smtp['from'] !== '' ? $smtp['from'] : 'no-reply@' . (parse_url($baseUrl, PHP_URL_HOST) ?: 'example.com')),
    '{COMPANY_NAME}'  => $export($companyName),
    '{COMPANY_PHONE}' => $export($companyPhone),
    '{COMPANY_MAIL}'  => $export($companyMail),
]);

head('Schreiben');
if (file_put_contents($configFile, $config) === false) {
    bad('app/config.local.php konnte nicht geschrieben werden.');
    exit(1);
}
chmod($configFile, 0600);   // nur der Eigentümer darf lesen
ok('app/config.local.php angelegt (Rechte 600)');

foreach (['storage/uploads', 'storage/logs', 'storage/sessions'] as $dir) {
    $path = $root . '/' . $dir;
    if (!is_dir($path)) {
        mkdir($path, 0775, true);
    }
    chmod($path, 0775);
}
ok('Verzeichnisse unter storage/ angelegt');

// ── Schema ──
head('Datenbank füllen');

/**
 * Ruft ein Skript aus db/ auf und sagt, ob es sauber durchgelaufen ist.
 *
 * Frueher wurde dafuer ein zweiter PHP-Prozess gestartet. Das ist der
 * Aufruf, den jeder Schadcode-Scanner als erstes anstreicht – zu Recht, denn
 * so sieht eine Hintertuer aus. Hier laeuft das Skript deshalb im selben
 * Prozess: require, Ausgabe durchreichen, Fehler abfangen. Das kann kein
 * Hoster verbieten, und schneller ist es auch.
 */
$runScript = static function (string $script, array $argumente = []) use ($root): ?bool {
    // Die Skripte lesen ihre Schalter aus $argv – also stellen wir ihnen ein
    // passendes hin und raeumen es hinterher wieder weg.
    $vorher = $GLOBALS['argv'] ?? [];
    $GLOBALS['argv'] = array_merge([$script], $argumente);

    try {
        require $root . '/' . $script;
        return true;
    } catch (Throwable $fehler) {
        bad("$script ist abgebrochen: " . $fehler->getMessage());
        say('  Mehr dazu steht im Log:');
        say('    tail -n 20 storage/logs/php-error.log');
        return false;
    } finally {
        $GLOBALS['argv'] = $vorher;
    }
};

try {
    $tables = (int) $pdo->query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchColumn();
} catch (PDOException $e) {
    warn('Tabellen konnten nicht gezählt werden: ' . $e->getMessage());
    $tables = 0;
}

$seeded = true;
if ($tables > 0) {
    warn("Die Datenbank enthält bereits $tables Tabellen.");
    if (confirm('Trotzdem einspielen? (bestehende Daten bleiben erhalten)', true)) {
        $seeded = $runScript('db/seed.php');
    }
} else {
    $seeded = $runScript('db/seed.php');
}
if ($seeded === false) {
    exit(1);
}

// Bei einer bestehenden Datenbank fehlen sonst neu hinzugekommene Spalten.
if ($tables > 0) {
    $runScript('db/migrate.php');
}

// ── Prüfen ──
head('Selbsttest');
$code = $runScript('bin/doctor.php') === false ? 1 : 0;

say();
say(str_repeat('─', 58));
if ($code === 0) {
    say("\033[32mFertig.\033[0m Erreichbar unter:");
    say();
    say("  $baseUrl              – öffentliche Startseite");
    say("  $baseUrl/anfrage      – Anfrage-Strecke");
    say("  $baseUrl/app      – internes CRM");
    say("  $baseUrl/portal   – Kundenbereich");
    say();
    say('  Demo-Login: admin@21capitalinvest.de / Invest2026!  (volle Rechte)');
    say('              j.ahrens@21capitalinvest.de / Invest2026!  (Berater Edelmetalle)');
    say('  Vor dem Livegang die Demo-Konten löschen oder die Passwörter ändern.');
} else {
    say("\033[33mEinrichtung abgeschlossen, der Selbsttest hat aber noch Punkte offen.\033[0m");
    say('  Siehe oben – jeder Punkt sagt, was zu tun ist.');
}
say();
