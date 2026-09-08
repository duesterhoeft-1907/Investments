<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Db;
use App\Core\I18n;
use DateInterval;
use DateTimeImmutable;
use DateTimeZone;

/**
 * Geschaeftszeiten – die Ruhezeiten des Hauses.
 *
 * Warum das noetig ist: die Reaktionszeit ist ein Versprechen an den
 * Interessenten, und ein Versprechen gilt nur, solange jemand da ist. Ohne
 * diese Rechnung waere eine Anfrage um 23:40 zehn Minuten spaeter
 * "ueberschritten", obwohl niemand etwas falsch gemacht hat – die Kennzahl
 * misst dann die Nacht statt die Arbeit.
 *
 * Deshalb ruht die Uhr ausserhalb der Zeiten und laeuft zur naechsten
 * Oeffnung weiter. Angenommen wird trotzdem rund um die Uhr; der Wizard
 * bleibt offen, nur das Versprechen im Bestaetigungstext lautet dann
 * "morgen frueh" statt "in zehn Minuten".
 *
 * Gerechnet wird in der eingestellten Zeitzone, gespeichert in UTC.
 */
final class Hours
{
    public const KEY = 'business_hours';

    /** Reihenfolge und Beschriftung der Wochentage. */
    public const DAYS = [
        'mon' => 'Montag',
        'tue' => 'Dienstag',
        'wed' => 'Mittwoch',
        'thu' => 'Donnerstag',
        'fri' => 'Freitag',
        'sat' => 'Samstag',
        'sun' => 'Sonntag',
    ];

    /** Ohne eigene Einstellung gilt das hier. */
    public static function defaults(): array
    {
        $week = ['09:00-18:00'];
        return [
            'enabled'  => true,
            'timezone' => 'Europe/Berlin',
            'days'     => [
                'mon' => $week, 'tue' => $week, 'wed' => $week,
                'thu' => $week, 'fri' => $week, 'sat' => [], 'sun' => [],
            ],
            'closedDates' => [],   // Feiertage und Betriebsferien: 'YYYY-MM-DD'

            /*
             * Rueckruf am Abend.
             *
             * Absichtlich getrennt von den Geschaeftszeiten daruber: die
             * bestimmen, wann die Reaktionsuhr laeuft – wann also jemand
             * am Platz sitzt und eine neue Anfrage annimmt. Ein Rueckruf
             * um halb acht ist etwas anderes; den macht eine Beraterin
             * nach Feierabend, wenn es so verabredet ist.
             *
             * Wer das nicht anbietet, schaltet es hier ab; dann steht das
             * Fenster auch nicht mehr im Wizard.
             */
            'evening' => ['enabled' => true, 'from' => '19:00', 'to' => '21:00'],
        ];
    }

    /** @var array<string,mixed>|null einmal pro Anfrage geladen */
    private static ?array $cache = null;

    public static function config(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        // Die Startseite fragt hier nach den Ruhezeiten. Ist die Datenbank
        // gerade nicht erreichbar, soll die Seite trotzdem stehen: sie ist
        // das Schaufenster, und ein Ausfall dahinter darf es nicht schließen.
        // Ohne gespeicherten Stand gelten die Vorgaben.
        try {
            $raw = Db::value('SELECT setting_value FROM settings WHERE setting_key = :k', ['k' => self::KEY]);
        } catch (\Throwable $e) {
            return self::$cache = self::defaults();
        }
        $stored = is_string($raw) ? json_decode($raw, true) : null;

        return self::$cache = self::normalise(is_array($stored) ? $stored : []);
    }

    /**
     * Nimmt entgegen, was aus der Oberflaeche kommt, und macht daraus einen
     * Stand, mit dem gerechnet werden kann. Unsinn wird verworfen, nicht
     * uebernommen – eine kaputte Zeitangabe wuerde sonst die Uhr anhalten.
     */
    public static function normalise(array $in): array
    {
        $defaults = self::defaults();

        $timezone = (string) ($in['timezone'] ?? $defaults['timezone']);
        if (!in_array($timezone, DateTimeZone::listIdentifiers(), true)) {
            $timezone = $defaults['timezone'];
        }

        $days = [];
        foreach (array_keys(self::DAYS) as $day) {
            $windows = [];
            foreach ((array) ($in['days'][$day] ?? $defaults['days'][$day]) as $window) {
                $parsed = self::parseWindow((string) $window);
                if ($parsed !== null) {
                    $windows[] = $parsed;
                }
            }
            // Nach Beginn sortieren, damit die Rechnung sich auf die
            // Reihenfolge verlassen kann.
            usort($windows, static fn (string $a, string $b): int => strcmp($a, $b));
            $days[$day] = $windows;
        }

        $closed = [];
        foreach ((array) ($in['closedDates'] ?? []) as $date) {
            $date = trim((string) $date);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1) {
                $closed[$date] = true;
            }
        }
        $closed = array_keys($closed);
        sort($closed);

        // Abendfenster: nur uebernehmen, was sich als Uhrzeit lesen
        // laesst und wo der Beginn vor dem Ende liegt.
        $evIn = (array) ($in['evening'] ?? []);
        $evening = $defaults['evening'];
        $evening['enabled'] = (bool) ($evIn['enabled'] ?? $defaults['evening']['enabled']);
        $von = self::parseTime((string) ($evIn['from'] ?? $defaults['evening']['from']));
        $bis = self::parseTime((string) ($evIn['to'] ?? $defaults['evening']['to']));
        if ($von !== null && $bis !== null && $bis > $von) {
            $evening['from'] = $von;
            $evening['to'] = $bis;
        }

        return [
            'enabled'     => (bool) ($in['enabled'] ?? $defaults['enabled']),
            'timezone'    => $timezone,
            'days'        => $days,
            'closedDates' => $closed,
            'evening'     => $evening,
        ];
    }

    /** 'HH:MM' oder null, wenn es keine Uhrzeit ist. */
    private static function parseTime(string $wert): ?string
    {
        $wert = trim($wert);
        if (preg_match('/^(\d{1,2}):(\d{2})$/', $wert, $m) !== 1) {
            return null;
        }
        $h = (int) $m[1];
        $i = (int) $m[2];
        if ($h > 24 || $i > 59 || ($h === 24 && $i > 0)) {
            return null;
        }
        return sprintf('%02d:%02d', $h, $i);
    }

    /** Minuten seit Mitternacht aus 'HH:MM'. */
    private static function minuten(string $zeit): int
    {
        [$h, $i] = array_map('intval', explode(':', $zeit));
        return $h * 60 + $i;
    }

    /** "9:00-18:00" wird zu "09:00-18:00"; Unsinn wird zu null. */
    private static function parseWindow(string $window): ?string
    {
        if (preg_match('/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/', $window, $m) !== 1) {
            return null;
        }
        [$fromH, $fromM, $toH, $toM] = [(int) $m[1], (int) $m[2], (int) $m[3], (int) $m[4]];
        if ($fromH > 23 || $toH > 24 || $fromM > 59 || $toM > 59) {
            return null;
        }
        $from = $fromH * 60 + $fromM;
        $to   = $toH * 60 + $toM;
        if ($to <= $from) {
            return null;   // ueber Mitternacht wird bewusst nicht unterstuetzt
        }
        return sprintf('%02d:%02d-%02d:%02d', $fromH, $fromM, $toH, $toM);
    }

    public static function save(array $in): array
    {
        $config = self::normalise($in);
        Db::run(
            'INSERT INTO settings (setting_key, setting_value) VALUES (:k, :v)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()',
            ['k' => self::KEY, 'v' => json_encode($config, JSON_UNESCAPED_UNICODE)]
        );
        self::$cache = $config;
        return $config;
    }

    public static function timezone(): DateTimeZone
    {
        return new DateTimeZone(self::config()['timezone']);
    }

    /** Sind wir gerade im Dienst? */
    public static function isOpen(?DateTimeImmutable $at = null): bool
    {
        $config = self::config();
        if (!$config['enabled']) {
            return true;
        }
        $local = ($at ?? new DateTimeImmutable('now', new DateTimeZone('UTC')))->setTimezone(self::timezone());

        foreach (self::windowsOn($local, $config) as [$from, $to]) {
            if ($local >= $from && $local < $to) {
                return true;
            }
        }
        return false;
    }

    /** Wann geht es weiter? Null, wenn immer offen ist. */
    public static function nextOpening(?DateTimeImmutable $at = null): ?DateTimeImmutable
    {
        $config = self::config();
        if (!$config['enabled']) {
            return null;
        }
        $now = $at ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $window = self::nextWindow($now->setTimezone(self::timezone()), $config);

        return $window === null ? null : $window[0]->setTimezone(new DateTimeZone('UTC'));
    }

    /**
     * Der Kern: wann ist die Frist abgelaufen, wenn nur Dienstzeit zaehlt?
     *
     * Verbraucht die Minuten Fenster fuer Fenster. Sind keine Zeiten
     * gepflegt oder ist die Rechnung abgeschaltet, bleibt es beim einfachen
     * Aufschlag – lieber eine strenge Frist als gar keine.
     */
    public static function dueAt(DateTimeImmutable $start, int $minutes): DateTimeImmutable
    {
        $minutes = max(1, $minutes);
        $config  = self::config();
        $utc     = new DateTimeZone('UTC');

        if (!$config['enabled'] || self::isNeverOpen($config)) {
            return $start->setTimezone($utc)->add(new DateInterval('PT' . $minutes . 'M'));
        }

        $cursor    = $start->setTimezone(self::timezone());
        $remaining = $minutes;

        // 400 Durchlaeufe reichen fuer weit ueber ein Jahr Kalender – die
        // Schleife endet in der Praxis nach ein bis zwei.
        for ($guard = 0; $guard < 400; $guard++) {
            $window = self::currentOrNextWindow($cursor, $config);
            if ($window === null) {
                break;
            }
            [$from, $to] = $window;
            if ($cursor < $from) {
                $cursor = $from;
            }
            $available = (int) floor(($to->getTimestamp() - $cursor->getTimestamp()) / 60);
            if ($available >= $remaining) {
                return $cursor->add(new DateInterval('PT' . $remaining . 'M'))->setTimezone($utc);
            }
            $remaining -= $available;
            $cursor = $to;
        }

        // Kein Fenster gefunden (etwa: alle Tage leer) – nicht schweigend
        // eine Frist verschlucken.
        return $start->setTimezone($utc)->add(new DateInterval('PT' . $minutes . 'M'));
    }

    /** Ist ueberhaupt irgendwann geoeffnet? */
    private static function isNeverOpen(array $config): bool
    {
        foreach ($config['days'] as $windows) {
            if ($windows !== []) {
                return false;
            }
        }
        return true;
    }

    /**
     * Das Fenster, in dem der Zeitpunkt liegt – sonst das naechste danach.
     * @return array{0:DateTimeImmutable,1:DateTimeImmutable}|null
     */
    private static function currentOrNextWindow(DateTimeImmutable $local, array $config): ?array
    {
        foreach (self::windowsOn($local, $config) as $window) {
            if ($local < $window[1]) {
                return $window;
            }
        }
        return self::nextWindow($local, $config);
    }

    /**
     * Das naechste Fenster, das spaeter beginnt als der Zeitpunkt.
     * @return array{0:DateTimeImmutable,1:DateTimeImmutable}|null
     */
    private static function nextWindow(DateTimeImmutable $local, array $config): ?array
    {
        foreach (self::windowsOn($local, $config) as $window) {
            if ($window[0] > $local) {
                return $window;
            }
        }
        // Bis zu 366 Tage vorausschauen, dann sind auch Betriebsferien
        // ueberbrueckt.
        $day = $local;
        for ($i = 0; $i < 366; $i++) {
            $day = $day->add(new DateInterval('P1D'))->setTime(0, 0);
            $windows = self::windowsOn($day, $config);
            if ($windows !== []) {
                return $windows[0];
            }
        }
        return null;
    }

    /**
     * Die Zeitfenster des Kalendertages, auf den der Zeitpunkt faellt.
     * @return list<array{0:DateTimeImmutable,1:DateTimeImmutable}>
     */
    private static function windowsOn(DateTimeImmutable $local, array $config): array
    {
        if (in_array($local->format('Y-m-d'), $config['closedDates'], true)) {
            return [];
        }
        $key = strtolower($local->format('D'));   // mon, tue, …
        $out = [];
        foreach ($config['days'][$key] ?? [] as $window) {
            [$from, $to] = explode('-', $window);
            [$fh, $fm] = array_map('intval', explode(':', $from));
            [$th, $tm] = array_map('intval', explode(':', $to));

            $start = $local->setTime($fh, $fm);
            // 24:00 heisst Tagesende, nicht 0 Uhr am selben Morgen.
            $end = $th === 24
                ? $local->setTime(0, 0)->add(new DateInterval('P1D'))
                : $local->setTime($th, $tm);

            $out[] = [$start, $end];
        }
        return $out;
    }

    /**
     * Der Satzbaustein fuer das Versprechen an den Interessenten.
     *
     * Nachts "innerhalb von 10 Minuten" zu schreiben waere eine Zusage, die
     * niemand halten kann – und der erste Eindruck waere ein gebrochenes
     * Wort. Also sagen wir, wann es wirklich losgeht.
     */
    public static function promise(int $minutes): string
    {
        $next = self::isOpen() ? null : self::nextOpening();
        if ($next === null) {
            return I18n::t('hours.within', $minutes);
        }

        $local = $next->setTimezone(self::timezone());
        $today = new DateTimeImmutable('now', self::timezone());
        $time  = I18n::t('hours.time', $local->format(I18n::t('hours.format')));

        $diff = (int) $local->setTime(0, 0)->diff($today->setTime(0, 0))->format('%r%a');
        if ($diff === 0) {
            return I18n::t('hours.today', $time);
        }
        if ($diff === -1) {
            return I18n::t('hours.tomorrow', $time);
        }

        $weekdays = I18n::list('hours.weekdays');
        $name = (string) ($weekdays[(int) $local->format('w')] ?? $local->format('l'));
        return I18n::t('hours.weekday', $name, $time);
    }

    /**
     * Die Kontaktzeitfenster, die zu den Geschaeftszeiten passen.
     *
     * Fest verdrahtete Fenster erzeugen sonst Zusagen, die niemand einhaelt:
     * "Abends (17 – 20 Uhr)" waehlt jemand gern, wenn um 18 Uhr Schluss ist –
     * und wartet dann vergeblich. Angeboten wird deshalb nur, was innerhalb
     * der gepflegten Zeiten ueberhaupt moeglich ist, mit den echten Uhrzeiten
     * in der Beschriftung.
     *
     * @return array<string,string> Schluessel => Beschriftung
     */
    public static function contactWindows(): array
    {
        $config = self::config();
        [$frueh, $spaet] = self::spanne($config);
        $abendAn = (bool) ($config['evening']['enabled'] ?? false);
        $abendVon = self::minuten((string) ($config['evening']['from'] ?? '19:00'));
        $abendBis = self::minuten((string) ($config['evening']['to'] ?? '21:00'));

        $fenster = [];

        if (!$config['enabled'] || $frueh === null || $spaet === null) {
            // Ohne gepflegte Zeiten bleibt es bei der allgemeinen Einteilung.
            $fenster['vormittags'] = I18n::t('hours.windows.vormittags', self::stunde(8 * 60), self::stunde(12 * 60));
            $fenster['nachmittags'] = I18n::t('hours.windows.nachmittags', self::stunde(12 * 60), self::stunde(17 * 60));
        } else {
            if ($frueh < 12 * 60) {
                $fenster['vormittags'] = I18n::t(
                    'hours.windows.vormittags',
                    self::stunde($frueh),
                    self::stunde(12 * 60)
                );
            }
            if ($spaet > 12 * 60) {
                // Wer erst nachmittags oeffnet, soll auch das als Beginn sehen.
                $von = max(12 * 60, $frueh);
                // Der Nachmittag endet dort, wo der Abend beginnt – sonst
                // ueberlappen sich zwei Fenster und niemand weiss, welches
                // gemeint ist.
                $bis = $abendAn ? min($spaet, $abendVon) : $spaet;
                if ($bis > $von) {
                    $fenster['nachmittags'] = I18n::t(
                        'hours.windows.nachmittags',
                        self::stunde($von),
                        self::stunde($bis)
                    );
                }
            }
        }

        /*
         * Das Abendfenster steht ausdruecklich in den Einstellungen und
         * wird nicht aus den Geschaeftszeiten abgeleitet.
         *
         * Der Grund: die Geschaeftszeiten sagen, wann die Reaktionsuhr
         * laeuft – wann also jemand am Platz sitzt und eine neue Anfrage
         * annimmt. Ein Rueckruf um halb acht ist etwas anderes; den macht
         * eine Beraterin nach Feierabend, wenn es so verabredet ist. Wer
         * das nicht anbietet, schaltet es in der Verwaltung ab, und dann
         * steht es auch hier nicht mehr.
         */
        if ($abendAn) {
            $fenster['abends'] = I18n::t(
                'hours.windows.abends',
                self::stunde($abendVon),
                self::stunde($abendBis)
            );
        }

        // Bleibt nichts uebrig – etwa bei einem einzigen kurzen Fenster –,
        // ist die Frage nach der Tageszeit ohnehin gegenstandslos.
        $fenster['flexibel'] = $fenster === []
            ? I18n::t('hours.windows.whenever')
            : I18n::t('hours.windows.flexibel');

        return $fenster;
    }

    /**
     * Eine volle Stunde, wie sie die jeweilige Sprache schreibt.
     *
     * Deutsch zaehlt bis 24 und haengt das "Uhr" ans Ende der Spanne;
     * Englisch zaehlt bis 12 und braucht am/pm an jeder Zahl. Deshalb
     * kommt die Einheit hier aus der Sprache und nicht aus der Rechnung.
     */
    private static function stunde(int $minuten): string
    {
        $stunde = intdiv($minuten, 60);
        if (!I18n::isEn()) {
            return (string) $stunde;
        }
        if ($stunde === 12) {
            return '12 noon';
        }
        if ($stunde === 0 || $stunde === 24) {
            return 'midnight';
        }
        return $stunde < 12 ? $stunde . ' am' : ($stunde - 12) . ' pm';
    }

    private static function spanne(array $config): array
    {
        $frueh = null;
        $spaet = null;
        foreach ($config['days'] as $fenster) {
            foreach ($fenster as $eintrag) {
                [$von, $bis] = explode('-', $eintrag);
                [$vh, $vm] = array_map('intval', explode(':', $von));
                [$bh, $bm] = array_map('intval', explode(':', $bis));
                $start = $vh * 60 + $vm;
                $ende  = $bh * 60 + $bm;
                $frueh = $frueh === null ? $start : min($frueh, $start);
                $spaet = $spaet === null ? $ende : max($spaet, $ende);
            }
        }
        return [$frueh, $spaet];
    }

    /** Kurzfassung fuer Oberflaeche und Bestaetigungstext. */
    public static function summary(): array
    {
        $config = self::config();
        $open   = self::isOpen();
        $next   = $open ? null : self::nextOpening();

        return [
            'enabled'     => $config['enabled'],
            'timezone'    => $config['timezone'],
            'days'        => $config['days'],
            'closedDates' => $config['closedDates'],
            'evening'     => $config['evening'],
            'open'        => $open,
            'nextOpening' => $next?->format('c'),
        ];
    }
}
