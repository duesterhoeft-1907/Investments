<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Config;
use App\Core\Db;
use App\Core\Http;
use App\Core\I18n;
use App\Core\Validator;
use App\Domain\Hours;
use App\Domain\Intake;
use App\Domain\Leads;

/** Öffentliche Strecke – ohne Anmeldung erreichbar. */
final class PublicController
{
    public static function wizardConfig(): void
    {
        self::useLang();

        /*
         * Die englischen Bezeichnungen stehen in eigenen Spalten. Ist eine
         * leer, greift der deutsche Text – ein neu angelegtes Fachgebiet
         * verschwindet so nicht aus der englischen Strecke, es steht dort
         * nur noch deutsch, bis jemand die Übersetzung nachträgt.
         */
        $spalte = static fn (string $feld): string => I18n::isEn()
            ? "COALESCE(NULLIF(ac.{$feld}_en, ''), ac.{$feld}) AS {$feld}"
            : "ac.{$feld}";

        $assetClasses = Db::all(
            'SELECT ac.id, ac.slug, ' . $spalte('name') . ', ' . $spalte('tagline') . ', '
            . $spalte('description') . ', ac.icon,'
            . (I18n::isEn()
                ? " COALESCE(NULLIF(t.name_en, ''), t.name) AS teamName,"
                : ' t.name AS teamName,')
            . ' t.color AS teamColor, t.sla_minutes AS slaMinutes
               FROM asset_classes ac
               LEFT JOIN teams t ON t.id = ac.team_id
              WHERE ac.is_active = 1
              ORDER BY ac.sort_order, ac.id'
        );

        foreach ($assetClasses as &$row) {
            $row['id'] = (int) $row['id'];
            $row['slaMinutes'] = $row['slaMinutes'] === null ? null : (int) $row['slaMinutes'];
        }
        unset($row);

        Http::json([
            'lang'             => I18n::lang(),
            'company'          => Config::get('company'),
            'assetClasses'     => $assetClasses,
            'volumeBands'      => self::options(I18n::labels('leads.volume', array_map(
                static fn (array $b): string => $b['label'],
                Leads::VOLUME_BANDS
            ))),
            'horizons'         => self::options(I18n::labels('leads.horizon', Leads::HORIZONS)),
            'experience'       => self::options(I18n::labels('leads.experience', Leads::EXPERIENCE)),
            'contactPrefs'     => self::options(I18n::labels('leads.contactPref', Leads::CONTACT_PREFS)),
            // Aus den Geschäftszeiten abgeleitet – siehe Hours::contactWindows().
            'contactWindows'   => self::options(Hours::contactWindows()),
            'defaultSlaMinutes'=> (int) Config::get('sla_minutes'),
            // Damit der Wizard nachts nicht "in 10 Minuten" verspricht.
            'hours'            => [
                'open'        => Hours::isOpen(),
                'nextOpening' => Hours::nextOpening()?->format('c'),
            ],
        ]);
    }

    /**
     * Die Sprache, in der geantwortet wird.
     *
     * Sie steht nicht im Pfad, weil die Schnittstelle unter /api liegt und
     * nicht unter /en – der Wizard schickt sie deshalb ausdrücklich mit.
     * Alles, was nicht auf der Liste steht, ist Deutsch.
     */
    private static function useLang(): void
    {
        $lang = (string) (Http::query('lang') ?? Http::body()['lang'] ?? 'de');
        I18n::use($lang);
    }

    /** @param array<string,string> $map */
    private static function options(array $map): array
    {
        $out = [];
        foreach ($map as $value => $label) {
            $out[] = ['value' => $value, 'label' => $label];
        }
        return $out;
    }

    public static function submit(): void
    {
        self::useLang();
        $body = Http::body();

        // Honigtopf: für Menschen unsichtbar, Bots füllen ihn aus. Wir
        // antworten unauffällig mit Erfolg, legen aber nichts an.
        if (trim((string) ($body['website'] ?? '')) !== '') {
            Http::json(['ok' => true], 202);
        }

        self::enforceRateLimit();

        $f = static fn (string $name): string => I18n::t('validator.fields.' . $name);

        $v = new Validator($body);
        $v->text('firstName', $f('firstName'), 2, 80)
          ->text('lastName', $f('lastName'), 2, 80)
          ->email('email')
          ->text('phone', $f('phone'), 0, 60, false)
          ->text('company', $f('company'), 0, 160, false)
          ->text('city', $f('city'), 0, 120, false)
          ->text('postalCode', $f('postalCode'), 0, 20, false)
          ->text('country', $f('country'), 0, 4, false)
          ->choice('assetClassSlug', self::assetSlugs(), $f('assetClass'))
          ->choice('volumeBand', array_keys(Leads::VOLUME_BANDS), $f('volumeBand'), false)
          ->choice('horizon', array_keys(Leads::HORIZONS), $f('horizon'), false)
          ->choice('experience', array_keys(Leads::EXPERIENCE), $f('experience'), false)
          ->choice('contactPref', array_keys(Leads::CONTACT_PREFS), $f('contactPref'), false, 'phone')
          ->choice('contactWindow', array_keys(Leads::CONTACT_WINDOWS), $f('contactWindow'), false, 'flexibel')
          ->text('goal', $f('goal'), 0, 500, false)
          ->text('message', $f('message'), 0, 4000, false)
          ->accepted('consentContact', I18n::t('intake.consent'))
          ->bool('consentMarketing');

        $clean = $v->orFail();
        $clean['source'] = 'wizard';
        // Die Sprache bleibt am Lead haengen: sie entscheidet ueber die
        // Bestaetigungsmail und darueber, wie zurueckgerufen wird.
        $clean['lang'] = I18n::lang();

        // Ohne Telefonnummer kein Rückruf – das ist der ganze Sinn der
        // Strecke, unabhängig davon, welchen Kanal jemand bevorzugt.
        if ($clean['phone'] === '') {
            Http::error(I18n::t('intake.phone'), 400, [
                'fields' => ['phone' => I18n::t('intake.phone')],
            ]);
        }

        $result = Intake::submit($clean);

        Http::json([
            'lang'       => I18n::lang(),
            'ref'        => $result['lead']['ref'],
            'slaMinutes' => $result['slaMinutes'],
            'slaDueAt'   => $result['lead']['slaDueAt'] ?? null,
            'open'       => Hours::isOpen(),
            'nextOpening'=> Hours::nextOpening()?->format('c'),
            'team'       => $result['lead']['team'],
            'assetClass' => $result['lead']['assetClass'],
            'contact'    => $result['contact'],
            'portal'     => $result['portal'],
        ], 201);
    }

    /** @return list<string> */
    private static function assetSlugs(): array
    {
        $rows = Db::all('SELECT slug FROM asset_classes WHERE is_active = 1');
        return array_map(static fn (array $r): string => (string) $r['slug'], $rows);
    }

    /**
     * Einfache Drosselung je IP und Stunde. Shared Hosting hat kein
     * vorgelagertes Rate-Limit, und die Route legt Datensätze an und
     * verschickt Mails – sie darf nicht unbegrenzt aufrufbar sein.
     */
    private static function enforceRateLimit(): void
    {
        $limit = (int) Config::get('wizard_rate_limit', 12);
        if ($limit <= 0) {
            return;
        }
        $bucket = 'wizard:' . Http::clientIp();

        Db::run(
            'INSERT INTO rate_limits (bucket, hits, window_at) VALUES (:b, 1, NOW())
             ON DUPLICATE KEY UPDATE
                hits      = IF(window_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), 1, hits + 1),
                window_at = IF(window_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW(), window_at)',
            ['b' => $bucket]
        );

        $hits = (int) (Db::value('SELECT hits FROM rate_limits WHERE bucket = :b', ['b' => $bucket]) ?? 0);
        if ($hits > $limit) {
            Http::error(I18n::t('intake.ratelimit'), 429);
        }

        // Gelegentlich aufräumen, damit die Tabelle nicht wächst.
        if (random_int(1, 50) === 1) {
            Db::run('DELETE FROM rate_limits WHERE window_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
        }
    }
}
