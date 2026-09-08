#!/usr/bin/env php
<?php
/**
 * Wächter über die Reaktionszeit.
 *
 *   php bin/cron-sla.php              einmal prüfen
 *   php bin/cron-sla.php --loop=30    30 Minuten lang jede Minute prüfen
 *
 * Auf Shared Hosting ist der kleinste erlaubte Cron-Takt oft 15 oder 30
 * Minuten – minütlich lehnt SiteGround mit "ungültiges Intervall" ab. Eine
 * Frist von zehn Minuten liesse sich damit nicht sinnvoll ueberwachen: die
 * Vorwarnung käme erst, wenn die Frist längst gerissen ist.
 *
 * Deshalb der Schleifenmodus: einmal pro Takt gestartet, prüft der Lauf
 * jede Minute, bis der nächste Start ansteht, und beendet sich dann. Ein
 * Sperrfile verhindert, dass sich zwei Läufe überlappen.
 *
 * Ohne jeden Cron greift ersatzweise eine Prüfung beim Abrufen der
 * Ereignisse – dann aber nur, solange jemand angemeldet ist.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Domain\Events;
use App\Domain\Sla;

// ── Wie lange laufen? ──
$minutes = 0;
foreach ($argv as $arg) {
    if (preg_match('/^--loop(?:=(\d+))?$/', $arg, $m) === 1) {
        $minutes = isset($m[1]) ? (int) $m[1] : 30;
    }
}
// Nach oben begrenzt: ein Lauf soll den nächsten nie überholen, und ein
// vergessener Prozess soll nicht ewig weiterlaufen.
$minutes = max(0, min(60, $minutes));

// ── Nur ein Lauf gleichzeitig ──
$lockFile = STORAGE_DIR . '/sla.lock';
$lock = fopen($lockFile, 'c');
if ($lock === false) {
    fwrite(STDERR, "Sperrdatei nicht schreibbar: $lockFile\n");
    exit(1);
}
if (!flock($lock, LOCK_EX | LOCK_NB)) {
    // Ein vorheriger Lauf ist noch unterwegs. Das ist kein Fehler – der
    // nächste Takt findet ihn beim Aufräumen wieder.
    echo "[" . gmdate('H:i:s') . "] Läuft bereits, übersprungen.\n";
    exit(0);
}

$started = time();
$runden  = 0;
$warned  = 0;
$breached = 0;

do {
    $result = Sla::run();
    $warned   += $result['warned'];
    $breached += $result['breached'];
    $runden++;

    if ($minutes === 0) {
        break;
    }
    // Bis zur nächsten vollen Minute schlafen, aber nie über das Ende hinaus.
    $verbleibend = ($started + $minutes * 60) - time();
    if ($verbleibend <= 5) {
        break;
    }
    sleep((int) min(60, $verbleibend));
} while (true);

// Alte Ereignisse einmal pro Lauf wegräumen, nicht in jeder Runde.
Events::prune();

echo sprintf(
    "[%s] %d Prüfung(en) in %d Sek. · Vorwarnungen: %d, Überschreitungen: %d\n",
    gmdate('Y-m-d H:i:s'),
    $runden,
    time() - $started,
    $warned,
    $breached
);

flock($lock, LOCK_UN);
fclose($lock);
