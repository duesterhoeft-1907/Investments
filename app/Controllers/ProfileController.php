<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Bild;
use App\Core\Config;
use App\Core\Db;
use App\Core\Http;
use App\Core\Validator;
use App\Domain\Events;

/**
 * Das eigene Profil.
 *
 * Name, Titel, Telefonnummer, Farbe und Bild pflegt jede und jeder
 * selbst – das sind Angaben über die eigene Person, und wer sie ändern
 * will, soll nicht erst jemanden fragen müssen. Rolle, E-Mail-Adresse
 * und ob jemand überhaupt Zugang hat, bleiben in der Verwaltung: das
 * sind Entscheidungen über die Person, nicht von ihr.
 */
final class ProfileController
{
    private static function dir(): string
    {
        return STORAGE_DIR . '/uploads/avatars';
    }

    /** Was am Profilbild hängt: die öffentliche Adresse dazu. */
    public static function avatarUrl(?string $datei): ?string
    {
        $datei = (string) $datei;
        return $datei === '' ? null : '/api/avatars/' . rawurlencode($datei);
    }

    public static function update(): void
    {
        $me = Auth::requireStaff();

        $v = new Validator(Http::body());
        $v->text('name', 'deinen Namen', 2, 120)
          ->text('title', 'deine Funktion', 0, 120, false)
          ->text('phone', 'deine Telefonnummer', 0, 60, false)
          ->text('accent', 'deine Farbe', 0, 9, false);
        $clean = $v->orFail();

        // Die Farbe ist eine Farbe oder sie bleibt, wie sie war.
        $accent = preg_match('/^#[0-9a-fA-F]{6}$/', $clean['accent']) === 1
            ? strtoupper($clean['accent'])
            : (string) $me['accent'];

        Db::run(
            'UPDATE users SET name = :name, title = :title, phone = :phone, accent = :accent WHERE id = :id',
            [
                'name'   => $clean['name'],
                'title'  => $clean['title'],
                'phone'  => $clean['phone'],
                'accent' => $accent,
                'id'     => (int) $me['id'],
            ]
        );

        // Der Name steht an Dutzenden Stellen im CRM – offene Fenster
        // sollen ihn nicht bis zum naechsten Neuladen falsch zeigen.
        Events::toCompany('user:updated', ['userId' => (int) $me['id']]);

        Http::json(['user' => self::present((int) $me['id'])]);
    }

    /**
     * Profilbild hochladen.
     *
     * Wird beim Ablegen quadratisch zugeschnitten und auf 320 Pixel
     * gebracht – siehe App\Core\Bild. Ein altes Bild wird danach
     * geloescht; es hat keinen zweiten Verwendungszweck.
     */
    public static function avatar(): void
    {
        $me = Auth::requireStaff();

        $file = $_FILES['file'] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Http::error('Es kam keine Datei an.', 400);
        }

        $maxBytes = (int) Config::get('upload.max_mb', 25) * 1024 * 1024;
        if ((int) $file['size'] > $maxBytes) {
            Http::error('Das Bild ist zu groß (höchstens ' . Config::get('upload.max_mb') . ' MB).', 413);
        }

        // Dem gemeldeten Typ nicht vertrauen – selbst nachsehen.
        $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
            Http::error('Als Profilbild gehen JPEG, PNG, WebP und GIF – nicht ' . $mime . '.', 415);
        }

        try {
            $name = Bild::quadrat($file['tmp_name'], self::dir());
        } catch (\Throwable $e) {
            Http::error($e->getMessage(), 422);
        }

        $alt = (string) (Db::value('SELECT avatar_file FROM users WHERE id = :id', ['id' => (int) $me['id']]) ?? '');
        Db::run('UPDATE users SET avatar_file = :f WHERE id = :id', ['f' => $name, 'id' => (int) $me['id']]);

        if ($alt !== '' && is_file(self::dir() . '/' . $alt)) {
            @unlink(self::dir() . '/' . $alt);
        }

        Events::toCompany('user:updated', ['userId' => (int) $me['id']]);
        Http::json(['user' => self::present((int) $me['id'])]);
    }

    public static function removeAvatar(): void
    {
        $me = Auth::requireStaff();
        $alt = (string) (Db::value('SELECT avatar_file FROM users WHERE id = :id', ['id' => (int) $me['id']]) ?? '');

        Db::run("UPDATE users SET avatar_file = '' WHERE id = :id", ['id' => (int) $me['id']]);
        if ($alt !== '' && is_file(self::dir() . '/' . $alt)) {
            @unlink(self::dir() . '/' . $alt);
        }

        Events::toCompany('user:updated', ['userId' => (int) $me['id']]);
        Http::json(['user' => self::present((int) $me['id'])]);
    }

    /**
     * Profilbilder ausliefern – ohne Anmeldung.
     *
     * Sie erscheinen im Kundenbereich und in der Bestaetigungsmail; ein
     * Mailprogramm bringt keine Sitzung mit. Der Dateiname ist zufaellig
     * und damit nicht zu erraten, und ein Portraet des Beraters ist genau
     * das, was der Interessent sehen soll.
     */
    public static function serve(string $name): void
    {
        // Nur der reine Dateiname, keine Pfadanteile.
        if (preg_match('/^[a-f0-9]{32}\.webp$/', $name) !== 1) {
            Http::error('Nicht gefunden.', 404);
        }
        $pfad = self::dir() . '/' . $name;
        if (!is_file($pfad)) {
            Http::error('Nicht gefunden.', 404);
        }

        header('Content-Type: image/webp');
        header('Content-Length: ' . filesize($pfad));
        // Der Name aendert sich mit jedem neuen Bild, also darf lange
        // zwischengespeichert werden.
        header('Cache-Control: public, max-age=31536000, immutable');
        readfile($pfad);
        exit;
    }

    /** @return array<string,mixed> */
    public static function present(int $userId): array
    {
        $u = Db::one(
            'SELECT id, email, name, title, phone, role, accent, avatar_file, is_active,
                    away_until, away_note
               FROM users WHERE id = :id',
            ['id' => $userId]
        ) ?? [];

        return [
            'id'     => (int) ($u['id'] ?? 0),
            'email'  => $u['email'] ?? '',
            'name'   => $u['name'] ?? '',
            'title'  => $u['title'] ?? '',
            'phone'  => $u['phone'] ?? '',
            'role'   => $u['role'] ?? 'agent',
            'accent' => $u['accent'] ?? '#21B4A6',
            'avatar' => self::avatarUrl($u['avatar_file'] ?? ''),
        ];
    }
}
