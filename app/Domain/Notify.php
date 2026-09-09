<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Db;
use App\Core\Push;

/**
 * Benachrichtigungen.
 *
 * Jede wird gespeichert (für die Glocke) und als Ereignis gestreut, damit der
 * Toast beim nächsten Abruf erscheint. Beides erreicht nur, wer das CRM offen
 * hat – deshalb gehen dieselben Meldungen zusätzlich als Push aufs Telefon und,
 * wenn hinterlegt, an Telegram.
 *
 * Die zwei zusätzlichen Wege dürfen nichts kaputtmachen: schlägt einer fehl,
 * steht die Meldung trotzdem in der Glocke. Deshalb sind sie in try gefasst
 * und laufen nach dem Schreiben, nicht davor.
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

        // Aufs Telefon, wenn dort jemand zugestimmt hat. Ohne Inhalt: der
        // Service Worker holt sich den Text selbst – so steht kein Wort aus
        // einer Kundenanfrage bei einem fremden Push-Dienst.
        try {
            Push::anPerson($userId);
        } catch (\Throwable $fehler) {
            error_log('[push] ' . $fehler->getMessage());
        }

        try {
            if (Telegram::eingerichtet()) {
                Telegram::anPerson($userId, $title, $body, $link);
            }
        } catch (\Throwable $fehler) {
            error_log('[telegram] ' . $fehler->getMessage());
        }

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
