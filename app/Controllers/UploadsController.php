<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Db;
use App\Core\Http;
use App\Domain\Leads;

/** Dateien und Sprachnotizen. Liegen außerhalb des DocumentRoot. */
final class UploadsController
{
    private const ALLOWED = [
        'audio/webm'  => 'webm', 'video/webm' => 'webm', 'audio/ogg' => 'ogg',
        'audio/mpeg'  => 'mp3',  'audio/mp4'  => 'm4a',  'audio/x-m4a' => 'm4a',
        'audio/wav'   => 'wav',  'audio/wave' => 'wav',
        'application/pdf' => 'pdf',
        'image/png'   => 'png',  'image/jpeg' => 'jpg',  'image/webp' => 'webp',
        'text/plain'  => 'txt',  'text/csv'   => 'csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'       => 'xlsx',
    ];

    private static function dir(): string
    {
        return STORAGE_DIR . '/uploads';
    }

    public static function store(): void
    {
        $me = Auth::requireStaff();

        $file = $_FILES['file'] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Http::error(self::uploadErrorMessage((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE)), 400);
        }

        $maxBytes = (int) Config::get('upload.max_mb', 25) * 1024 * 1024;
        if ((int) $file['size'] > $maxBytes) {
            Http::error('Datei ist zu groß (höchstens ' . Config::get('upload.max_mb') . ' MB).', 413);
        }

        $leadId = (int) (Http::body()['leadId'] ?? 0);
        if ($leadId <= 0 || Db::value('SELECT 1 FROM leads WHERE id = :id', ['id' => $leadId]) === null) {
            Http::error('Lead nicht gefunden.', 404);
        }

        // Dem gemeldeten Typ nicht vertrauen – selbst bestimmen.
        $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        if (!isset(self::ALLOWED[$mime])) {
            Http::error('Dateityp ' . $mime . ' ist nicht erlaubt.', 415);
        }

        $body = Http::body();
        $kind = ($body['kind'] ?? 'file') === 'voice' ? 'voice' : 'file';
        $durationS = max(0, min(7200, (int) ($body['durationS'] ?? 0)));
        $note = mb_substr(trim((string) ($body['note'] ?? '')), 0, 2000);
        $visible = in_array($body['visibleToClient'] ?? false, [true, 1, '1', 'true'], true);

        $original = mb_substr((string) ($file['name'] ?? 'datei'), 0, 200);
        $storedName = bin2hex(random_bytes(16)) . '.' . self::ALLOWED[$mime];

        if (!is_dir(self::dir()) && !mkdir(self::dir(), 0775, true) && !is_dir(self::dir())) {
            Http::error('Ablageordner konnte nicht angelegt werden.', 500);
        }
        if (!move_uploaded_file($file['tmp_name'], self::dir() . '/' . $storedName)) {
            Http::error('Datei konnte nicht gespeichert werden.', 500);
        }

        $activityId = Leads::logActivity(
            $leadId,
            $kind === 'voice' ? 'voice_note' : 'system',
            $kind === 'voice' ? 'Sprachnotiz aufgenommen' : 'Datei hinzugefügt: ' . $original,
            (int) $me['id'],
            $note,
            durationS: $durationS,
            meta: ['filename' => $original, 'mime' => $mime],
        );

        $attachmentId = Db::insert(
            'INSERT INTO attachments (lead_id, activity_id, uploaded_by, kind, filename, stored_name,
                                      mime, size_bytes, duration_s, visible_to_client)
             VALUES (:lead, :activity, :user, :kind, :filename, :stored, :mime, :size, :duration, :visible)',
            [
                'lead'     => $leadId,
                'activity' => $activityId,
                'user'     => (int) $me['id'],
                'kind'     => $kind,
                'filename' => $original,
                'stored'   => $storedName,
                'mime'     => $mime,
                'size'     => (int) $file['size'],
                'duration' => $durationS,
                'visible'  => $visible ? 1 : 0,
            ]
        );

        $row = Db::one(
            'SELECT a.*, u.name AS uploaded_by_name FROM attachments a
               LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.id = :id',
            ['id' => $attachmentId]
        );

        Http::json([
            'attachment' => LeadsController::presentAttachment($row ?? []),
            'activityId' => $activityId,
        ], 201);
    }

    /**
     * Ausliefern. Die Dateien liegen bewusst außerhalb des DocumentRoot,
     * damit niemand sie durch Raten der Adresse abgreifen kann.
     */
    public static function serve(string $name): void
    {
        $isStaff = Auth::user() !== null;
        $portalLeadId = Auth::portalLeadId();
        if (!$isStaff && $portalLeadId === null) {
            Http::error('Nicht angemeldet.', 401);
        }

        if (preg_match('/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/', $name) !== 1) {
            Http::error('Ungültiger Dateiname.', 400);
        }

        $row = Db::one('SELECT * FROM attachments WHERE stored_name = :n', ['n' => $name]);
        if ($row === null) {
            Http::error('Datei nicht gefunden.', 404);
        }

        // Ein Kunde sieht nur, was für ihn freigegeben ist.
        if (!$isStaff && ((int) $row['lead_id'] !== $portalLeadId || (int) $row['visible_to_client'] !== 1)) {
            Http::error('Kein Zugriff auf diese Datei.', 403);
        }

        $path = self::dir() . '/' . $name;
        if (!is_file($path)) {
            Http::error('Datei nicht gefunden.', 404);
        }

        header('Content-Type: ' . $row['mime']);
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: inline; filename="' . rawurlencode((string) $row['filename']) . '"');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=3600');
        readfile($path);
        exit;
    }

    public static function transcript(string $id): void
    {
        Auth::requireStaff();
        $transcript = mb_substr(trim((string) (Http::body()['transcript'] ?? '')), 0, 20000);
        Db::run('UPDATE attachments SET transcript = :t WHERE id = :id', ['t' => $transcript, 'id' => (int) $id]);
        Http::json(['ok' => true]);
    }

    private static function uploadErrorMessage(int $code): string
    {
        return match ($code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Die Datei ist größer, als der Server erlaubt.',
            UPLOAD_ERR_PARTIAL   => 'Die Datei wurde nur teilweise übertragen.',
            UPLOAD_ERR_NO_FILE   => 'Keine Datei empfangen.',
            UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE => 'Der Server konnte die Datei nicht ablegen.',
            default              => 'Der Upload ist fehlgeschlagen.',
        };
    }
}
