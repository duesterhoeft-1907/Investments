<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Domain\Leads;

/** Kennzahlen mit Schwerpunkt Reaktionsgeschwindigkeit. */
final class StatsController
{
    public static function dashboard(): void
    {
        Auth::requireStaff();
        $days = max(1, min(365, Http::queryInt('days', 30)));
        $range = ['days' => $days];

        $totals = Db::one(
            "SELECT COUNT(*) AS total,
                    SUM(first_contact_at IS NULL) AS awaiting,
                    SUM(sla_breached = 1) AS breached,
                    SUM(status = 'won') AS won,
                    SUM(status = 'lost') AS lost,
                    SUM(CASE WHEN status IN ('new','contacted','qualified','proposal') THEN volume_value ELSE 0 END) AS pipeline_value,
                    SUM(CASE WHEN status = 'won' THEN volume_value ELSE 0 END) AS won_value,
                    AVG(response_seconds) AS avg_response,
                    COUNT(response_seconds) AS answered
               FROM leads
              WHERE created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)",
            $range
        ) ?? [];

        $answered = (int) ($totals['answered'] ?? 0);
        $breached = (int) ($totals['breached'] ?? 0);
        $leadCount = (int) ($totals['total'] ?? 0);
        $won = (int) ($totals['won'] ?? 0);
        $avg = $totals['avg_response'] === null ? null : (int) round((float) $totals['avg_response']);
        $median = self::medianResponse($days);

        // Trichter in Stufenreihenfolge, auch für Stufen ohne Leads.
        $statusRows = Db::all(
            'SELECT status, COUNT(*) AS count, SUM(volume_value) AS value
               FROM leads WHERE created_at >= DATE_SUB(NOW(), INTERVAL :days DAY) GROUP BY status',
            $range
        );
        $byStatusMap = [];
        foreach ($statusRows as $row) {
            $byStatusMap[(string) $row['status']] = $row;
        }
        $byStatus = [];
        foreach (Leads::STATUSES as $status) {
            $byStatus[] = [
                'status' => $status,
                'label'  => Leads::STATUS_LABELS[$status],
                'count'  => (int) ($byStatusMap[$status]['count'] ?? 0),
                'value'  => (int) ($byStatusMap[$status]['value'] ?? 0),
            ];
        }

        $byTeam = Db::all(
            "SELECT t.id, t.name, t.color, t.sla_minutes AS slaMinutes,
                    COUNT(l.id) AS leads,
                    AVG(l.response_seconds) AS avgResponse,
                    SUM(l.sla_breached = 1) AS breached,
                    SUM(l.first_contact_at IS NULL AND l.status NOT IN ('won','lost')) AS awaiting,
                    SUM(l.status = 'won') AS won
               FROM teams t
               LEFT JOIN leads l ON l.team_id = t.id AND l.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
              GROUP BY t.id, t.name, t.color, t.sla_minutes
              ORDER BY t.sort_order, t.id",
            $range
        );

        $byAsset = Db::all(
            'SELECT ac.name, ac.slug, COUNT(l.id) AS leads, COALESCE(SUM(l.volume_value), 0) AS value
               FROM asset_classes ac
               LEFT JOIN leads l ON l.asset_class_id = ac.id AND l.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
              GROUP BY ac.id, ac.name, ac.slug
              ORDER BY leads DESC',
            $range
        );

        $leaderboard = Db::all(
            "SELECT u.id, u.name, u.accent, u.title,
                    COUNT(l.id) AS leads,
                    AVG(l.response_seconds) AS avgResponse,
                    SUM(l.status = 'won') AS won,
                    SUM(l.sla_breached = 1) AS breached
               FROM users u
               LEFT JOIN leads l ON l.owner_id = u.id AND l.created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
              WHERE u.is_active = 1
              GROUP BY u.id, u.name, u.accent, u.title
             HAVING leads > 0
              -- MariaDB laesst einen Aggregat-Alias in einem ORDER-BY-Ausdruck
              -- nicht zu, deshalb hier die Funktion selbst.
              ORDER BY (AVG(l.response_seconds) IS NULL), AVG(l.response_seconds) ASC",
            $range
        );

        $timeline = Db::all(
            "SELECT DATE(created_at) AS day, COUNT(*) AS leads,
                    AVG(response_seconds) AS avgResponse,
                    SUM(status = 'won') AS won
               FROM leads WHERE created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
              GROUP BY DATE(created_at) ORDER BY day",
            $range
        );

        $urgent = Db::all(
            Leads::SELECT . " WHERE l.first_contact_at IS NULL AND l.status NOT IN ('won','lost')
                              ORDER BY l.sla_due_at ASC LIMIT 12"
        );

        Http::json([
            'range'  => ['days' => $days],
            'totals' => [
                'leads'                 => $leadCount,
                'awaiting'              => (int) ($totals['awaiting'] ?? 0),
                'breached'              => $breached,
                'won'                   => $won,
                'lost'                  => (int) ($totals['lost'] ?? 0),
                'pipelineValue'         => (int) ($totals['pipeline_value'] ?? 0),
                'wonValue'              => (int) ($totals['won_value'] ?? 0),
                'answered'              => $answered,
                'avgResponseSeconds'    => $avg,
                'avgResponseLabel'      => $avg === null ? null : Leads::formatDuration($avg),
                'medianResponseSeconds' => $median,
                'medianResponseLabel'   => $median === null ? null : Leads::formatDuration($median),
                'slaComplianceRate'     => $answered === 0 ? null : (int) round((($answered - $breached) / $answered) * 100),
                'conversionRate'        => $leadCount === 0 ? 0 : (int) round(($won / $leadCount) * 100),
            ],
            'byStatus'     => $byStatus,
            'byTeam'       => array_map([self::class, 'withResponseLabel'], $byTeam),
            'byAsset'      => array_map(static fn (array $a): array => [
                'name'  => $a['name'],
                'slug'  => $a['slug'],
                'leads' => (int) $a['leads'],
                'value' => (int) $a['value'],
            ], $byAsset),
            'leaderboard'  => array_map([self::class, 'withResponseLabel'], $leaderboard),
            'timeline'     => array_map(static fn (array $t): array => [
                'day'         => $t['day'],
                'leads'       => (int) $t['leads'],
                'avgResponse' => $t['avgResponse'] === null ? null : (int) round((float) $t['avgResponse']),
                'won'         => (int) $t['won'],
            ], $timeline),
            'urgent'       => array_map([Leads::class, 'present'], $urgent),
            'onlineUserIds'=> EventsController::onlineUserIds(),
        ]);
    }

    private static function withResponseLabel(array $row): array
    {
        $avg = $row['avgResponse'] === null ? null : (int) round((float) $row['avgResponse']);
        $out = $row;
        $out['id'] = (int) $row['id'];
        $out['leads'] = (int) $row['leads'];
        $out['breached'] = (int) ($row['breached'] ?? 0);
        $out['won'] = (int) ($row['won'] ?? 0);
        if (isset($row['awaiting'])) {
            $out['awaiting'] = (int) $row['awaiting'];
        }
        if (isset($row['slaMinutes'])) {
            $out['slaMinutes'] = (int) $row['slaMinutes'];
        }
        $out['avgResponse'] = $avg;
        $out['avgResponseLabel'] = $avg === null ? null : Leads::formatDuration($avg);
        return $out;
    }

    private static function medianResponse(int $days): ?int
    {
        $values = Db::all(
            'SELECT response_seconds AS s FROM leads
              WHERE response_seconds IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
              ORDER BY response_seconds',
            ['days' => $days]
        );
        $count = count($values);
        if ($count === 0) {
            return null;
        }
        $mid = intdiv($count, 2);
        return $count % 2 === 1
            ? (int) $values[$mid]['s']
            : (int) round(((int) $values[$mid - 1]['s'] + (int) $values[$mid]['s']) / 2);
    }

    /** Der Einstieg in den Arbeitstag: meine Leads und meine offenen Punkte. */
    public static function myDay(): void
    {
        $me = Auth::requireStaff();
        $userId = (int) $me['id'];

        $leads = Db::all(
            Leads::SELECT . " WHERE l.owner_id = :me AND l.status NOT IN ('won','lost')
                              ORDER BY (l.first_contact_at IS NULL) DESC, l.sla_due_at ASC LIMIT 25",
            ['me' => $userId]
        );

        $tasks = Db::all(
            "SELECT t.*, CONCAT(l.first_name, ' ', l.last_name) AS lead_name,
                    u.name AS assignee_name, u.accent AS assignee_accent
               FROM tasks t
               LEFT JOIN leads l ON l.id = t.lead_id
               LEFT JOIN users u ON u.id = t.assigned_to
              WHERE t.assigned_to = :me AND t.status = 'open'
              ORDER BY t.due_at ASC LIMIT 25",
            ['me' => $userId]
        );

        $stats = Db::one(
            'SELECT COUNT(*) AS open,
                    SUM(first_contact_at IS NULL) AS awaiting,
                    AVG(response_seconds) AS avgResponse
               FROM leads WHERE owner_id = :me AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
            ['me' => $userId]
        ) ?? [];

        $avg = ($stats['avgResponse'] ?? null) === null ? null : (int) round((float) $stats['avgResponse']);

        Http::json([
            'leads' => array_map([Leads::class, 'present'], $leads),
            'tasks' => array_map([TasksController::class, 'present'], $tasks),
            'stats' => [
                'open'               => (int) ($stats['open'] ?? 0),
                'awaiting'           => (int) ($stats['awaiting'] ?? 0),
                'avgResponseSeconds' => $avg,
                'avgResponseLabel'   => $avg === null ? null : Leads::formatDuration($avg),
            ],
        ]);
    }
}
