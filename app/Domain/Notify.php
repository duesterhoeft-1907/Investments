<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Db;

/**
 * Benachrichtigungen. Jede wird gespeichert (für die Glocke) und zusätzlich
 * als Ereignis gestreut, damit der Toast beim nächsten Abruf sofort erscheint.
 */
final class Notify
{
    public static function send(
        int $userId,
        string $type,
        string $title,
        string $body = '',
        string $link = '',
        ?int $leadId = null,
        string $urgency = 'normal',
    ): int {
        $id = Db::insert(
            'INSERT INTO notifications (user_id, type, title, body, link, lead_id, urgency)
             VALUES (:user, :type, :title, :body, :link, :lead, :urgency)',
            [
                'user'    => $userId,
                'type'    => $type,
                'title'   => $title,
                'body'    => mb_substr($body, 0, 500),
                'link'    => $link,
                'lead'    => $leadId,
                'urgency' => $urgency,
            ]
        );

        Events::toUser($userId, 'notification', [
            'id'      => $id,
            'type'    => $type,
            'title'   => $title,
            'body'    => mb_substr($body, 0, 500),
            'link'    => $link,
            'leadId'  => $leadId,
            'urgency' => $urgency,
        ], $leadId);

        return $id;
    }

    public static function unreadCount(int $userId): int
    {
        return (int) (Db::value(
            'SELECT COUNT(*) FROM notifications WHERE user_id = :u AND is_read = 0',
            ['u' => $userId]
        ) ?? 0);
    }
}
