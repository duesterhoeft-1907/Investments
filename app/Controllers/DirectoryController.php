<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Domain\Leads;

/** Kolleginnen und Kollegen, Fachgruppen und die Routing-Matrix. */
final class DirectoryController
{
    public static function users(): void
    {
        Auth::requireStaff();
        $online = array_flip(EventsController::onlineUserIds());

        $rows = Db::all(
            'SELECT id, email, name, title, phone, role, accent, last_seen_at
               FROM users WHERE is_active = 1 ORDER BY name'
        );

        $users = [];
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $users[] = [
                'id'         => $id,
                'email'      => $row['email'],
                'name'       => $row['name'],
                'title'      => $row['title'],
                'phone'      => $row['phone'],
                'role'       => $row['role'],
                'accent'     => $row['accent'],
                'avatar'     => ProfileController::avatarUrl($row['avatar_file'] ?? ''),
                'online'     => isset($online[$id]),
                'lastSeenAt' => Leads::iso($row['last_seen_at']),
                'teams'      => array_map(
                    static fn (array $t): array => ['id' => (int) $t['id'], 'name' => $t['name'], 'color' => $t['color']],
                    Db::all(
                        'SELECT t.id, t.name, t.color FROM team_members tm
                           JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = :u ORDER BY t.sort_order',
                        ['u' => $id]
                    )
                ),
            ];
        }

        Http::json(['users' => $users]);
    }

    public static function teams(): void
    {
        Auth::requireStaff();
        $rows = Db::all(
            "SELECT t.*,
                    (SELECT COUNT(*) FROM leads l WHERE l.team_id = t.id) AS lead_count,
                    (SELECT COUNT(*) FROM leads l WHERE l.team_id = t.id AND l.first_contact_at IS NULL
                        AND l.status NOT IN ('won','lost')) AS awaiting
               FROM teams t ORDER BY t.sort_order, t.id"
        );

        $teams = [];
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $teams[] = [
                'id'           => $id,
                'slug'         => $row['slug'],
                'name'         => $row['name'],
                'description'  => $row['description'],
                'color'        => $row['color'],
                'slaMinutes'   => (int) $row['sla_minutes'],
                'leadCount'    => (int) $row['lead_count'],
                'awaiting'     => (int) $row['awaiting'],
                'members'      => array_map(
                    static fn (array $m): array => [
                        'id'       => (int) $m['id'],
                        'name'     => $m['name'],
                        'title'    => $m['title'],
                        'accent'   => $m['accent'],
                        'avatar'   => ProfileController::avatarUrl($m['avatar_file'] ?? ''),
                        'teamRole' => $m['teamRole'],
                    ],
                    Db::all(
                        'SELECT u.id, u.name, u.title, u.accent, u.avatar_file, tm.team_role AS teamRole
                           FROM team_members tm JOIN users u ON u.id = tm.user_id
                          WHERE tm.team_id = :t AND u.is_active = 1 ORDER BY u.name',
                        ['t' => $id]
                    )
                ),
                'assetClasses' => array_map(
                    static fn (array $a): array => ['id' => (int) $a['id'], 'slug' => $a['slug'], 'name' => $a['name']],
                    Db::all('SELECT id, slug, name FROM asset_classes WHERE team_id = :t ORDER BY sort_order', ['t' => $id])
                ),
            ];
        }

        Http::json(['teams' => $teams]);
    }

    public static function assetClasses(): void
    {
        Auth::requireStaff();
        $rows = Db::all(
            'SELECT ac.*, t.name AS team_name, t.color AS team_color
               FROM asset_classes ac LEFT JOIN teams t ON t.id = ac.team_id
              ORDER BY ac.sort_order, ac.id'
        );

        Http::json([
            'assetClasses' => array_map(static fn (array $a): array => [
                'id'        => (int) $a['id'],
                'slug'      => $a['slug'],
                'name'      => $a['name'],
                'tagline'   => $a['tagline'],
                'icon'      => $a['icon'],
                'teamId'    => $a['team_id'] === null ? null : (int) $a['team_id'],
                'teamName'  => $a['team_name'],
                'teamColor' => $a['team_color'],
                'isActive'  => (bool) $a['is_active'],
            ], $rows),
        ]);
    }

    /** Ein Fachgebiet einer anderen Gruppe zuordnen – ändert das Routing. */
    public static function routeAssetClass(string $id): void
    {
        Auth::requireRole('admin', 'manager');
        $assetId = (int) $id;

        if (Db::value('SELECT 1 FROM asset_classes WHERE id = :id', ['id' => $assetId]) === null) {
            Http::error('Fachgebiet nicht gefunden.', 404);
        }

        $body = Http::body();
        $teamId = ($body['teamId'] ?? null) === null || $body['teamId'] === '' ? null : (int) $body['teamId'];

        if ($teamId !== null && Db::value('SELECT 1 FROM teams WHERE id = :id', ['id' => $teamId]) === null) {
            Http::error('Fachgruppe nicht gefunden.', 404);
        }

        Db::run('UPDATE asset_classes SET team_id = :team WHERE id = :id', ['team' => $teamId, 'id' => $assetId]);
        Http::json(['ok' => true]);
    }

    public static function updateTeam(string $id): void
    {
        Auth::requireRole('admin', 'manager');
        $teamId = (int) $id;
        $body = Http::body();

        $sets = [];
        $params = ['id' => $teamId];

        if (isset($body['slaMinutes'])) {
            $sets[] = 'sla_minutes = :sla';
            $params['sla'] = max(1, min(1440, (int) $body['slaMinutes']));
        }
        if (isset($body['description'])) {
            $sets[] = 'description = :description';
            $params['description'] = mb_substr(trim((string) $body['description']), 0, 400);
        }
        if (isset($body['color']) && preg_match('/^#[0-9a-fA-F]{6}$/', (string) $body['color']) === 1) {
            $sets[] = 'color = :color';
            $params['color'] = $body['color'];
        }

        if ($sets !== []) {
            Db::run('UPDATE teams SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        }
        Http::json(['ok' => true]);
    }
}
