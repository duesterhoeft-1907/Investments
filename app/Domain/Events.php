<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Db;

/**
 * Ereignisstrom.
 *
 * Auf Shared Hosting gibt es keine dauerhaften Verbindungen: PHP-Prozesse
 * werden pro Anfrage gestartet und beendet, WebSockets fallen damit aus.
 * Statt dessen schreibt jede Aktion ein Ereignis in eine Tabelle mit
 * aufsteigender id; der Browser fragt im Sekundentakt "alles ab id N".
 *
 * Das Ergebnis fühlt sich für den Nutzer wie Push an – bei einer SLA von
 * Minuten sind drei Sekunden Verzögerung ohne Bedeutung –, und der Wechsel
 * auf echte WebSockets später betrifft nur diese eine Klasse.
 */
final class Events
{
    /** Nur an eine Person. */
    public static function toUser(int $userId, string $type, array $payload = [], ?int $leadId = null): void
    {
        self::push($type, $payload, userId: $userId, leadId: $leadId);
    }

    /** An alle Mitglieder einer Fachgruppe. */
    public static function toTeam(?int $teamId, string $type, array $payload = [], ?int $leadId = null): void
    {
        self::push($type, $payload, teamId: $teamId, leadId: $leadId);
    }

    /** An alle Mitglieder eines Chat-Kanals. */
    public static function toChannel(int $channelId, string $type, array $payload = []): void
    {
        self::push($type, $payload, channelId: $channelId);
    }

    /** An alle Angemeldeten. */
    public static function toCompany(string $type, array $payload = [], ?int $leadId = null): void
    {
        self::push($type, $payload, leadId: $leadId);
    }

    private static function push(
        string $type,
        array $payload,
        ?int $userId = null,
        ?int $teamId = null,
        ?int $channelId = null,
        ?int $leadId = null,
    ): void {
        Db::run(
            'INSERT INTO events (type, user_id, team_id, channel_id, lead_id, payload)
             VALUES (:type, :user, :team, :channel, :lead, :payload)',
            [
                'type'    => $type,
                'user'    => $userId,
                'team'    => $teamId,
                'channel' => $channelId,
                'lead'    => $leadId,
                'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            ]
        );
    }

    /**
     * Alle Ereignisse ab $since, die diese Person sehen darf.
     *
     * Sichtbar ist: an mich persönlich, an eine meiner Gruppen, an einen
     * meiner Kanäle, oder firmenweit.
     *
     * @return list<array<string,mixed>>
     */
    public static function since(int $userId, int $since, int $limit = 120): array
    {
        $rows = Db::all(
            'SELECT e.id, e.type, e.lead_id, e.channel_id, e.team_id, e.payload, e.created_at
               FROM events e
              WHERE e.id > :since
                AND (
                      e.user_id = :me
                   OR (e.user_id IS NULL AND e.team_id IS NULL AND e.channel_id IS NULL)
                   OR (e.team_id IS NOT NULL
                       AND e.team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = :me2))
                   OR (e.channel_id IS NOT NULL
                       AND e.channel_id IN (SELECT cm.channel_id FROM channel_members cm WHERE cm.user_id = :me3))
                )
              ORDER BY e.id ASC
              LIMIT ' . $limit,
            ['since' => $since, 'me' => $userId, 'me2' => $userId, 'me3' => $userId]
        );

        foreach ($rows as &$row) {
            $row['payload'] = $row['payload'] === null ? [] : (json_decode((string) $row['payload'], true) ?: []);
            $row['id'] = (int) $row['id'];
        }
        return $rows;
    }

    /** Höchste vergebene id – Startpunkt für einen frisch geladenen Client. */
    public static function latestId(): int
    {
        return (int) (Db::value('SELECT COALESCE(MAX(id), 0) FROM events') ?? 0);
    }

    /**
     * Hält den Strom klein. Wird beim Abfragen gelegentlich mitgerufen –
     * auf Shared Hosting gibt es keinen Aufräum-Dienst.
     */
    public static function prune(int $keepHours = 48): void
    {
        Db::run('DELETE FROM events WHERE created_at < DATE_SUB(NOW(), INTERVAL :h HOUR)', ['h' => $keepHours]);
    }
}
