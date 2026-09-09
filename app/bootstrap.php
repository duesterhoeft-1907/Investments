<?php
/**
 * Einstiegspunkt für jede Anfrage und für die Skripte in bin/.
 * Lädt Konfiguration, registriert den Autoloader und öffnet die Datenbank.
 */
declare(strict_types=1);

// Mehrfaches Laden ist erlaubt und passiert: bin/setup.php ruft die
// Skripte in db/ im selben Prozess auf, und jedes davon lädt diese Datei.
// Ohne diese Bremse würde define() beim zweiten Mal meckern.
if (defined('APP_ROOT')) {
    return;
}

define('APP_ROOT', dirname(__DIR__));
define('APP_DIR', __DIR__);
define('STORAGE_DIR', APP_ROOT . '/storage');

mb_internal_encoding('UTF-8');
date_default_timezone_set('UTC');   // Gerechnet wird immer in UTC.

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'App\\')) {
        return;
    }
    $path = APP_DIR . '/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

/** @var array $config */
$config = require APP_DIR . '/config.php';

if (($config['app_env'] ?? 'production') === 'development') {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    ini_set('error_log', STORAGE_DIR . '/logs/php-error.log');
}

App\Core\Config::load($config);
