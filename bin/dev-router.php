<?php
/**
 * Router für PHPs eingebauten Server – nur für die lokale Entwicklung.
 * Bildet nach, was auf SiteGround die .htaccess macht.
 *
 *   php -S localhost:8080 -t public_html bin/dev-router.php
 *
 * Auf dem Server wird diese Datei nicht gebraucht.
 */
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$docRoot = dirname(__DIR__) . '/public_html';

// Vorhandene Dateien direkt ausliefern (return false lässt den Server das tun).
if ($path !== '/' && is_file($docRoot . $path)) {
    return false;
}

require $docRoot . '/index.php';
