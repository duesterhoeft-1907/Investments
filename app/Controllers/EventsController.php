<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Db;
use App\Core\Http;
use App\Domain\Events;
use App\Domain\Notify;
use App\Domain\Sla;

/**
 * Der Puls der Anwendung. Der Browser fragt hier im Sekundentakt nach
 * Neuigkeiten; die Antwort ist bewusst schmal, damit das auch bei 8 Beratern
 * und minütlichem Abruf keine Last erzeugt.
 */
final class EventsController
{
    public static function poll(): void
    {
        $me = Auth::requireStaff();
        $userId = (int) $me['id'];
        $since = Http::queryInt('since', 0);

        // Anwesenheit mitschreiben – daraus entsteht der Online-Punkt.
        Db::run(
            'INSERT INTO presence (user_id, seen_at) VALUES (:u, NOW())
             ON DUPLICATE KEY UPDATE seen_at = NOW()',
            ['u' => $userId]
        );
        Db::run('UPDATE users SET last_seen_at = NOW() WHERE id = :u', ['u' => $userId]);

        // Netz für den Fall, dass der Cron noch nicht eingerichtet ist.
        Sla::runThrottled();

        // Erster Abruf: nur den Stand melden, nicht die ganze Historie
        // nachliefern – sonst poppen beim Anmelden alte Toasts auf.
        if ($since <= 0) {
            Http::json([
                'cursor'        => Events::latestId(),
                'events'        => [],
                'unread'        => Notify::unreadCount($userId),
                'chatUnread'    => self::chatUnread($userId),
                'online'        => self::onlineUserIds(),
                'pollIntervalMs'=> (int) Config::get('poll_interval_ms', 3000),
            ]);
        }

        $events = Events::since($userId, $since);
        $cursor = $events === [] ? $since : (int) end($events)['id'];

        Http::json([
            'cursor'         => $cursor,
            'events'         => $events,
            'unread'         => Notify::unreadCount($userId),
            'chatUnread'     => self::chatUnread($userId),
            'online'         => self::onlineUserIds(),
            'pollIntervalMs' => (int) Config::get('poll_interval_ms', 3000),
        ]);
    }

    /** Wer war in den letzten zwei Minuten aktiv? */
    public static function onlineUserIds(): array
    {
        $rows = Db::all('SELECT user_id FROM presence WHERE seen_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE)');
        return array_map(static fn (array $r): int => (int) $r['user_id'], $rows);
    }

    public static function chatUnread(int $userId): int
    {
        return (int) (Db::value(
            'SELECT COUNT(*)
               FROM channel_members cm
               JOIN messages m ON m.channel_id = cm.channel_id
              WHERE cm.user_id = :u
                AND m.created_at > cm.last_read_at
                AND (m.user_id IS NULL OR m.user_id <> :u2)',
            ['u' => $userId, 'u2' => $userId]
        ) ?? 0);
    }
}
