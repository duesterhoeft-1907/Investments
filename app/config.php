<?php
/**
 * Grundeinstellungen. Werte werden in dieser Reihenfolge überschrieben:
 *
 *   1. die Vorgaben hier
 *   2. app/config.local.php  (nicht im Repository – enthält die Zugangsdaten)
 *   3. Umgebungsvariablen    (falls das Hosting welche setzt)
 *
 * Auf SiteGround legst du config.local.php einmal an und fasst diese Datei
 * nie wieder an. Ein Muster liegt in config.local.example.php.
 */
declare(strict_types=1);

$defaults = [
    'app_name'    => '21 Capital Invest',
    'app_env'     => 'production',
    // Öffentliche Adresse ohne Schrägstrich am Ende. Wird für Links in Mails
    // und im Kundenportal verwendet.
    'base_url'    => '',

    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'name'    => '',
        'user'    => '',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],

    // Ziel bis zur ersten Kontaktaufnahme in Minuten. Pro Fachgruppe im CRM
    // übersteuerbar; dieser Wert gilt, wenn nichts gesetzt ist.
    'sla_minutes'    => 15,
    // Vorwarnung, sobald dieser Anteil der Frist verstrichen ist.
    'sla_warn_ratio' => 0.5,

    // Abstand der Abfrage nach neuen Ereignissen in Millisekunden. Auf Shared
    // Hosting ersetzt das die WebSockets.
    'poll_interval_ms' => 3000,

    'smtp' => [
        // Ohne Host werden Mails nur protokolliert und sind im CRM unter
        // "Postausgang" sichtbar – die Anwendung läuft also auch ohne Mailserver.
        'host'   => '',
        'port'   => 587,
        // '' | 'tls' (STARTTLS, Port 587) | 'ssl' (implizit, Port 465)
        'secure' => 'tls',
        'user'   => '',
        'pass'   => '',
        'from_address' => 'no-reply@example.com',
        'from_name'    => '21 Capital Invest',
    ],

    'company' => [
        'name'  => '21 Capital Invest',
        'phone' => '+49 40 000 000',
        'email' => 'service@example.com',
    ],

    'upload' => [
        'max_mb' => 25,
    ],

    // Optionaler Angebotsentwurf über die Claude API. Ohne Schlüssel greift
    // ein strukturierter Textbaustein.
    'anthropic' => [
        'api_key' => '',
        'model'   => 'claude-opus-5',
    ],

    // Höchstzahl an Wizard-Absendungen je IP und Stunde.
    'wizard_rate_limit' => 12,
];

$config = $defaults;

$localFile = __DIR__ . '/config.local.php';
if (is_file($localFile)) {
    /** @var array $local */
    $local = require $localFile;
    if (is_array($local)) {
        // Zwei Ebenen tief zusammenführen – tiefer wird es nicht.
        foreach ($local as $key => $value) {
            $config[$key] = is_array($value) && isset($config[$key]) && is_array($config[$key])
                ? array_replace($config[$key], $value)
                : $value;
        }
    }
}

// Umgebungsvariablen haben das letzte Wort (praktisch für lokale Tests).
$env = static fn (string $name): ?string => (getenv($name) !== false && getenv($name) !== '') ? getenv($name) : null;

foreach ([
    'APP_ENV'       => ['app_env'],
    'BASE_URL'      => ['base_url'],
    'DB_HOST'       => ['db', 'host'],
    'DB_NAME'       => ['db', 'name'],
    'DB_USER'       => ['db', 'user'],
    'DB_PASS'       => ['db', 'pass'],
    'SMTP_HOST'     => ['smtp', 'host'],
    'SMTP_USER'     => ['smtp', 'user'],
    'SMTP_PASS'     => ['smtp', 'pass'],
    'MAIL_FROM'     => ['smtp', 'from_address'],
    'ANTHROPIC_API_KEY' => ['anthropic', 'api_key'],
] as $var => $path) {
    $value = $env($var);
    if ($value === null) {
        continue;
    }
    if (count($path) === 1) {
        $config[$path[0]] = $value;
    } else {
        $config[$path[0]][$path[1]] = $value;
    }
}

if ($env('DB_PORT') !== null)     { $config['db']['port'] = (int) $env('DB_PORT'); }
if ($env('SMTP_PORT') !== null)   { $config['smtp']['port'] = (int) $env('SMTP_PORT'); }
if ($env('SLA_MINUTES') !== null) { $config['sla_minutes'] = (int) $env('SLA_MINUTES'); }

return $config;
