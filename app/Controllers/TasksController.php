<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Core\Validator;
use App\Domain\Leads;
use DateTimeImmutable;
use DateTimeZone;

final class TasksController
{
    private const RECURRENCES = ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly'];

    private const RECURRENCE_LABELS = [
        'none'      => 'einmalig',
        'daily'     => 'täglich',
        'weekly'    => 'wöchentlich',
        'biweekly'  => 'alle zwei Wochen',
        'monthly'   => 'monatlich',
        'quarterly' => 'vierteljährlich',
    ];

    private const SELECT = "
        SELECT t.*, u.name AS assignee_name, u.accent AS assignee_accent,
               CONCAT(l.first_name, ' ', l.last_name) AS lead_name
          FROM tasks t
          LEFT JOIN users u ON u.id = t.assigned_to
          LEFT JOIN leads l ON l.id = t.lead_id";

    public static function index(): void
    {
        $me = Auth::requireStaff();
        $where = [];
        $params = [];

        $status = Http::query('status', 'open');
        if ($status !== 'all' && in_array($status, ['open', 'done', 'cancelled'], true)) {
            $where[] = 't.status = :status';
            $params['status'] = $status;
        }

        $scope = Http::query('scope', 'mine');
        if ($scope === 'mine') {
            $where[] = 't.assigned_to = :me';
            $params['me'] = (int) $me['id'];
        }

        $leadId = Http::queryInt('leadId');
        if ($leadId > 0) {
            $where[] = 't.lead_id = :lead';
            $params['lead'] = $leadId;
        }

        switch (Http::query('window', 'all')) {
            case 'today':
                $where[] = 'DATE(t.due_at) = UTC_DATE()';
                break;
            case 'week':
                $where[] = 't.due_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)';
                break;
            case 'overdue':
                $where[] = "t.due_at < NOW() AND t.status = 'open'";
                break;
        }

        $clause = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);
        $rows = Db::all(self::SELECT . $clause . ' ORDER BY t.due_at ASC LIMIT 300', $params);

        Http::json(['tasks' => array_map([self::class, 'present'], $rows)]);
    }

    public static function store(): void
    {
        $me = Auth::requireStaff();
        $v = new Validator(Http::body());
        $v->text('title', 'einen Titel', 2, 200)
          ->text('description', 'die Beschreibung', 0, 4000, false)
          ->choice('kind', ['task', 'call', 'meeting'], 'eine Art', false, 'task')
          ->choice('recurrence', self::RECURRENCES, 'eine Wiederholung', false, 'none')
          ->isoDate('dueAt', 'einen Termin')
          ->int('durationMin', 5, 1440, 30)
          ->int('leadId', 0, PHP_INT_MAX)
          ->int('assignedTo', 0, PHP_INT_MAX)
          ->bool('visibleToClient');
        $clean = $v->orFail();

        $id = Db::insert(
            'INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at,
                                duration_min, recurrence, visible_to_client)
             VALUES (:lead, :assignee, :creator, :kind, :title, :description, :due, :duration, :recurrence, :visible)',
            [
                'lead'        => $clean['leadId'] > 0 ? (int) $clean['leadId'] : null,
                'assignee'    => $clean['assignedTo'] > 0 ? (int) $clean['assignedTo'] : (int) $me['id'],
                'creator'     => (int) $me['id'],
                'kind'        => $clean['kind'],
                'title'       => $clean['title'],
                'description' => $clean['description'],
                'due'         => $clean['dueAt'],
                'duration'    => (int) $clean['durationMin'],
                'recurrence'  => $clean['recurrence'],
                'visible'     => $clean['visibleToClient'] ? 1 : 0,
            ]
        );

        if ($clean['leadId'] > 0) {
            $kindLabel = ['task' => 'Aufgabe', 'call' => 'Anruf', 'meeting' => 'Termin'][$clean['kind']] ?? 'Aufgabe';
            Leads::logActivity(
                (int) $clean['leadId'],
                'system',
                $kindLabel . ' geplant: ' . $clean['title'],
                (int) $me['id'],
                $clean['recurrence'] === 'none' ? '' : 'Wiederholung: ' . self::RECURRENCE_LABELS[$clean['recurrence']],
                meta: ['taskId' => $id, 'dueAt' => $clean['dueAt']],
            );
        }

        Http::json(['task' => self::present(Db::one(self::SELECT . ' WHERE t.id = :id', ['id' => $id]) ?? [])], 201);
    }

    public static function update(string $id): void
    {
        $me = Auth::requireStaff();
        $taskId = (int) $id;
        $before = Db::one('SELECT * FROM tasks WHERE id = :id', ['id' => $taskId]);
        if ($before === null) {
            Http::error('Aufgabe nicht gefunden.', 404);
        }

        $body = Http::body();
        $sets = [];
        $params = ['id' => $taskId];

        if (isset($body['status'])) {
            $status = (string) $body['status'];
            if (!in_array($status, ['open', 'done', 'cancelled'], true)) {
                Http::error('Unbekannter Status.', 400);
            }
            $sets[] = 'status = :status';
            $sets[] = 'completed_at = ' . ($status === 'done' ? 'NOW()' : 'NULL');
            $params['status'] = $status;
        }
        if (isset($body['title'])) {
            $sets[] = 'title = :title';
            $params['title'] = mb_substr(trim((string) $body['title']), 0, 200);
        }
        if (isset($body['description'])) {
            $sets[] = 'description = :description';
            $params['description'] = mb_substr((string) $body['description'], 0, 4000);
        }
        if (isset($body['dueAt'])) {
            $sets[] = 'due_at = :due';
            $params['due'] = (new DateTimeImmutable((string) $body['dueAt'], new DateTimeZone('UTC')))
                ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        }
        if (array_key_exists('assignedTo', $body)) {
            $sets[] = 'assigned_to = :assignee';
            $params['assignee'] = $body['assignedTo'] === null ? null : (int) $body['assignedTo'];
        }
        if (isset($body['visibleToClient'])) {
            $sets[] = 'visible_to_client = :visible';
            $params['visible'] = $body['visibleToClient'] ? 1 : 0;
        }

        if ($sets !== []) {
            Db::run('UPDATE tasks SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        }

        // Wiederkehrender Termin: beim Abhaken entsteht der nächste von selbst.
        $followUp = null;
        if (($params['status'] ?? null) === 'done' && $before['recurrence'] !== 'none') {
            $nextDue = self::nextOccurrence((string) $before['due_at'], (string) $before['recurrence']);
            $followUpId = Db::insert(
                'INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at,
                                    duration_min, recurrence, visible_to_client)
                 VALUES (:lead, :assignee, :creator, :kind, :title, :description, :due, :duration, :recurrence, :visible)',
                [
                    'lead'        => $before['lead_id'],
                    'assignee'    => $before['assigned_to'],
                    'creator'     => $before['created_by'],
                    'kind'        => $before['kind'],
                    'title'       => $before['title'],
                    'description' => $before['description'],
                    'due'         => $nextDue,
                    'duration'    => (int) $before['duration_min'],
                    'recurrence'  => $before['recurrence'],
                    'visible'     => (int) $before['visible_to_client'],
                ]
            );
            $followUp = Db::one(self::SELECT . ' WHERE t.id = :id', ['id' => $followUpId]);
        }

        if (($params['status'] ?? null) === 'done' && $before['lead_id'] !== null) {
            Leads::logActivity(
                (int) $before['lead_id'],
                'system',
                'Erledigt: ' . $before['title'],
                (int) $me['id'],
                $followUp === null ? '' : 'Folgetermin automatisch angelegt (' . self::RECURRENCE_LABELS[$before['recurrence']] . ').',
                meta: ['taskId' => $taskId],
            );
        }

        Http::json([
            'task'     => self::present(Db::one(self::SELECT . ' WHERE t.id = :id', ['id' => $taskId]) ?? []),
            'followUp' => $followUp === null ? null : self::present($followUp),
        ]);
    }

    public static function destroy(string $id): void
    {
        Auth::requireStaff();
        Db::run('DELETE FROM tasks WHERE id = :id', ['id' => (int) $id]);
        Http::json(['ok' => true]);
    }

    /**
     * Nächster Termin einer Serie. Monatsenden werden gekappt: der 31. wird
     * im Februar zum 28./29. und nicht zum 3. März.
     */
    public static function nextOccurrence(string $dueAt, string $recurrence): string
    {
        $date = new DateTimeImmutable($dueAt, new DateTimeZone('UTC'));

        return match ($recurrence) {
            'daily'     => $date->modify('+1 day')->format('Y-m-d H:i:s'),
            'weekly'    => $date->modify('+7 days')->format('Y-m-d H:i:s'),
            'biweekly'  => $date->modify('+14 days')->format('Y-m-d H:i:s'),
            'monthly'   => self::addMonths($date, 1),
            'quarterly' => self::addMonths($date, 3),
            default     => $date->format('Y-m-d H:i:s'),
        };
    }

    private static function addMonths(DateTimeImmutable $date, int $months): string
    {
        $day = (int) $date->format('j');
        $firstOfTarget = $date->modify('first day of this month')->modify("+{$months} months");
        $lastDay = (int) $firstOfTarget->format('t');
        return $firstOfTarget->setDate(
            (int) $firstOfTarget->format('Y'),
            (int) $firstOfTarget->format('n'),
            min($day, $lastDay)
        )->format('Y-m-d H:i:s');
    }

    public static function present(array $t): array
    {
        if ($t === []) {
            return [];
        }
        return [
            'id'              => (int) $t['id'],
            'leadId'          => $t['lead_id'] === null ? null : (int) $t['lead_id'],
            'kind'            => $t['kind'],
            'title'           => $t['title'],
            'description'     => (string) ($t['description'] ?? ''),
            'dueAt'           => Leads::iso($t['due_at']),
            'durationMin'     => (int) $t['duration_min'],
            'recurrence'      => $t['recurrence'],
            'status'          => $t['status'],
            'completedAt'     => Leads::iso($t['completed_at']),
            'visibleToClient' => (bool) $t['visible_to_client'],
            'assignee'        => ($t['assigned_to'] ?? null) === null ? null : [
                'id'     => (int) $t['assigned_to'],
                'name'   => $t['assignee_name'] ?? '',
                'accent' => $t['assignee_accent'] ?? '#21b4a6',
            ],
            'leadName'        => $t['lead_name'] ?? null,
            'createdAt'       => Leads::iso($t['created_at']),
        ];
    }
}
