<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Domain\Leads;
use App\Domain\Notify;

final class NotificationsController
{
    public static function index(): void
    {
        $me = Auth::requireStaff();
        $limit = max(1, min(100, Http::queryInt('limit', 40)));

        $rows = Db::all(
            "SELECT * FROM notifications WHERE user_id = :u ORDER BY id DESC LIMIT $limit",
            ['u' => (int) $me['id']]
        );

        Http::json([
            'notifications' => array_map(static fn (array $n): array => [
                'id'        => (int) $n['id'],
                'type'      => $n['type'],
                'title'     => $n['title'],
                'body'      => $n['body'],
                'link'      => $n['link'],
                'leadId'    => $n['lead_id'] === null ? null : (int) $n['lead_id'],
                'urgency'   => $n['urgency'],
                'isRead'    => (bool) $n['is_read'],
                'createdAt' => Leads::iso($n['created_at']),
            ], $rows),
            'unread' => Notify::unreadCount((int) $me['id']),
        ]);
    }

    public static function markRead(string $id): void
    {
        $me = Auth::requireStaff();
        Db::run(
            'UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :u',
            ['id' => (int) $id, 'u' => (int) $me['id']]
        );
        Http::json(['ok' => true, 'unread' => Notify::unreadCount((int) $me['id'])]);
    }

    public static function markAllRead(): void
    {
        $me = Auth::requireStaff();
        Db::run('UPDATE notifications SET is_read = 1 WHERE user_id = :u AND is_read = 0', ['u' => (int) $me['id']]);
        Http::json(['ok' => true, 'unread' => 0]);
    }

    /** Postausgang – auch ohne SMTP nachvollziehbar, was rausgegangen wäre. */
    public static function outbox(): void
    {
        Auth::requireStaff();
        $rows = Db::all(
            "SELECT e.*, CONCAT(l.first_name, ' ', l.last_name) AS lead_name, l.public_ref AS lead_ref
               FROM email_log e LEFT JOIN leads l ON l.id = e.lead_id
              ORDER BY e.id DESC LIMIT 100"
        );

        Http::json([
            'emails' => array_map(static fn (array $e): array => [
                'id'        => (int) $e['id'],
                'to'        => $e['to_address'],
                'subject'   => $e['subject'],
                'template'  => $e['template'],
                'status'    => $e['status'],
                'error'     => $e['error'],
                'preview'   => (string) ($e['preview'] ?? ''),
                'leadId'    => $e['lead_id'] === null ? null : (int) $e['lead_id'],
                'leadName'  => $e['lead_name'],
                'leadRef'   => $e['lead_ref'],
                'createdAt' => Leads::iso($e['created_at']),
            ], $rows),
        ]);
    }
}
