<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Core\Validator;
use App\Domain\Events;
use App\Domain\Leads;
use App\Domain\Notify;

final class ChatController
{
    private const MESSAGE_SELECT = "
        SELECT m.*, u.name AS author_name, u.accent AS author_accent, u.avatar_file AS author_avatar, u.title AS author_title,
               CONCAT(l.first_name, ' ', l.last_name) AS lead_name, l.public_ref AS lead_ref
          FROM messages m
          LEFT JOIN users u ON u.id = m.user_id
          LEFT JOIN leads l ON l.id = m.lead_id";

    private static function assertMember(int $channelId, int $userId): void
    {
        $member = Db::value(
            'SELECT 1 FROM channel_members WHERE channel_id = :c AND user_id = :u',
            ['c' => $channelId, 'u' => $userId]
        );
        if ($member === null) {
            Http::error('Du bist kein Mitglied dieses Kanals.', 403);
        }
    }

    public static function channels(): void
    {
        $me = Auth::requireStaff();
        $userId = (int) $me['id'];

        $rows = Db::all(
            'SELECT c.id, c.slug, c.name, c.type, c.team_id, c.topic,
                    t.color AS team_color,
                    (SELECT COUNT(*) FROM messages m
                      WHERE m.channel_id = c.id AND m.created_at > cm.last_read_at
                        AND (m.user_id IS NULL OR m.user_id <> :me)) AS unread,
                    (SELECT m2.body FROM messages m2 WHERE m2.channel_id = c.id ORDER BY m2.id DESC LIMIT 1) AS last_body,
                    (SELECT m3.created_at FROM messages m3 WHERE m3.channel_id = c.id ORDER BY m3.id DESC LIMIT 1) AS last_at
               FROM channel_members cm
               JOIN channels c ON c.id = cm.channel_id
               LEFT JOIN teams t ON t.id = c.team_id
              WHERE cm.user_id = :me2
              ORDER BY FIELD(c.type, \'company\', \'team\', \'dm\'), c.name',
            ['me' => $userId, 'me2' => $userId]
        );

        $channels = [];
        $total = 0;
        foreach ($rows as $row) {
            $name = (string) $row['name'];
            $partner = null;

            // Eine Direktnachricht trägt den Namen des jeweils anderen.
            if ($row['type'] === 'dm') {
                $other = Db::one(
                    'SELECT u.id, u.name, u.accent, u.avatar_file FROM channel_members cm
                       JOIN users u ON u.id = cm.user_id
                      WHERE cm.channel_id = :c AND cm.user_id <> :me LIMIT 1',
                    ['c' => (int) $row['id'], 'me' => $userId]
                );
                if ($other !== null) {
                    $name = (string) $other['name'];
                    $partner = ['id' => (int) $other['id'], 'name' => $other['name'], 'accent' => $other['accent'],
                        'avatar' => \App\Controllers\ProfileController::avatarUrl($other['avatar_file'] ?? '')];
                }
            }

            $unread = (int) $row['unread'];
            $total += $unread;

            $channels[] = [
                'id'        => (int) $row['id'],
                'slug'      => $row['slug'],
                'name'      => $name,
                'type'      => $row['type'],
                'teamId'    => $row['team_id'] === null ? null : (int) $row['team_id'],
                'teamColor' => $row['team_color'],
                'topic'     => (string) $row['topic'],
                'unread'    => $unread,
                'lastBody'  => (string) ($row['last_body'] ?? ''),
                'lastAt'    => Leads::iso($row['last_at']),
                'partner'   => $partner,
            ];
        }

        Http::json(['channels' => $channels, 'totalUnread' => $total]);
    }

    public static function messages(string $id): void
    {
        $me = Auth::requireStaff();
        $channelId = (int) $id;
        self::assertMember($channelId, (int) $me['id']);

        $before = Http::queryInt('before');
        $limit = max(1, min(200, Http::queryInt('limit', 60)));

        $sql = self::MESSAGE_SELECT . ' WHERE m.channel_id = :c'
            . ($before > 0 ? ' AND m.id < :before' : '')
            . " ORDER BY m.id DESC LIMIT $limit";

        $params = ['c' => $channelId];
        if ($before > 0) {
            $params['before'] = $before;
        }

        $rows = array_reverse(Db::all($sql, $params));
        Http::json([
            'messages' => array_map([self::class, 'present'], $rows),
            'hasMore'  => count($rows) === $limit,
        ]);
    }

    public static function send(string $id): void
    {
        $me = Auth::requireStaff();
        $channelId = (int) $id;
        self::assertMember($channelId, (int) $me['id']);

        $v = new Validator(Http::body());
        $v->text('body', 'eine Nachricht', 1, 4000);
        $clean = $v->orFail();

        $messageId = Db::insert(
            "INSERT INTO messages (channel_id, user_id, body, kind) VALUES (:c, :u, :b, 'text')",
            ['c' => $channelId, 'u' => (int) $me['id'], 'b' => $clean['body']]
        );

        Db::run(
            'UPDATE channel_members SET last_read_at = NOW() WHERE channel_id = :c AND user_id = :u',
            ['c' => $channelId, 'u' => (int) $me['id']]
        );

        $message = self::present(Db::one(self::MESSAGE_SELECT . ' WHERE m.id = :id', ['id' => $messageId]) ?? []);
        Events::toChannel($channelId, 'chat:message', ['messageId' => $messageId, 'channelId' => $channelId]);

        // Direktnachrichten und @-Erwähnungen erzeugen eine Benachrichtigung.
        $channel = Db::one('SELECT name, type FROM channels WHERE id = :c', ['c' => $channelId]);
        $others = Db::all(
            'SELECT cm.user_id, u.name FROM channel_members cm
               JOIN users u ON u.id = cm.user_id
              WHERE cm.channel_id = :c AND cm.user_id <> :u',
            ['c' => $channelId, 'u' => (int) $me['id']]
        );

        preg_match_all('/@([\p{L}._-]+)/u', (string) $clean['body'], $matches);
        $mentions = array_map('mb_strtolower', $matches[1] ?? []);

        foreach ($others as $other) {
            $isMentioned = false;
            foreach ($mentions as $mention) {
                foreach (explode(' ', mb_strtolower((string) $other['name'])) as $part) {
                    if ($part !== '' && str_starts_with($part, $mention)) {
                        $isMentioned = true;
                        break 2;
                    }
                }
            }

            if (($channel['type'] ?? '') === 'dm' || $isMentioned) {
                Notify::send(
                    (int) $other['user_id'],
                    $isMentioned ? 'mention' : 'chat_message',
                    ($channel['type'] ?? '') === 'dm'
                        ? 'Nachricht von ' . $me['name']
                        : $me['name'] . ' hat dich erwähnt',
                    mb_substr((string) $clean['body'], 0, 160),
                    '/app/chat/' . $channelId,
                );
            }
        }

        Http::json(['message' => $message], 201);
    }

    public static function markRead(string $id): void
    {
        $me = Auth::requireStaff();
        $channelId = (int) $id;
        self::assertMember($channelId, (int) $me['id']);
        Db::run(
            'UPDATE channel_members SET last_read_at = NOW() WHERE channel_id = :c AND user_id = :u',
            ['c' => $channelId, 'u' => (int) $me['id']]
        );
        Http::json(['ok' => true]);
    }

    /** Direktnachricht öffnen – bestehenden Kanal wiederverwenden. */
    public static function openDirect(string $userId): void
    {
        $me = Auth::requireStaff();
        $otherId = (int) $userId;
        $myId = (int) $me['id'];

        if ($otherId === $myId) {
            Http::error('Du kannst dir nicht selbst schreiben.', 400);
        }

        $other = Db::one('SELECT id, name FROM users WHERE id = :id AND is_active = 1', ['id' => $otherId]);
        if ($other === null) {
            Http::error('Benutzer nicht gefunden.', 404);
        }

        $existing = Db::value(
            "SELECT c.id FROM channels c
              WHERE c.type = 'dm'
                AND (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) = 2
                AND EXISTS (SELECT 1 FROM channel_members a WHERE a.channel_id = c.id AND a.user_id = :me)
                AND EXISTS (SELECT 1 FROM channel_members b WHERE b.channel_id = c.id AND b.user_id = :other)
              LIMIT 1",
            ['me' => $myId, 'other' => $otherId]
        );

        if ($existing !== null) {
            Http::json(['channelId' => (int) $existing]);
        }

        $channelId = Db::transaction(static function () use ($other, $myId, $otherId): int {
            $id = Db::insert(
                "INSERT INTO channels (slug, name, type, created_by) VALUES (NULL, :name, 'dm', :me)",
                ['name' => $other['name'], 'me' => $myId]
            );
            Db::run('INSERT INTO channel_members (channel_id, user_id) VALUES (:c, :u)', ['c' => $id, 'u' => $myId]);
            Db::run('INSERT INTO channel_members (channel_id, user_id) VALUES (:c, :u)', ['c' => $id, 'u' => $otherId]);
            return $id;
        });

        Events::toUser($otherId, 'chat:channel', ['channelId' => $channelId]);
        Http::json(['channelId' => $channelId], 201);
    }

    public static function present(array $m): array
    {
        if ($m === []) {
            return [];
        }
        return [
            'id'        => (int) $m['id'],
            'channelId' => (int) $m['channel_id'],
            'body'      => $m['body'],
            'kind'      => $m['kind'],
            'leadId'    => $m['lead_id'] === null ? null : (int) $m['lead_id'],
            'leadName'  => $m['lead_name'] ?? null,
            'leadRef'   => $m['lead_ref'] ?? null,
            'meta'      => $m['meta'] === null ? [] : (json_decode((string) $m['meta'], true) ?: []),
            'author'    => ($m['user_id'] ?? null) === null ? null : [
                'id'     => (int) $m['user_id'],
                'name'   => $m['author_name'] ?? '',
                'accent' => $m['author_accent'] ?? '#21b4a6',
                'avatar' => ProfileController::avatarUrl($m['author_avatar'] ?? ''),
                'title'  => $m['author_title'] ?? '',
            ],
            'createdAt' => Leads::iso($m['created_at']),
        ];
    }
}
