<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Config;
use App\Core\Db;
use App\Core\Http;
use App\Core\Validator;
use App\Domain\Intake;
use App\Domain\Leads;

/** Öffentliche Strecke – ohne Anmeldung erreichbar. */
final class PublicController
{
    public static function wizardConfig(): void
    {
        $assetClasses = Db::all(
            'SELECT ac.id, ac.slug, ac.name, ac.tagline, ac.description, ac.icon,
                    t.name AS teamName, t.color AS teamColor, t.sla_minutes AS slaMinutes
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
            'company'          => Config::get('company'),
            'assetClasses'     => $assetClasses,
            'volumeBands'      => self::options(array_map(
                static fn (array $b): string => $b['label'],
                Leads::VOLUME_BANDS
            )),
            'horizons'         => self::options(Leads::HORIZONS),
            'experience'       => self::options(Leads::EXPERIENCE),
            'contactPrefs'     => self::options(Leads::CONTACT_PREFS),
            'contactWindows'   => self::options(Leads::CONTACT_WINDOWS),
            'defaultSlaMinutes'=> (int) Config::get('sla_minutes'),
        ]);
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
        $body = Http::body();

        // Honigtopf: für Menschen unsichtbar, Bots füllen ihn aus. Wir
        // antworten unauffällig mit Erfolg, legen aber nichts an.
        if (trim((string) ($body['website'] ?? '')) !== '') {
            Http::json(['ok' => true], 202);
        }

        self::enforceRateLimit();

        $v = new Validator($body);
        $v->text('firstName', 'Vornamen', 2, 80)
          ->text('lastName', 'Nachnamen', 2, 80)
          ->email('email')
          ->text('phone', 'Telefonnummer', 0, 60, false)
          ->text('company', 'Firma', 0, 160, false)
          ->text('city', 'Ort', 0, 120, false)
          ->text('postalCode', 'Postleitzahl', 0, 20, false)
          ->text('country', 'Land', 0, 4, false)
          ->choice('assetClassSlug', self::assetSlugs(), 'ein Fachgebiet')
          ->choice('volumeBand', array_keys(Leads::VOLUME_BANDS), 'ein Anlagevolumen', false)
          ->choice('horizon', array_keys(Leads::HORIZONS), 'einen Anlagehorizont', false)
          ->choice('experience', array_keys(Leads::EXPERIENCE), 'deine Erfahrung', false)
          ->choice('contactPref', array_keys(Leads::CONTACT_PREFS), 'einen Kontaktweg', false, 'phone')
          ->choice('contactWindow', array_keys(Leads::CONTACT_WINDOWS), 'eine Uhrzeit', false, 'flexibel')
          ->text('goal', 'dein Ziel', 0, 500, false)
          ->text('message', 'deine Nachricht', 0, 4000, false)
          ->accepted('consentContact', 'Ohne Einwilligung dürfen wir dich nicht kontaktieren.')
          ->bool('consentMarketing');

        $clean = $v->orFail();
        $clean['source'] = 'wizard';

        // Ohne Telefonnummer kein Rückruf – das ist der ganze Sinn der Strecke.
        if ($clean['contactPref'] !== 'email' && $clean['phone'] === '') {
            Http::error('Für den Rückruf brauchen wir eine Telefonnummer.', 400, [
                'fields' => ['phone' => 'Für den Rückruf brauchen wir eine Telefonnummer.'],
            ]);
        }

        $result = Intake::submit($clean);

        Http::json([
            'ref'        => $result['lead']['ref'],
            'slaMinutes' => $result['slaMinutes'],
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
            Http::error('Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut oder ruf uns direkt an.', 429);
        }

        // Gelegentlich aufräumen, damit die Tabelle nicht wächst.
        if (random_int(1, 50) === 1) {
            Db::run('DELETE FROM rate_limits WHERE window_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
        }
    }
}
