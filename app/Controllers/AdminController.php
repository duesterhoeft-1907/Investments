<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Domain\Events;
use App\Domain\Hours;
use App\Domain\Leads;

/**
 * Verwaltung: Ruhezeiten und Mitarbeiter.
 *
 * Getrennt vom Directory, weil hier geschrieben wird, was das Verhalten der
 * ganzen Anwendung aendert – Fristen und Zugaenge. Lesen darf jeder im Haus,
 * aendern nur Leitung und Verwaltung.
 */
final class AdminController
{
    private const ROLES = ['admin', 'manager', 'agent'];

    // ── Ruhezeiten ─────────────────────────────────────────────────────

    public static function hours(): void
    {
        Auth::requireStaff();
        Http::json(['hours' => Hours::summary()]);
    }

    public static function saveHours(): void
    {
        Auth::requireRole('admin', 'manager');
        $body = Http::body();

        $config = Hours::save([
            'enabled'     => (bool) ($body['enabled'] ?? true),
            'timezone'    => (string) ($body['timezone'] ?? 'Europe/Berlin'),
            'days'        => (array) ($body['days'] ?? []),
            'closedDates' => (array) ($body['closedDates'] ?? []),
        ]);

        // Alle offenen CRM-Fenster sollen die neue Regel sofort sehen.
        Events::toCompany('settings:hours', ['enabled' => $config['enabled']]);

        Http::json(['hours' => Hours::summary()]);
    }

    // ── Mitarbeiter ────────────────────────────────────────────────────

    /** Vollstaendige Liste, auch die deaktivierten – anders als im Directory. */
    public static function staff(): void
    {
        Auth::requireRole('admin', 'manager');

        $rows = Db::all(
            'SELECT id, email, name, title, phone, role, accent, is_active, away_until, away_note, last_seen_at
               FROM users ORDER BY is_active DESC, name'
        );

        Http::json([
            'staff' => array_map(static fn (array $r): array => self::present($r), $rows),
            'teams' => Db::all('SELECT id, name, color FROM teams ORDER BY sort_order, id'),
            'roles' => self::ROLES,
        ]);
    }

    public static function createStaff(): void
    {
        Auth::requireRole('admin');
        $body = Http::body();

        $email = mb_strtolower(trim((string) ($body['email'] ?? '')));
        $name  = trim((string) ($body['name'] ?? ''));

        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            Http::error('Bitte eine gültige E-Mail-Adresse angeben.', 422);
        }
        if ($name === '') {
            Http::error('Bitte einen Namen angeben.', 422);
        }
        if (Db::value('SELECT 1 FROM users WHERE email = :e', ['e' => $email]) !== null) {
            Http::error('Diese Adresse ist bereits vergeben.', 409);
        }

        $password = (string) ($body['password'] ?? '');
        if (mb_strlen($password) < 10) {
            Http::error('Das Passwort braucht mindestens 10 Zeichen.', 422);
        }

        $id = Db::insert(
            'INSERT INTO users (email, password_hash, name, title, phone, role, accent, is_active)
             VALUES (:email, :hash, :name, :title, :phone, :role, :accent, 1)',
            [
                'email'  => $email,
                'hash'   => Auth::hash($password),
                'name'   => $name,
                'title'  => mb_substr(trim((string) ($body['title'] ?? '')), 0, 120),
                'phone'  => mb_substr(trim((string) ($body['phone'] ?? '')), 0, 60),
                'role'   => self::role($body['role'] ?? 'agent'),
                'accent' => self::accent($body['accent'] ?? null),
            ]
        );

        self::syncTeams($id, $body['teamIds'] ?? null);

        Http::json(['staff' => self::one($id)], 201);
    }

    public static function updateStaff(string $id): void
    {
        $actor  = Auth::requireRole('admin', 'manager');
        $userId = (int) $id;

        $row = Db::one('SELECT id, role, is_active FROM users WHERE id = :id', ['id' => $userId]);
        if ($row === null) {
            Http::error('Konto nicht gefunden.', 404);
        }

        $body    = Http::body();
        $isAdmin = $actor['role'] === 'admin';
        $sets    = [];
        $params  = ['id' => $userId];

        foreach (['name' => 120, 'title' => 120, 'phone' => 60] as $field => $limit) {
            if (isset($body[$field])) {
                $sets[] = "$field = :$field";
                $params[$field] = mb_substr(trim((string) $body[$field]), 0, $limit);
            }
        }
        if (isset($body['accent'])) {
            $sets[] = 'accent = :accent';
            $params['accent'] = self::accent($body['accent']);
        }

        // Rolle, Zugang und Passwort sind der Verwaltung vorbehalten.
        if (isset($body['role'])) {
            if (!$isAdmin) {
                Http::error('Die Rolle darf nur die Verwaltung ändern.', 403);
            }
            $sets[] = 'role = :role';
            $params['role'] = self::role($body['role']);
        }
        if (isset($body['isActive'])) {
            if (!$isAdmin) {
                Http::error('Zugänge darf nur die Verwaltung sperren.', 403);
            }
            $active = (bool) $body['isActive'];
            if (!$active && $userId === (int) $actor['id']) {
                Http::error('Der eigene Zugang lässt sich nicht sperren.', 422);
            }
            if (!$active && self::lastAdmin($userId)) {
                Http::error('Das ist der letzte aktive Zugang der Verwaltung.', 422);
            }
            $sets[] = 'is_active = :active';
            $params['active'] = $active ? 1 : 0;
        }
        if (isset($body['password']) && (string) $body['password'] !== '') {
            if (!$isAdmin) {
                Http::error('Passwörter setzt nur die Verwaltung zurück.', 403);
            }
            if (mb_strlen((string) $body['password']) < 10) {
                Http::error('Das Passwort braucht mindestens 10 Zeichen.', 422);
            }
            $sets[] = 'password_hash = :hash';
            $params['hash'] = Auth::hash((string) $body['password']);
        }

        // Die letzte Verwaltung darf sich nicht selbst degradieren.
        if (isset($params['role']) && $params['role'] !== 'admin' && self::lastAdmin($userId)) {
            Http::error('Das ist der letzte Zugang der Verwaltung.', 422);
        }

        if ($sets !== []) {
            Db::run('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        }
        if (array_key_exists('teamIds', $body)) {
            self::syncTeams($userId, $body['teamIds']);
        }

        Http::json(['staff' => self::one($userId)]);
    }

    // ── Abwesenheit ────────────────────────────────────────────────────

    /**
     * Wer abwesend ist, bekommt keine neuen Leads zugeteilt. Das darf jeder
     * fuer sich selbst setzen; die Verwaltung auch fuer andere, damit ein
     * spontaner Ausfall nicht zum Sitzenbleiben von Anfragen fuehrt.
     */
    public static function setAway(string $id): void
    {
        $actor  = Auth::requireStaff();
        $userId = (int) $id;

        if ($userId !== (int) $actor['id'] && !in_array($actor['role'], ['admin', 'manager'], true)) {
            Http::error('Das darfst du nur für dich selbst setzen.', 403);
        }
        if (Db::value('SELECT 1 FROM users WHERE id = :id', ['id' => $userId]) === null) {
            Http::error('Konto nicht gefunden.', 404);
        }

        $body  = Http::body();
        $until = $body['until'] ?? null;

        if ($until === null || $until === '') {
            Db::run("UPDATE users SET away_until = NULL, away_note = '' WHERE id = :id", ['id' => $userId]);
            Http::json(['staff' => self::one($userId)]);
        }

        $stamp = strtotime((string) $until);
        if ($stamp === false) {
            Http::error('Der Zeitpunkt ließ sich nicht lesen.', 422);
        }

        Db::run(
            'UPDATE users SET away_until = :until, away_note = :note WHERE id = :id',
            [
                'until' => gmdate('Y-m-d H:i:s', $stamp),
                'note'  => mb_substr(trim((string) ($body['note'] ?? '')), 0, 160),
                'id'    => $userId,
            ]
        );

        Http::json(['staff' => self::one($userId)]);
    }

    // ── Zuordnung Mitarbeiter ↔ Fachgruppe (n:n) ───────────────────────

    /**
     * Ein Mitarbeiter kann in mehreren Gruppen sein – Zuordnen heisst
     * hinzufuegen, nicht verschieben. Wer aus einer Gruppe heraus soll,
     * wird ausdruecklich entfernt.
     */
    public static function addMember(string $teamId, string $userId): void
    {
        Auth::requireRole('admin', 'manager');
        [$team, $user] = self::pair($teamId, $userId);

        Db::run(
            "INSERT IGNORE INTO team_members (team_id, user_id, team_role) VALUES (:t, :u, 'member')",
            ['t' => $team, 'u' => $user]
        );
        Events::toCompany('directory:changed', ['teamId' => $team]);
        Http::json(['ok' => true]);
    }

    public static function removeMember(string $teamId, string $userId): void
    {
        Auth::requireRole('admin', 'manager');
        [$team, $user] = self::pair($teamId, $userId);

        // Die letzte Person aus einer Gruppe zu nehmen hiesse, Anfragen ins
        // Leere zu routen – die Gruppe haette niemanden mehr zu alarmieren.
        $remaining = (int) Db::value(
            'SELECT COUNT(*) FROM team_members tm JOIN users u ON u.id = tm.user_id
              WHERE tm.team_id = :t AND u.is_active = 1 AND tm.user_id <> :u',
            ['t' => $team, 'u' => $user]
        );
        if ($remaining === 0) {
            Http::error('Das ist die letzte Person in dieser Fachgruppe. Erst jemanden zuordnen.', 422);
        }

        Db::run('DELETE FROM team_members WHERE team_id = :t AND user_id = :u', ['t' => $team, 'u' => $user]);
        Events::toCompany('directory:changed', ['teamId' => $team]);
        Http::json(['ok' => true]);
    }

    /** @return array{0:int,1:int} */
    private static function pair(string $teamId, string $userId): array
    {
        $team = (int) $teamId;
        $user = (int) $userId;

        if (Db::value('SELECT 1 FROM teams WHERE id = :id', ['id' => $team]) === null) {
            Http::error('Fachgruppe nicht gefunden.', 404);
        }
        if (Db::value('SELECT 1 FROM users WHERE id = :id', ['id' => $user]) === null) {
            Http::error('Konto nicht gefunden.', 404);
        }
        return [$team, $user];
    }

    // ── Fachgebiete ────────────────────────────────────────────────────

    public static function createAssetClass(): void
    {
        Auth::requireRole('admin', 'manager');
        $body = Http::body();

        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Http::error('Bitte einen Namen angeben.', 422);
        }

        $slug = self::slug($body['slug'] ?? $name);
        if ($slug === '') {
            Http::error('Aus dem Namen liess sich kein Kürzel bilden. Bitte eines angeben.', 422);
        }
        if (Db::value('SELECT 1 FROM asset_classes WHERE slug = :s', ['s' => $slug]) !== null) {
            Http::error('Dieses Kürzel ist schon vergeben.', 409);
        }

        $teamId = ($body['teamId'] ?? null) === null || $body['teamId'] === '' ? null : (int) $body['teamId'];
        if ($teamId !== null && Db::value('SELECT 1 FROM teams WHERE id = :id', ['id' => $teamId]) === null) {
            Http::error('Fachgruppe nicht gefunden.', 404);
        }

        $next = (int) Db::value('SELECT COALESCE(MAX(sort_order), 0) + 10 FROM asset_classes');

        $id = Db::insert(
            'INSERT INTO asset_classes (slug, name, tagline, description, icon, team_id, sort_order, is_active)
             VALUES (:slug, :name, :tagline, :description, :icon, :team, :sort, 1)',
            [
                'slug'        => $slug,
                'name'        => mb_substr($name, 0, 120),
                'tagline'     => mb_substr(trim((string) ($body['tagline'] ?? '')), 0, 190),
                'description' => mb_substr(trim((string) ($body['description'] ?? '')), 0, 500),
                'icon'        => mb_substr(trim((string) ($body['icon'] ?? 'coins')), 0, 40),
                'team'        => $teamId,
                'sort'        => $next,
            ]
        );

        Events::toCompany('directory:changed', ['assetClassId' => $id]);
        Http::json(['assetClass' => self::assetClass($id)], 201);
    }

    public static function updateAssetClass(string $id): void
    {
        Auth::requireRole('admin', 'manager');
        $assetId = (int) $id;

        if (Db::value('SELECT 1 FROM asset_classes WHERE id = :id', ['id' => $assetId]) === null) {
            Http::error('Fachgebiet nicht gefunden.', 404);
        }

        $body   = Http::body();
        $sets   = [];
        $params = ['id' => $assetId];

        foreach (['name' => 120, 'tagline' => 190, 'description' => 500, 'icon' => 40] as $field => $limit) {
            if (isset($body[$field])) {
                $sets[] = "$field = :$field";
                $params[$field] = mb_substr(trim((string) $body[$field]), 0, $limit);
            }
        }
        if (array_key_exists('teamId', $body)) {
            $teamId = $body['teamId'] === null || $body['teamId'] === '' ? null : (int) $body['teamId'];
            if ($teamId !== null && Db::value('SELECT 1 FROM teams WHERE id = :id', ['id' => $teamId]) === null) {
                Http::error('Fachgruppe nicht gefunden.', 404);
            }
            $sets[] = 'team_id = :team';
            $params['team'] = $teamId;
        }
        if (isset($body['sortOrder'])) {
            $sets[] = 'sort_order = :sort';
            $params['sort'] = max(0, min(32000, (int) $body['sortOrder']));
        }
        if (isset($body['isActive'])) {
            $sets[] = 'is_active = :active';
            $params['active'] = $body['isActive'] ? 1 : 0;
        }

        if ($sets !== []) {
            Db::run('UPDATE asset_classes SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        }

        Events::toCompany('directory:changed', ['assetClassId' => $assetId]);
        Http::json(['assetClass' => self::assetClass($assetId)]);
    }

    /**
     * Fachgebiete werden nie geloescht, nur stillgelegt: an ihnen haengen
     * Leads, und ein Verlauf mit leerer Stelle ist kein Verlauf mehr.
     */
    public static function retireAssetClass(string $id): void
    {
        Auth::requireRole('admin', 'manager');
        $assetId = (int) $id;

        if (Db::value('SELECT 1 FROM asset_classes WHERE id = :id', ['id' => $assetId]) === null) {
            Http::error('Fachgebiet nicht gefunden.', 404);
        }

        $leads = (int) Db::value('SELECT COUNT(*) FROM leads WHERE asset_class_id = :id', ['id' => $assetId]);
        Db::run('UPDATE asset_classes SET is_active = 0 WHERE id = :id', ['id' => $assetId]);

        Events::toCompany('directory:changed', ['assetClassId' => $assetId]);
        Http::json(['ok' => true, 'leads' => $leads]);
    }

    private static function assetClass(int $id): array
    {
        $row = Db::one(
            'SELECT ac.*, t.name AS team_name, t.color AS team_color
               FROM asset_classes ac LEFT JOIN teams t ON t.id = ac.team_id
              WHERE ac.id = :id',
            ['id' => $id]
        );
        if ($row === null) {
            return [];
        }
        return [
            'id'          => (int) $row['id'],
            'slug'        => $row['slug'],
            'name'        => $row['name'],
            'tagline'     => $row['tagline'],
            'description' => $row['description'],
            'icon'        => $row['icon'],
            'teamId'      => $row['team_id'] === null ? null : (int) $row['team_id'],
            'teamName'    => $row['team_name'],
            'teamColor'   => $row['team_color'],
            'sortOrder'   => (int) $row['sort_order'],
            'isActive'    => (bool) $row['is_active'],
        ];
    }

    /** Aus dem Namen ein Kuerzel bilden, das in eine URL passt. */
    private static function slug(mixed $value): string
    {
        $slug = mb_strtolower(trim((string) $value));
        $slug = strtr($slug, ['ä' => 'ae', 'ö' => 'oe', 'ü' => 'ue', 'ß' => 'ss']);
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? '';
        return mb_substr(trim($slug, '-'), 0, 60);
    }

    // ── Hilfen ─────────────────────────────────────────────────────────

    private static function one(int $id): array
    {
        $row = Db::one(
            'SELECT id, email, name, title, phone, role, accent, is_active, away_until, away_note, last_seen_at
               FROM users WHERE id = :id',
            ['id' => $id]
        );
        return $row === null ? [] : self::present($row);
    }

    private static function present(array $row): array
    {
        $id = (int) $row['id'];
        $awayUntil = $row['away_until'];

        return [
            'id'         => $id,
            'email'      => $row['email'],
            'name'       => $row['name'],
            'title'      => $row['title'],
            'phone'      => $row['phone'],
            'role'       => $row['role'],
            'accent'     => $row['accent'],
            'isActive'   => (bool) $row['is_active'],
            'awayUntil'  => Leads::iso($awayUntil),
            'awayNote'   => $row['away_note'] ?? '',
            'isAway'     => $awayUntil !== null && strtotime((string) $awayUntil) > time(),
            'lastSeenAt' => Leads::iso($row['last_seen_at']),
            'teamIds'    => array_map(
                static fn (array $t): int => (int) $t['team_id'],
                Db::all('SELECT team_id FROM team_members WHERE user_id = :u', ['u' => $id])
            ),
        ];
    }

    private static function role(mixed $role): string
    {
        $role = (string) $role;
        return in_array($role, self::ROLES, true) ? $role : 'agent';
    }

    private static function accent(mixed $accent): string
    {
        $accent = (string) $accent;
        return preg_match('/^#[0-9a-fA-F]{6}$/', $accent) === 1 ? $accent : '#21b4a6';
    }

    /** Waere das der letzte aktive Zugang mit Verwaltungsrechten? */
    private static function lastAdmin(int $userId): bool
    {
        $isAdmin = Db::value(
            "SELECT 1 FROM users WHERE id = :id AND role = 'admin' AND is_active = 1",
            ['id' => $userId]
        );
        if ($isAdmin === null) {
            return false;
        }
        return (int) Db::value(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1 AND id <> :id",
            ['id' => $userId]
        ) === 0;
    }

    /** Gruppenzugehoerigkeit auf genau die uebergebene Liste bringen. */
    private static function syncTeams(int $userId, mixed $teamIds): void
    {
        if (!is_array($teamIds)) {
            return;
        }
        $wanted = [];
        foreach ($teamIds as $teamId) {
            $teamId = (int) $teamId;
            if ($teamId > 0 && Db::value('SELECT 1 FROM teams WHERE id = :id', ['id' => $teamId]) !== null) {
                $wanted[$teamId] = true;
            }
        }

        Db::transaction(static function () use ($userId, $wanted): void {
            Db::run('DELETE FROM team_members WHERE user_id = :u', ['u' => $userId]);
            foreach (array_keys($wanted) as $teamId) {
                Db::run(
                    "INSERT INTO team_members (team_id, user_id, team_role) VALUES (:t, :u, 'member')",
                    ['t' => $teamId, 'u' => $userId]
                );
            }
        });
    }
}
