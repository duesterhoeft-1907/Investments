<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Core\Validator;
use App\Domain\Events;
use App\Domain\Leads;

final class ActivitiesController
{
    private const TYPES = ['note', 'call', 'email', 'meeting', 'whatsapp', 'voice_note', 'system'];

    private const DEFAULT_TITLES = [
        'note'       => 'Notiz',
        'call'       => 'Anruf',
        'email'      => 'E-Mail',
        'meeting'    => 'Termin',
        'whatsapp'   => 'WhatsApp-Nachricht',
        'voice_note' => 'Sprachnotiz',
        'system'     => 'Systemeintrag',
    ];

    public static function store(): void
    {
        $me = Auth::requireStaff();
        $v = new Validator(Http::body());
        $v->int('leadId', 1, PHP_INT_MAX, 0, true)
          ->choice('type', self::TYPES, 'eine Art', false, 'note')
          ->text('title', 'den Titel', 0, 200, false)
          ->text('body', 'den Text', 0, 10000, false)
          ->text('outcome', 'das Ergebnis', 0, 40, false)
          ->choice('direction', ['inbound', 'outbound'], 'die Richtung', false, '')
          ->int('durationS', 0, 86400)
          ->bool('countsAsContact');
        $clean = $v->orFail();

        $leadId = (int) $clean['leadId'];
        $lead = Leads::find($leadId);
        if ($lead === null) {
            Http::error('Lead nicht gefunden.', 404);
        }

        // Ein Anruf, eine Mail oder ein Termin ist die Kontaktaufnahme –
        // die Reaktionsuhr stoppt dadurch automatisch.
        $isContactChannel = in_array($clean['type'], ['call', 'email', 'meeting', 'whatsapp'], true);
        $responseSeconds = null;
        if (($clean['countsAsContact'] || $isContactChannel) && $lead['first_contact_at'] === null) {
            $responseSeconds = Leads::markFirstContact($leadId, (int) $me['id']);
        }

        $activityId = Leads::logActivity(
            $leadId,
            (string) $clean['type'],
            $clean['title'] !== '' ? (string) $clean['title'] : (self::DEFAULT_TITLES[$clean['type']] ?? 'Eintrag'),
            (int) $me['id'],
            (string) $clean['body'],
            (string) $clean['outcome'],
            (string) $clean['direction'],
            (int) $clean['durationS'],
        );

        $row = Db::one(
            'SELECT a.*, u.name AS user_name, u.accent AS user_accent, u.avatar_file AS user_avatar
               FROM activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.id = :id',
            ['id' => $activityId]
        );

        $updated = Leads::present(Leads::find($leadId) ?? []);
        Events::toCompany('lead:updated', ['lead' => $updated], $leadId);

        Http::json([
            'activity'        => LeadsController::presentActivity($row ?? []),
            'lead'            => $updated,
            'responseSeconds' => $responseSeconds,
        ], 201);
    }

    public static function togglePin(string $id): void
    {
        Auth::requireStaff();
        $current = Db::value('SELECT is_pinned FROM activities WHERE id = :id', ['id' => (int) $id]);
        if ($current === null) {
            Http::error('Eintrag nicht gefunden.', 404);
        }
        $next = (int) $current === 1 ? 0 : 1;
        Db::run('UPDATE activities SET is_pinned = :p WHERE id = :id', ['p' => $next, 'id' => (int) $id]);
        Http::json(['ok' => true, 'isPinned' => $next === 1]);
    }

    /** Firmenweiter Verlauf fürs Dashboard. */
    public static function stream(): void
    {
        Auth::requireStaff();
        $limit = max(1, min(200, Http::queryInt('limit', 40)));

        $rows = Db::all(
            "SELECT a.*, u.name AS user_name, u.accent AS user_accent, u.avatar_file AS user_avatar,
                    CONCAT(l.first_name, ' ', l.last_name) AS lead_name, l.public_ref AS lead_ref
               FROM activities a
               LEFT JOIN users u ON u.id = a.user_id
               JOIN leads l ON l.id = a.lead_id
              ORDER BY a.occurred_at DESC, a.id DESC
              LIMIT $limit"
        );

        Http::json(['activities' => array_map([LeadsController::class, 'presentActivity'], $rows)]);
    }
}
