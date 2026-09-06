<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Zwei getrennte Anmeldungen in einer Sitzung: Mitarbeitende ("staff") und
 * Interessenten im Kundenportal ("portal"). Beide liegen unter eigenen
 * Schlüsseln, damit ein Kundenlogin niemals CRM-Rechte erbt.
 *
 * Passwörter werden mit password_hash() gehasht (bcrypt) – das ist auf jedem
 * Hosting verfügbar, anders als Argon2, das eine Sodium-Erweiterung braucht.
 */
final class Auth
{
    private const STAFF = 'staff_user_id';
    private const PORTAL = 'portal_lead_id';
    private const CSRF = 'csrf_token';

    private static ?array $staffCache = null;

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        // Eigener Ablageort, damit Sitzungen nicht im gemeinsamen /tmp des
        // Shared Hostings liegen, wo andere Konten sie sehen könnten.
        $path = STORAGE_DIR . '/sessions';
        if (is_dir($path) && is_writable($path)) {
            session_save_path($path);
        }

        $https = (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';

        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_name('capital_sid');
        session_start();
    }

    public static function hash(string $plain): string
    {
        return password_hash($plain, PASSWORD_DEFAULT);
    }

    public static function verify(string $plain, string $hash): bool
    {
        return $hash !== '' && password_verify($plain, $hash);
    }

    // ── Mitarbeitende ──────────────────────────────────────────────────

    public static function loginStaff(int $userId): void
    {
        self::startSession();
        session_regenerate_id(true);        // gegen Session-Fixation
        $_SESSION[self::STAFF] = $userId;
        unset($_SESSION[self::CSRF]);
        self::$staffCache = null;
    }

    public static function logoutStaff(): void
    {
        self::startSession();
        unset($_SESSION[self::STAFF]);
        self::$staffCache = null;
    }

    /** @return array<string,mixed>|null */
    public static function user(): ?array
    {
        if (self::$staffCache !== null) {
            return self::$staffCache;
        }
        self::startSession();
        $id = $_SESSION[self::STAFF] ?? null;
        if (!is_int($id)) {
            return null;
        }
        $user = Db::one(
            'SELECT id, email, name, title, phone, role, accent FROM users WHERE id = :id AND is_active = 1',
            ['id' => $id]
        );
        if ($user === null) {
            unset($_SESSION[self::STAFF]);
            return null;
        }
        return self::$staffCache = $user;
    }

    public static function id(): ?int
    {
        $user = self::user();
        return $user === null ? null : (int) $user['id'];
    }

    /** Bricht mit 401 ab, wenn niemand angemeldet ist. */
    public static function requireStaff(): array
    {
        $user = self::user();
        if ($user === null) {
            Http::error('Nicht angemeldet.', 401);
        }
        return $user;
    }

    public static function requireRole(string ...$roles): array
    {
        $user = self::requireStaff();
        if (!in_array((string) $user['role'], $roles, true)) {
            Http::error('Dafür fehlen dir die Rechte.', 403);
        }
        return $user;
    }

    // ── Kundenportal ───────────────────────────────────────────────────

    public static function loginPortal(int $leadId): void
    {
        self::startSession();
        session_regenerate_id(true);
        $_SESSION[self::PORTAL] = $leadId;
    }

    public static function logoutPortal(): void
    {
        self::startSession();
        unset($_SESSION[self::PORTAL]);
    }

    public static function portalLeadId(): ?int
    {
        self::startSession();
        $id = $_SESSION[self::PORTAL] ?? null;
        return is_int($id) ? $id : null;
    }

    public static function requirePortal(): int
    {
        $id = self::portalLeadId();
        if ($id === null) {
            Http::error('Bitte melde dich in deinem Kundenbereich an.', 401);
        }
        return $id;
    }

    // ── CSRF ───────────────────────────────────────────────────────────

    public static function csrfToken(): string
    {
        self::startSession();
        if (!isset($_SESSION[self::CSRF]) || !is_string($_SESSION[self::CSRF])) {
            $_SESSION[self::CSRF] = bin2hex(random_bytes(32));
        }
        return $_SESSION[self::CSRF];
    }

    /**
     * Prüft den Token bei allen verändernden Aufrufen. Das Frontend schickt
     * ihn als Header X-CSRF-Token; er steckt nicht im Cookie, kann also von
     * einer fremden Seite nicht mitgesendet werden.
     */
    public static function requireCsrf(): void
    {
        if (in_array(Http::method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        self::startSession();
        $expected = $_SESSION[self::CSRF] ?? '';
        $given = Http::header('X-CSRF-Token') ?? (string) (Http::body()['_csrf'] ?? '');
        if (!is_string($expected) || $expected === '' || !hash_equals($expected, $given)) {
            Http::error('Sicherheits-Token fehlt oder ist abgelaufen. Bitte Seite neu laden.', 419);
        }
    }
}
