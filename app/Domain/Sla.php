<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Config;
use App\Core\Db;

/**
 * Wacht über die Reaktionszeit.
 *
 * Zwei Wege, damit es auf Shared Hosting zuverlässig läuft:
 *   - bin/cron-sla.php, minütlich über den Cron von SiteGround (der reguläre Weg)
 *   - ein Aufruf beim Abfragen der Ereignisse, höchstens alle 60 Sekunden
 *     (Netz für den Fall, dass der Cron noch nicht eingerichtet ist)
 *
 * Gemeldet wird zweimal: eine Vorwarnung bei halber Frist und die
 * Überschreitung. Beides genau einmal – dafür stehen sla_warned und
 * sla_breached auf dem Lead.
 */
final class Sla
{
    public static function run(): array
    {
        return ['warned' => self::warn(), 'breached' => self::breach()];
    }

    /** Läuft höchstens einmal pro Minute – für den Aufruf aus dem Polling. */
    public static function runThrottled(): void
    {
        $last = Db::value("SELECT setting_value FROM settings WHERE setting_key = 'sla_last_run'");
        if ($last !== null && (time() - (int) $last) < 60) {
            return;
        }
        Db::run(
            "INSERT INTO settings (setting_key, setting_value) VALUES ('sla_last_run', :now)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()",
            ['now' => (string) time()]
        );
        self::run();
    }

    /** @return list<array<string,mixed>> */
    private static function openLeads(string $extra): array
    {
        return Db::all(
            Leads::SELECT . "
              WHERE l.first_contact_at IS NULL
                AND l.status NOT IN ('won','lost')
                AND l.sla_due_at IS NOT NULL
                AND $extra"
        );
    }

    private static function warn(): int
    {
        $ratio = (float) Config::get('sla_warn_ratio', 0.5);
        // Der Vorwarnzeitpunkt steht am Lead, weil er in Dienstzeit gerechnet
        // wird: die halbe Frist läge bei ruhender Uhr sonst mitten in der
        // Nacht. Leads von vor dieser Änderung haben ihn nicht – für die
        // bleibt es bei der halbierten Frist.
        $leads = self::openLeads(
            'l.sla_warned = 0 AND l.sla_breached = 0
             AND NOW() < l.sla_due_at
             AND NOW() >= COALESCE(l.sla_warn_at,
                   DATE_ADD(l.created_at,
                     INTERVAL ROUND(TIMESTAMPDIFF(SECOND, l.created_at, l.sla_due_at) * ' . $ratio . ') SECOND))'
        );

        foreach ($leads as $row) {
            Db::run('UPDATE leads SET sla_warned = 1 WHERE id = :id', ['id' => (int) $row['id']]);
            $lead = Leads::present($row);
            $minutesLeft = max(0, (int) round((strtotime((string) $row['sla_due_at']) - time()) / 60));

            foreach (self::recipients($row) as $userId) {
                Notify::send(
                    $userId,
                    'sla_warning',
                    'Noch ' . $minutesLeft . ' Min. für ' . $lead['name'],
                    ($lead['assetClass'] ?? 'Anfrage') . ' wartet weiterhin auf den Erstkontakt.',
                    '/app/leads/' . $lead['id'],
                    $lead['id'],
                    'high',
                );
            }
            Events::toTeam($lead['teamId'], 'lead:sla', ['lead' => $lead, 'state' => 'warning', 'minutesLeft' => $minutesLeft], $lead['id']);
        }

        return count($leads);
    }

    private static function breach(): int
    {
        $leads = self::openLeads('l.sla_breached = 0 AND l.sla_due_at < NOW()');

        foreach ($leads as $row) {
            Db::run('UPDATE leads SET sla_breached = 1 WHERE id = :id', ['id' => (int) $row['id']]);
            $lead = Leads::present($row);

            foreach (self::recipients($row) as $userId) {
                Notify::send(
                    $userId,
                    'sla_breach',
                    'Reaktionszeit überschritten: ' . $lead['name'],
                    ($lead['assetClass'] ?? 'Anfrage') . ' · seit Eingang ohne Erstkontakt.',
                    '/app/leads/' . $lead['id'],
                    $lead['id'],
                    'critical',
                );
            }

            $channel = Db::one("SELECT id FROM channels WHERE type = 'team' AND team_id = :team", ['team' => $lead['teamId']]);
            if ($channel !== null) {
                $messageId = Db::insert(
                    "INSERT INTO messages (channel_id, user_id, body, kind, lead_id, meta)
                     VALUES (:channel, NULL, :body, 'lead_alert', :lead, :meta)",
                    [
                        'channel' => (int) $channel['id'],
                        'body'    => 'SLA überschritten: ' . $lead['name'] . ' wartet noch immer auf den Erstkontakt.',
                        'lead'    => $lead['id'],
                        'meta'    => json_encode(['breach' => true], JSON_UNESCAPED_UNICODE),
                    ]
                );
                Events::toChannel((int) $channel['id'], 'chat:message', ['messageId' => $messageId, 'channelId' => (int) $channel['id']]);
            }

            Events::toTeam($lead['teamId'], 'lead:sla', ['lead' => $lead, 'state' => 'breached', 'minutesLeft' => 0], $lead['id']);
        }

        if ($leads !== []) {
            Events::toCompany('stats:dirty', ['reason' => 'sla:breach']);
        }

        return count($leads);
    }

    /** Zuständiger Berater und die ganze Gruppe. */
    private static function recipients(array $row): array
    {
        $ids = Leads::teamMemberIds($row['team_id'] === null ? null : (int) $row['team_id']);
        $ownerId = $row['owner_id'] === null ? null : (int) $row['owner_id'];
        if ($ownerId !== null && !in_array($ownerId, $ids, true)) {
            $ids[] = $ownerId;
        }
        return $ids;
    }
}
