<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Core\Validator;
use App\Domain\Leads;

final class AuthController
{
    public static function login(): void
    {
        $v = new Validator(Http::body());
        $v->text('email', 'die E-Mail-Adresse', 3, 190)->text('password', 'das Passwort', 1, 200);
        $clean = $v->orFail();

        $user = Db::one(
            'SELECT id, password_hash, is_active FROM users WHERE email = :email',
            ['email' => $clean['email']]
        );

        if ($user === null || (int) $user['is_active'] !== 1 || !Auth::verify($clean['password'], (string) $user['password_hash'])) {
            // Bewusst dieselbe Meldung für beide Fälle – sonst verrät die
            // Antwort, welche Adressen es gibt.
            Http::error('E-Mail oder Passwort stimmt nicht.', 401);
        }

        Auth::loginStaff((int) $user['id']);
        Db::run('UPDATE users SET last_seen_at = NOW() WHERE id = :id', ['id' => (int) $user['id']]);

        Http::json(['user' => self::profile((int) $user['id']), 'csrf' => Auth::csrfToken()]);
    }

    public static function logout(): void
    {
        Auth::logoutStaff();
        Http::json(['ok' => true]);
    }

    public static function me(): void
    {
        $user = Auth::user();
        if ($user === null) {
            Http::error('Nicht angemeldet.', 401);
        }
        Http::json(['user' => self::profile((int) $user['id']), 'csrf' => Auth::csrfToken()]);
    }

    public static function changePassword(): void
    {
        $me = Auth::requireStaff();
        $v = new Validator(Http::body());
        $v->text('currentPassword', 'das aktuelle Passwort', 1, 200)
          ->text('newPassword', 'das neue Passwort', 8, 200);
        $clean = $v->orFail();

        $hash = (string) Db::value('SELECT password_hash FROM users WHERE id = :id', ['id' => (int) $me['id']]);
        if (!Auth::verify($clean['currentPassword'], $hash)) {
            Http::error('Aktuelles Passwort stimmt nicht.', 400);
        }

        Db::run('UPDATE users SET password_hash = :h WHERE id = :id', [
            'h'  => Auth::hash($clean['newPassword']),
            'id' => (int) $me['id'],
        ]);
        Http::json(['ok' => true]);
    }

    public static function profile(int $userId): array
    {
        $user = Db::one(
            'SELECT id, email, name, title, phone, role, accent, last_seen_at FROM users WHERE id = :id',
            ['id' => $userId]
        );
        if ($user === null) {
            Http::error('Benutzer nicht gefunden.', 404);
        }

        $teams = Db::all(
            'SELECT t.id, t.slug, t.name, t.color, t.sla_minutes AS slaMinutes, tm.team_role AS teamRole
               FROM team_members tm JOIN teams t ON t.id = tm.team_id
              WHERE tm.user_id = :id ORDER BY t.sort_order, t.id',
            ['id' => $userId]
        );
        foreach ($teams as &$team) {
            $team['id'] = (int) $team['id'];
            $team['slaMinutes'] = (int) $team['slaMinutes'];
        }

        return [
            'id'         => (int) $user['id'],
            'email'      => $user['email'],
            'name'       => $user['name'],
            'title'      => $user['title'],
            'phone'      => $user['phone'],
            'role'       => $user['role'],
            'accent'     => $user['accent'],
            'avatar'     => ProfileController::avatarUrl($user['avatar_file'] ?? ''),
            'lastSeenAt' => Leads::iso($user['last_seen_at']),
            'teams'      => $teams,
        ];
    }
}
