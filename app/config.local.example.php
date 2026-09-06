<?php
/**
 * Muster für app/config.local.php.
 *
 * Kopieren, umbenennen, ausfüllen:
 *     cp app/config.local.example.php app/config.local.php
 *
 * Diese Datei enthält Zugangsdaten und gehört nicht ins Repository –
 * .gitignore hält sie bereits draußen.
 */
declare(strict_types=1);

return [
    'app_env'  => 'production',
    'base_url' => 'https://leads.deine-domain.de',

    'db' => [
        'host' => 'localhost',
        'name' => 'dbname_leads',
        'user' => 'dbuser_leads',
        'pass' => 'HIER_DAS_DB_PASSWORT',
    ],

    // SiteGround-Postfach als Absender
    'smtp' => [
        'host'         => 'mail.deine-domain.de',
        'port'         => 587,
        'secure'       => 'tls',
        'user'         => 'no-reply@deine-domain.de',
        'pass'         => 'HIER_DAS_MAIL_PASSWORT',
        'from_address' => 'no-reply@deine-domain.de',
        'from_name'    => '21 Capital Invest',
    ],

    'company' => [
        'name'  => '21 Capital Invest',
        'phone' => '+49 40 000 000',
        'email' => 'service@deine-domain.de',
    ],

    // Leer lassen, dann erzeugt die Anwendung Angebotsentwürfe aus einer Vorlage.
    'anthropic' => [
        'api_key' => '',
    ],
];
