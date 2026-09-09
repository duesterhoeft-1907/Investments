<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Core\Push;
use App\Domain\Notify;

/**
 * Anmeldung der Geräte für Push.
 *
 * Der Browser handelt die Anmeldung mit seinem Push-Dienst selbst aus und
 * bringt uns nur das Ergebnis: eine Adresse und zwei Schlüssel. Wir merken
 * uns die Adresse je Mensch und Gerät.
 */
final class PushController
{
    /** Der öffentliche Schlüssel, den der Browser zum Anmelden braucht. */
    public static function key(): void
    {
        Auth::requireStaff();
        Http::json([
            'moeglich'  => Push::moeglich(),
            'publicKey' => Push::moeglich() ? Push::oeffentlicherSchluessel() : '',
        ]);
    }

    public static function subscribe(): void
    {
        $me = Auth::requireStaff();
        $body = Http::body();

        $endpoint = trim((string) ($body['endpoint'] ?? ''));
        if ($endpoint === '' || !str_starts_with($endpoint, 'https://')) {
            Http::error('Die Anmeldung des Browsers ist unvollständig.', 422);
        }

        $schluessel = is_array($body['keys'] ?? null) ? $body['keys'] : [];

        // Dasselbe Gerät meldet sich nach jedem Neustart wieder an; die Adresse
        // bleibt dieselbe. Ohne das Zusammenführen stünde ein Mensch nach einer
        // Woche zwanzigmal in der Liste.
        Db::run(
            'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
             VALUES (:u, :e, :p, :a, :ua)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh),
                                     auth_key = VALUES(auth_key), user_agent = VALUES(user_agent),
                                     fehler = 0',
            [
                'u'  => (int) $me['id'],
                'e'  => mb_substr($endpoint, 0, 500),
                'p'  => mb_substr((string) ($schluessel['p256dh'] ?? ''), 0, 200),
                'a'  => mb_substr((string) ($schluessel['auth'] ?? ''), 0, 100),
                'ua' => mb_substr((string) (Http::header('User-Agent') ?? ''), 0, 190),
            ]
        );

        Http::json(['ok' => true, 'geraete' => self::zahl((int) $me['id'])], 201);
    }

    public static function unsubscribe(): void
    {
        $me = Auth::requireStaff();
        $endpoint = trim((string) (Http::body()['endpoint'] ?? ''));
        Db::run(
            'DELETE FROM push_subscriptions WHERE user_id = :u AND endpoint = :e',
            ['u' => (int) $me['id'], 'e' => $endpoint]
        );
        Http::json(['ok' => true, 'geraete' => self::zahl((int) $me['id'])]);
    }

    /** Eine Probe an die eigenen Geräte – der einzige Weg, es wirklich zu wissen. */
    public static function test(): void
    {
        $me = Auth::requireStaff();
        Notify::send(
            (int) $me['id'],
            'system',
            'Probe angekommen',
            'Wenn du das auf dem Telefon liest, funktioniert der Weg.',
            '/app',
        );
        Http::json(['ok' => true, 'geraete' => self::zahl((int) $me['id'])]);
    }

    private static function zahl(int $userId): int
    {
        return (int) (Db::value(
            'SELECT COUNT(*) FROM push_subscriptions WHERE user_id = :u',
            ['u' => $userId]
        ) ?? 0);
    }
}
