#!/usr/bin/env php
<?php
/**
 * Prueft die Rechnung hinter den Ruhezeiten.
 *
 *   php bin/test-hours.php
 *
 * Reine Rechenproben, ohne Datenbank: die Konfiguration wird direkt gesetzt.
 * Wer an App\Domain\Hours etwas aendert, laesst das hier laufen.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Domain\Hours;

// Wir testen die reine Rechnung, ohne Datenbank: Konfiguration direkt setzen.
$ref = new ReflectionClass(Hours::class);
$cache = $ref->getProperty('cache');
$cache->setAccessible(true);

function setHours(array $overrides = []): void {
    $ref = new ReflectionClass(Hours::class);
    $p = $ref->getProperty('cache'); $p->setAccessible(true);
    $p->setValue(null, Hours::normalise(array_merge([
        'enabled' => true, 'timezone' => 'Europe/Berlin',
        'days' => ['mon'=>['09:00-18:00'],'tue'=>['09:00-18:00'],'wed'=>['09:00-18:00'],
                   'thu'=>['09:00-18:00'],'fri'=>['09:00-18:00'],'sat'=>[],'sun'=>[]],
        'closedDates' => [],
    ], $overrides)));
}

$fails = 0;
function check(string $label, string $got, string $want): void {
    global $fails;
    if ($got === $want) { echo "  ok   $label\n"; return; }
    echo "  FAIL $label\n       erwartet: $want\n       bekommen: $got\n";
    $fails++;
}

/** Startzeit in Berliner Zeit -> Frist als Berliner Zeit ausgeben. */
function due(string $localStart, int $minutes): string {
    $start = new DateTimeImmutable($localStart, new DateTimeZone('Europe/Berlin'));
    return Hours::dueAt($start, $minutes)
        ->setTimezone(new DateTimeZone('Europe/Berlin'))->format('D Y-m-d H:i');
}

setHours();

// Mo 2026-09-07 ist ein Montag.
check('mitten im Dienst',        due('2026-09-07 10:00', 15), 'Mon 2026-09-07 10:15');
check('vor Dienstbeginn',        due('2026-09-07 06:30', 10), 'Mon 2026-09-07 09:10');
check('nach Dienstschluss',      due('2026-09-07 23:40', 10), 'Tue 2026-09-08 09:10');
check('kurz vor Schluss, laeuft ueber', due('2026-09-07 17:50', 30), 'Tue 2026-09-08 09:20');
check('Freitagabend ueber das Wochenende', due('2026-09-11 19:00', 20), 'Mon 2026-09-14 09:20');
check('Samstag',                 due('2026-09-12 11:00', 45), 'Mon 2026-09-14 09:45');
check('exakt zu Dienstbeginn',   due('2026-09-07 09:00', 15), 'Mon 2026-09-07 09:15');
check('exakt zu Dienstschluss',  due('2026-09-07 18:00', 15), 'Tue 2026-09-08 09:15');
check('laenger als ein Tag',     due('2026-09-07 17:00', 600), 'Tue 2026-09-08 18:00');

// Mittagspause: zwei Fenster am Tag
setHours(['days' => ['mon'=>['09:00-12:00','13:00-18:00'],'tue'=>['09:00-18:00'],
                     'wed'=>[], 'thu'=>[], 'fri'=>[], 'sat'=>[], 'sun'=>[]]]);
check('Pause wird uebersprungen', due('2026-09-07 11:50', 20), 'Mon 2026-09-07 13:10');
check('waehrend der Pause',       due('2026-09-07 12:30', 10), 'Mon 2026-09-07 13:10');

// Feiertag
setHours(['closedDates' => ['2026-09-08']]);
check('Feiertag wird uebersprungen', due('2026-09-07 17:55', 20), 'Wed 2026-09-09 09:15');

// Abgeschaltet -> reiner Aufschlag
setHours(['enabled' => false]);
check('ohne Ruhezeiten', due('2026-09-07 23:40', 10), 'Mon 2026-09-07 23:50');

// Gar keine Zeiten gepflegt -> darf die Frist nicht verschlucken
setHours(['days' => ['mon'=>[],'tue'=>[],'wed'=>[],'thu'=>[],'fri'=>[],'sat'=>[],'sun'=>[]]]);
check('keine Zeiten gepflegt', due('2026-09-07 23:40', 10), 'Mon 2026-09-07 23:50');

// Sommer-/Winterzeit: Umstellung in der Nacht auf den 25.10.2026
setHours();
check('ueber die Zeitumstellung', due('2026-10-23 17:55', 20), 'Mon 2026-10-26 09:15');

// Unsinnige Eingaben werden verworfen, nicht uebernommen
$n = Hours::normalise(['days' => ['mon' => ['25:00-26:00', '18:00-09:00', '9:5-10:00', '9:00-17:30']]]);
check('kaputte Zeitfenster fliegen raus', json_encode($n['days']['mon']), '["09:00-17:30"]');
check('unbekannte Zeitzone faellt zurueck', Hours::normalise(['timezone' => 'Mars/Olympus'])['timezone'], 'Europe/Berlin');

// Das Versprechen an den Interessenten darf nie mehr zusagen, als geht.
setHours();
$berlin = new DateTimeZone('Europe/Berlin');
function promiseAt(string $localNow, int $minutes): string {
    // "jetzt" laesst sich nicht verstellen – also pruefen wir die Bausteine
    // ueber die oeffentliche Rechnung: offen? und naechste Oeffnung.
    $at = new DateTimeImmutable($localNow, new DateTimeZone('Europe/Berlin'));
    return App\Domain\Hours::isOpen($at) ? "innerhalb von $minutes Minuten" : 'spaeter';
}
check('werktags mittags offen',  promiseAt('2026-09-07 12:00', 10), 'innerhalb von 10 Minuten');
check('nachts geschlossen',      promiseAt('2026-09-07 23:40', 10), 'spaeter');
check('sonntags geschlossen',    promiseAt('2026-09-13 12:00', 10), 'spaeter');

// Die Beschriftungen haengen an der Sprache der Anfragestrecke.
// Englisch zaehlt bis 12 und braucht am/pm, Deutsch zaehlt bis 24.
setHours();
App\Core\I18n::use('de');
check('Zeitfenster deutsch', implode(' · ', Hours::contactWindows()),
    'Vormittags (9 – 12 Uhr) · Nachmittags (12 – 18 Uhr) · Jederzeit');

App\Core\I18n::use('en');
check('Zeitfenster englisch', implode(' · ', Hours::contactWindows()),
    'Mornings (9 am – 12 noon) · Afternoons (12 noon – 6 pm) · Any time');

// Die Zusage haengt daran, ob gerade geoeffnet ist – und "gerade" laesst
// sich Hours::promise() nicht vorgeben. Mit abgeschalteten Zeiten gilt
// rund um die Uhr geoeffnet, und die Probe misst die Sprache statt die
// Tageszeit ihres Laufs. (Sie tat das vorher nicht und schlug abends fehl.)
setHours(['enabled' => false]);
App\Core\I18n::use('de');
check('Zusage deutsch', Hours::promise(15), 'innerhalb von 15 Minuten');
App\Core\I18n::use('en');
check('Zusage englisch', Hours::promise(15), 'within 15 minutes');

// Ein spaeter Feierabend bekommt ein eigenes Abendfenster – in beiden Sprachen.
setHours(['days' => ['mon'=>['08:00-20:00'],'tue'=>['08:00-20:00'],'wed'=>['08:00-20:00'],
                     'thu'=>['08:00-20:00'],'fri'=>['08:00-20:00'],'sat'=>[],'sun'=>[]]]);
check('Abendfenster englisch', implode(' · ', Hours::contactWindows()),
    'Mornings (8 am – 12 noon) · Afternoons (12 noon – 5 pm) · Evenings (5 pm – 8 pm) · Any time');
App\Core\I18n::use('de');
check('Abendfenster deutsch', implode(' · ', Hours::contactWindows()),
    'Vormittags (8 – 12 Uhr) · Nachmittags (12 – 17 Uhr) · Abends (17 – 20 Uhr) · Jederzeit');

echo $fails === 0 ? "\nAlle Proben bestanden.\n" : "\n$fails Probe(n) fehlgeschlagen.\n";
exit($fails === 0 ? 0 : 1);
