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

final class LeadsController
{
    public static function index(): void
    {
        $me = Auth::requireStaff();
        $where = [];
        $params = [];

        $status = Http::query('status');
        if ($status !== null) {
            $list = array_values(array_intersect(explode(',', $status), Leads::STATUSES));
            if ($list !== []) {
                [$ph, $p] = Db::inClause('st', $list);
                $where[] = "l.status IN ($ph)";
                $params += $p;
            }
        }

        foreach (['teamId' => 'l.team_id', 'ownerId' => 'l.owner_id', 'assetClassId' => 'l.asset_class_id'] as $key => $column) {
            $value = Http::queryInt($key);
            if ($value > 0) {
                $where[] = "$column = :$key";
                $params[$key] = $value;
            }
        }

        switch (Http::query('scope', 'all')) {
            case 'mine':
                $where[] = 'l.owner_id = :me';
                $params['me'] = (int) $me['id'];
                break;
            case 'my-teams':
                $where[] = 'l.team_id IN (SELECT team_id FROM team_members WHERE user_id = :me)';
                $params['me'] = (int) $me['id'];
                break;
            case 'unassigned':
                $where[] = 'l.owner_id IS NULL';
                break;
            case 'awaiting':
                $where[] = 'l.first_contact_at IS NULL';
                break;
        }

        $search = Http::query('q');
        if ($search !== null && trim($search) !== '') {
            $where[] = '(l.first_name LIKE :s OR l.last_name LIKE :s2 OR l.email LIKE :s3
                         OR l.company LIKE :s4 OR l.public_ref LIKE :s5 OR l.city LIKE :s6)';
            $like = '%' . trim($search) . '%';
            $params += ['s' => $like, 's2' => $like, 's3' => $like, 's4' => $like, 's5' => $like, 's6' => $like];
        }

        $order = match (Http::query('sort', 'newest')) {
            'oldest' => 'l.created_at ASC',
            'sla'    => 'CASE WHEN l.first_contact_at IS NULL THEN 0 ELSE 1 END, l.sla_due_at ASC',
            'score'  => 'l.score DESC, l.created_at DESC',
            'volume' => 'l.volume_value DESC, l.created_at DESC',
            default  => 'l.created_at DESC',
        };

        $clause = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);
        $limit = max(1, min(200, Http::queryInt('limit', 100)));
        $offset = max(0, Http::queryInt('offset', 0));

        $rows = Db::all(Leads::SELECT . $clause . " ORDER BY $order LIMIT $limit OFFSET $offset", $params);
        $total = (int) Db::value('SELECT COUNT(*) FROM leads l' . $clause, $params);

        Http::json(['leads' => array_map([Leads::class, 'present'], $rows), 'total' => $total]);
    }

    public static function show(string $id): void
    {
        Auth::requireStaff();
        $leadId = (int) $id;
        $lead = Leads::find($leadId);
        if ($lead === null) {
            Http::error('Lead nicht gefunden.', 404);
        }

        $activities = Db::all(
            'SELECT a.*, u.name AS user_name, u.accent AS user_accent
               FROM activities a LEFT JOIN users u ON u.id = a.user_id
              WHERE a.lead_id = :id ORDER BY a.occurred_at DESC, a.id DESC',
            ['id' => $leadId]
        );

        $attachments = Db::all(
            'SELECT a.*, u.name AS uploaded_by_name FROM attachments a
               LEFT JOIN users u ON u.id = a.uploaded_by
              WHERE a.lead_id = :id ORDER BY a.id DESC',
            ['id' => $leadId]
        );

        $tasks = Db::all(
            "SELECT t.*, u.name AS assignee_name, u.accent AS assignee_accent, NULL AS lead_name
               FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
              WHERE t.lead_id = :id ORDER BY (t.status = 'open') DESC, t.due_at ASC",
            ['id' => $leadId]
        );

        $offers = Db::all(
            'SELECT o.*, u.name AS created_by_name FROM offers o
               LEFT JOIN users u ON u.id = o.created_by
              WHERE o.lead_id = :id ORDER BY o.id DESC',
            ['id' => $leadId]
        );

        $emails = Db::all(
            'SELECT * FROM email_log WHERE lead_id = :id ORDER BY id DESC LIMIT 50',
            ['id' => $leadId]
        );

        Http::json([
            'lead'        => Leads::present($lead),
            'activities'  => array_map([self::class, 'presentActivity'], $activities),
            'attachments' => array_map([self::class, 'presentAttachment'], $attachments),
            'tasks'       => array_map([TasksController::class, 'present'], $tasks),
            'offers'      => array_map([OffersController::class, 'present'], $offers),
            'emails'      => array_map(static fn (array $e): array => [
                'id'        => (int) $e['id'],
                'to'        => $e['to_address'],
                'subject'   => $e['subject'],
                'template'  => $e['template'],
                'status'    => $e['status'],
                'preview'   => (string) ($e['preview'] ?? ''),
                'createdAt' => Leads::iso($e['created_at']),
            ], $emails),
        ]);
    }

    public static function contact(string $id): void
    {
        $me = Auth::requireStaff();
        $leadId = (int) $id;
        if (Leads::find($leadId) === null) {
            Http::error('Lead nicht gefunden.', 404);
        }

        $v = new Validator(Http::body());
        $v->choice('channel', ['call', 'email', 'whatsapp', 'meeting'], 'einen Kanal', false, 'call')
          ->text('outcome', 'das Ergebnis', 0, 40, false)
          ->text('note', 'die Notiz', 0, 4000, false)
          ->int('durationS', 0, 86400);
        $clean = $v->orFail();

        $seconds = Leads::markFirstContact($leadId, (int) $me['id']);

        $titles = [
            'call'     => 'Anruf geführt',
            'email'    => 'E-Mail gesendet',
            'whatsapp' => 'Nachricht über WhatsApp',
            'meeting'  => 'Termin durchgeführt',
        ];

        Leads::logActivity(
            $leadId,
            (string) $clean['channel'],
            $titles[$clean['channel']] ?? 'Kontakt',
            (int) $me['id'],
            (string) $clean['note'],
            (string) $clean['outcome'],
            'outbound',
            (int) $clean['durationS'],
        );

        $lead = Leads::present(Leads::find($leadId) ?? []);
        Events::toCompany('lead:updated', ['lead' => $lead], $leadId);
        Events::toCompany('stats:dirty', ['reason' => 'contact']);

        Http::json([
            'lead'            => $lead,
            'responseSeconds' => $seconds,
            'responseLabel'   => $seconds === null ? null : Leads::formatDuration($seconds),
        ]);
    }

    public static function update(string $id): void
    {
        $me = Auth::requireStaff();
        $leadId = (int) $id;
        $before = Leads::find($leadId);
        if ($before === null) {
            Http::error('Lead nicht gefunden.', 404);
        }

        $body = Http::body();
        $sets = [];
        $params = ['id' => $leadId];

        if (isset($body['status'])) {
            $status = (string) $body['status'];
            if (!in_array($status, Leads::STATUSES, true)) {
                Http::error('Unbekannter Status.', 400);
            }
            if ($status !== $before['status']) {
                $sets[] = 'status = :status';
                $sets[] = 'stage_changed_at = NOW()';
                $params['status'] = $status;
            }
        }

        foreach ([
            'ownerId'    => 'owner_id',
            'teamId'     => 'team_id',
            'lostReason' => 'lost_reason',
            'phone'      => 'phone',
            'email'      => 'email',
            'company'    => 'company',
            'city'       => 'city',
            'goal'       => 'goal',
            'score'      => 'score',
        ] as $key => $column) {
            if (!array_key_exists($key, $body)) {
                continue;
            }
            $value = $body[$key];
            if (in_array($key, ['ownerId', 'teamId'], true)) {
                $value = ($value === null || $value === '') ? null : (int) $value;
            } elseif ($key === 'score') {
                $value = max(0, min(100, (int) $value));
            } else {
                $value = mb_substr(trim((string) $value), 0, 500);
            }
            $sets[] = "$column = :$key";
            $params[$key] = $value;
        }

        if ($sets === []) {
            Http::json(['lead' => Leads::present($before)]);
        }

        $sets[] = 'updated_at = NOW()';
        Db::run('UPDATE leads SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);

        if (isset($params['status'])) {
            Leads::logActivity(
                $leadId,
                'status_change',
                'Status: ' . (Leads::STATUS_LABELS[$params['status']] ?? $params['status']),
                (int) $me['id'],
                isset($params['lostReason']) && $params['lostReason'] !== ''
                    ? 'Grund: ' . $params['lostReason']
                    : 'Zuvor: ' . (Leads::STATUS_LABELS[$before['status']] ?? $before['status']),
                meta: ['from' => $before['status'], 'to' => $params['status']],
            );
        }

        if (array_key_exists('ownerId', $params) && $params['ownerId'] !== ($before['owner_id'] === null ? null : (int) $before['owner_id'])) {
            $ownerName = $params['ownerId'] === null
                ? null
                : Db::value('SELECT name FROM users WHERE id = :id', ['id' => $params['ownerId']]);

            Leads::logActivity(
                $leadId,
                'assignment',
                $ownerName === null ? 'Zuweisung aufgehoben' : 'Übergeben an ' . $ownerName,
                (int) $me['id'],
                meta: ['from' => $before['owner_id'], 'to' => $params['ownerId']],
            );

            if ($params['ownerId'] !== null && $params['ownerId'] !== (int) $me['id']) {
                Notify::send(
                    (int) $params['ownerId'],
                    'assignment',
                    $me['name'] . ' hat dir einen Lead übergeben',
                    $before['first_name'] . ' ' . $before['last_name'] . ' · ' . ($before['asset_class_name'] ?? ''),
                    '/app/leads/' . $leadId,
                    $leadId,
                    'high',
                );
            }
        }

        $lead = Leads::present(Leads::find($leadId) ?? []);
        Events::toCompany('lead:updated', ['lead' => $lead], $leadId);
        Events::toCompany('stats:dirty', ['reason' => 'lead:update']);
        Http::json(['lead' => $lead]);
    }

    /** "Ich mache das" – Lead aus der Gruppe übernehmen. */
    public static function claim(string $id): void
    {
        $me = Auth::requireStaff();
        $leadId = (int) $id;
        $lead = Leads::find($leadId);
        if ($lead === null) {
            Http::error('Lead nicht gefunden.', 404);
        }

        $isMember = Db::value(
            'SELECT 1 FROM team_members WHERE team_id = :team AND user_id = :me',
            ['team' => $lead['team_id'], 'me' => (int) $me['id']]
        );
        if ($isMember === null && $me['role'] === 'agent') {
            Http::error('Du gehörst nicht zu der zuständigen Fachgruppe.', 403);
        }

        Db::run('UPDATE leads SET owner_id = :me, updated_at = NOW() WHERE id = :id', [
            'me' => (int) $me['id'],
            'id' => $leadId,
        ]);
        Leads::logActivity(
            $leadId,
            'assignment',
            $me['name'] . ' hat den Lead übernommen',
            (int) $me['id'],
            meta: ['from' => $lead['owner_id'], 'to' => (int) $me['id'], 'claimed' => true],
        );

        $updated = Leads::present(Leads::find($leadId) ?? []);
        Events::toCompany('lead:updated', ['lead' => $updated], $leadId);
        Http::json(['lead' => $updated]);
    }

    public static function destroy(string $id): void
    {
        Auth::requireRole('admin');
        Db::run('DELETE FROM leads WHERE id = :id', ['id' => (int) $id]);
        Events::toCompany('stats:dirty', ['reason' => 'lead:delete']);
        Http::json(['ok' => true]);
    }

    // ── Ausgabeform ────────────────────────────────────────────────────

    public static function presentActivity(array $a): array
    {
        return [
            'id'         => (int) $a['id'],
            'leadId'     => (int) $a['lead_id'],
            'type'       => $a['type'],
            'title'      => $a['title'],
            'body'       => (string) ($a['body'] ?? ''),
            'outcome'    => $a['outcome'],
            'direction'  => $a['direction'],
            'durationS'  => (int) $a['duration_s'],
            'isPinned'   => (bool) $a['is_pinned'],
            'meta'       => $a['meta'] === null ? [] : (json_decode((string) $a['meta'], true) ?: []),
            'user'       => ($a['user_id'] ?? null) === null ? null : [
                'id'     => (int) $a['user_id'],
                'name'   => $a['user_name'] ?? '',
                'accent' => $a['user_accent'] ?? '#C8A24A',
            ],
            'occurredAt' => Leads::iso($a['occurred_at']),
            'createdAt'  => Leads::iso($a['created_at']),
            'leadName'   => $a['lead_name'] ?? null,
            'leadRef'    => $a['lead_ref'] ?? null,
        ];
    }

    public static function presentAttachment(array $a): array
    {
        return [
            'id'              => (int) $a['id'],
            'leadId'          => (int) $a['lead_id'],
            'activityId'      => $a['activity_id'] === null ? null : (int) $a['activity_id'],
            'kind'            => $a['kind'],
            'filename'        => $a['filename'],
            'url'             => '/api/uploads/' . $a['stored_name'],
            'mime'            => $a['mime'],
            'sizeBytes'       => (int) $a['size_bytes'],
            'durationS'       => (int) $a['duration_s'],
            'transcript'      => (string) ($a['transcript'] ?? ''),
            'visibleToClient' => (bool) $a['visible_to_client'],
            'uploadedBy'      => $a['uploaded_by_name'] ?? null,
            'createdAt'       => Leads::iso($a['created_at']),
        ];
    }
}
