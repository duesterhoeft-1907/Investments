<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Db;

/** Fachliche Mitte: Auswahllisten, Routing, Bewertung, Verlauf, Reaktionsuhr. */
final class Leads
{
    public const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

    public const STATUS_LABELS = [
        'new'       => 'Neu',
        'contacted' => 'Kontaktiert',
        'qualified' => 'Qualifiziert',
        'proposal'  => 'Angebot',
        'won'       => 'Gewonnen',
        'lost'      => 'Verloren',
    ];

    /** Anlagevolumen mit Mittelwert für Pipeline-Summen und Punkten fürs Scoring. */
    public const VOLUME_BANDS = [
        'under-25k' => ['label' => 'bis 25.000 €',          'value' => 15000,  'score' => 5],
        '25k-50k'   => ['label' => '25.000 – 50.000 €',     'value' => 37500,  'score' => 12],
        '50k-100k'  => ['label' => '50.000 – 100.000 €',    'value' => 75000,  'score' => 20],
        '100k-250k' => ['label' => '100.000 – 250.000 €',   'value' => 175000, 'score' => 30],
        '250k-500k' => ['label' => '250.000 – 500.000 €',   'value' => 375000, 'score' => 38],
        'over-500k' => ['label' => 'über 500.000 €',        'value' => 750000, 'score' => 45],
    ];

    public const HORIZONS = [
        'short'        => 'kurzfristig (bis 2 Jahre)',
        'medium'       => 'mittelfristig (2 – 5 Jahre)',
        'long'         => 'langfristig (5 – 10 Jahre)',
        'generational' => 'Generationen (10+ Jahre)',
    ];

    public const EXPERIENCE = [
        'none'         => 'keine Vorerfahrung',
        'some'         => 'erste Erfahrungen',
        'experienced'  => 'erfahren',
        'professional' => 'professionell / institutionell',
    ];

    public const CONTACT_PREFS = [
        'phone'    => 'Telefon',
        'email'    => 'E-Mail',
        'whatsapp' => 'WhatsApp',
    ];

    public const CONTACT_WINDOWS = [
        'vormittags'   => 'Vormittags (8 – 12 Uhr)',
        'nachmittags'  => 'Nachmittags (12 – 17 Uhr)',
        'abends'       => 'Abends (17 – 20 Uhr)',
        'flexibel'     => 'Jederzeit',
    ];

    public const SELECT = '
        SELECT l.*,
               ac.name  AS asset_class_name,
               ac.slug  AS asset_class_slug,
               t.name   AS team_name,
               t.color  AS team_color,
               u.name   AS owner_name,
               u.email  AS owner_email,
               u.accent AS owner_accent,
               u.avatar_file AS owner_avatar
          FROM leads l
          LEFT JOIN asset_classes ac ON ac.id = l.asset_class_id
          LEFT JOIN teams t          ON t.id  = l.team_id
          LEFT JOIN users u          ON u.id  = l.owner_id';

    // ── Kennungen ──────────────────────────────────────────────────────

    /** Referenz ohne verwechselbare Zeichen (kein 0/O, kein 1/I). */
    public static function newRef(): string
    {
        return 'LD-' . self::randomFrom('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6);
    }

    public static function newPortalPassword(): string
    {
        return self::randomFrom('23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', 10);
    }

    public static function newPortalToken(): string
    {
        return bin2hex(random_bytes(16));
    }

    private static function randomFrom(string $alphabet, int $length): string
    {
        $max = strlen($alphabet) - 1;
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            $out .= $alphabet[random_int(0, $max)];
        }
        return $out;
    }

    // ── Routing und Zuweisung ──────────────────────────────────────────

    /** Fachgebiet → Fachgruppe. Ohne Zuordnung greift die erste Gruppe. */
    public static function teamForAssetClass(?int $assetClassId): ?int
    {
        if ($assetClassId !== null) {
            $teamId = Db::value('SELECT team_id FROM asset_classes WHERE id = :id', ['id' => $assetClassId]);
            if ($teamId !== null) {
                return (int) $teamId;
            }
        }
        $fallback = Db::value('SELECT id FROM teams ORDER BY sort_order, id LIMIT 1');
        return $fallback === null ? null : (int) $fallback;
    }

    /**
     * Wer bekommt den Lead?
     *
     * Beratende Rollen gehen vor – Leitung und Geschäftsführung sind zwar in
     * jeder Gruppe, sollen aber nur einspringen, wenn kein Berater da ist.
     * Danach entscheidet die geringste offene Last, bei Gleichstand der, der
     * am längsten nichts bekommen hat. Das bleibt fair und ist erklärbar.
     */
    public static function pickOwner(?int $teamId): ?int
    {
        if ($teamId === null) {
            return null;
        }
        $row = Db::one(
            "SELECT u.id,
                    CASE u.role WHEN 'agent' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END AS role_rank,
                    (SELECT COUNT(*) FROM leads l
                      WHERE l.owner_id = u.id
                        AND l.status IN ('new','contacted','qualified','proposal')) AS open_leads,
                    COALESCE((SELECT MAX(l2.created_at) FROM leads l2 WHERE l2.owner_id = u.id), '1970-01-01') AS last_assigned
               FROM team_members tm
               JOIN users u ON u.id = tm.user_id
              WHERE tm.team_id = :team AND u.is_active = 1
                AND (u.away_until IS NULL OR u.away_until <= NOW())
              ORDER BY role_rank ASC, open_leads ASC, last_assigned ASC, u.id ASC
              LIMIT 1",
            ['team' => $teamId]
        );
        if ($row !== null) {
            return (int) $row['id'];
        }

        // Ist die ganze Gruppe abwesend, ist ein abwesender Berater immer noch
        // besser als ein herrenloser Lead – die Gruppe wird ohnehin alarmiert.
        $fallback = Db::one(
            "SELECT u.id FROM team_members tm JOIN users u ON u.id = tm.user_id
              WHERE tm.team_id = :team AND u.is_active = 1
              ORDER BY u.id ASC LIMIT 1",
            ['team' => $teamId]
        );
        return $fallback === null ? null : (int) $fallback['id'];
    }

    /** @return list<int> */
    public static function teamMemberIds(?int $teamId): array
    {
        if ($teamId === null) {
            return [];
        }
        $rows = Db::all(
            'SELECT tm.user_id FROM team_members tm
               JOIN users u ON u.id = tm.user_id
              WHERE tm.team_id = :team AND u.is_active = 1
              ORDER BY tm.user_id',
            ['team' => $teamId]
        );
        return array_map(static fn (array $r): int => (int) $r['user_id'], $rows);
    }

    public static function slaMinutesForTeam(?int $teamId): int
    {
        $fallback = (int) \App\Core\Config::get('sla_minutes', 15);
        if ($teamId === null) {
            return $fallback;
        }
        $minutes = Db::value('SELECT sla_minutes FROM teams WHERE id = :id', ['id' => $teamId]);
        return $minutes === null ? $fallback : max(1, (int) $minutes);
    }

    /**
     * Frist und Vorwarnung als UTC-Zeitstempel, gerechnet in Dienstzeit.
     *
     * Die Vorwarnung wird eigens gerechnet und nicht spaeter aus der Frist
     * halbiert: bei ruhender Uhr laege die Haelfte sonst mitten in der Nacht.
     *
     * @return array{due:string, warn:string}
     */
    public static function slaDeadline(int $minutes, ?\DateTimeImmutable $from = null): array
    {
        $start = $from ?? new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $ratio = (float) \App\Core\Config::get('sla_warn_ratio', 0.5);
        $warnMinutes = max(1, (int) round($minutes * max(0.05, min(0.95, $ratio))));

        return [
            'due'  => Hours::dueAt($start, $minutes)->format('Y-m-d H:i:s'),
            'warn' => Hours::dueAt($start, $warnMinutes)->format('Y-m-d H:i:s'),
        ];
    }

    /** Nachvollziehbares Scoring von 0 bis 100. */
    public static function score(string $volumeBand, string $horizon, string $experience, string $phone, string $message): int
    {
        $score = 20;
        $score += self::VOLUME_BANDS[$volumeBand]['score'] ?? 0;
        if (in_array($horizon, ['long', 'generational'], true)) {
            $score += 10;
        }
        if ($experience === 'experienced') {
            $score += 8;
        }
        if ($experience === 'professional') {
            $score += 12;
        }
        if (trim($phone) !== '') {
            $score += 8;
        }
        if (mb_strlen(trim($message)) > 40) {
            $score += 5;
        }
        return max(0, min(100, $score));
    }

    // ── Verlauf ────────────────────────────────────────────────────────

    public static function logActivity(
        int $leadId,
        string $type,
        string $title,
        ?int $userId = null,
        string $body = '',
        string $outcome = '',
        string $direction = '',
        int $durationS = 0,
        array $meta = [],
        ?string $occurredAt = null,
    ): int {
        return Db::insert(
            'INSERT INTO activities (lead_id, user_id, type, title, body, outcome, direction, duration_s, meta, occurred_at)
             VALUES (:lead, :user, :type, :title, :body, :outcome, :direction, :duration, :meta, COALESCE(:occurred, NOW()))',
            [
                'lead'      => $leadId,
                'user'      => $userId,
                'type'      => $type,
                'title'     => $title,
                'body'      => $body,
                'outcome'   => $outcome,
                'direction' => $direction,
                'duration'  => $durationS,
                'meta'      => json_encode($meta, JSON_UNESCAPED_UNICODE),
                'occurred'  => $occurredAt,
            ]
        );
    }

    /**
     * Stoppt die Reaktionsuhr. Nur die allererste Kontaktaufnahme zählt –
     * ein zweiter Aufruf ändert nichts und liefert null.
     */
    public static function markFirstContact(int $leadId, ?int $userId): ?int
    {
        $lead = Db::one('SELECT created_at, sla_due_at, first_contact_at, status FROM leads WHERE id = :id', ['id' => $leadId]);
        if ($lead === null || $lead['first_contact_at'] !== null) {
            return null;
        }

        $updated = Db::run(
            "UPDATE leads
                SET first_contact_at = NOW(),
                    first_contact_by = :user,
                    response_seconds = TIMESTAMPDIFF(SECOND, created_at, NOW()),
                    sla_breached     = CASE WHEN sla_due_at IS NOT NULL AND NOW() > sla_due_at THEN 1 ELSE 0 END,
                    status           = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
                    stage_changed_at = CASE WHEN status = 'new' THEN NOW() ELSE stage_changed_at END,
                    updated_at       = NOW()
              WHERE id = :id AND first_contact_at IS NULL",
            ['user' => $userId, 'id' => $leadId]
        );

        // Zwei gleichzeitige Klicks: nur der erste hat die Uhr gestoppt.
        if ($updated->rowCount() === 0) {
            return null;
        }

        $after = Db::one('SELECT response_seconds, sla_breached FROM leads WHERE id = :id', ['id' => $leadId]);
        $seconds = (int) ($after['response_seconds'] ?? 0);
        $breached = (bool) ($after['sla_breached'] ?? false);

        self::logActivity(
            $leadId,
            'first_contact',
            'Erstkontakt hergestellt',
            $userId,
            'Reaktionszeit: ' . self::formatDuration($seconds)
                . ($breached ? ' – SLA überschritten' : ' – innerhalb der SLA'),
            meta: ['seconds' => $seconds, 'breached' => $breached],
        );

        // Offene "Erstkontakt herstellen"-Aufgabe schließt sich mit.
        Db::run(
            "UPDATE tasks SET status = 'done', completed_at = NOW()
              WHERE lead_id = :lead AND status = 'open' AND kind = 'call' AND title LIKE 'Erstkontakt%'",
            ['lead' => $leadId]
        );

        return $seconds;
    }

    public static function formatDuration(int $seconds): string
    {
        if ($seconds < 60) {
            return $seconds . ' Sek.';
        }
        $minutes = intdiv($seconds, 60);
        if ($minutes < 60) {
            return $minutes . ' Min. ' . ($seconds % 60) . ' Sek.';
        }
        $hours = intdiv($minutes, 60);
        if ($hours < 24) {
            return $hours . ' Std. ' . ($minutes % 60) . ' Min.';
        }
        return intdiv($hours, 24) . ' Tg. ' . ($hours % 24) . ' Std.';
    }

    // ── Ausgabeform ────────────────────────────────────────────────────

    public static function find(int $id): ?array
    {
        return Db::one(self::SELECT . ' WHERE l.id = :id', ['id' => $id]);
    }

    /** Datenbankzeile → JSON-Form fürs Frontend. */
    public static function present(array $r): array
    {
        $band = (string) ($r['volume_band'] ?? '');
        $status = (string) $r['status'];

        return [
            'id'              => (int) $r['id'],
            'ref'             => $r['public_ref'],
            'firstName'       => $r['first_name'],
            'lastName'        => $r['last_name'],
            'name'            => trim($r['first_name'] . ' ' . $r['last_name']),
            'email'           => $r['email'],
            'phone'           => $r['phone'],
            'company'         => $r['company'],
            'city'            => $r['city'],
            'postalCode'      => $r['postal_code'],
            'country'         => $r['country'],
            // Die Sprache der Anfragestrecke. Sie steht im CRM als Merkmal am
            // Lead, damit niemand auf Deutsch zurueckruft, wo Englisch
            // gefragt war.
            'lang'            => (string) ($r['lang'] ?? 'de'),
            'customerId'      => isset($r['customer_id']) && $r['customer_id'] !== null
                ? (int) $r['customer_id'] : null,
            'assetClassId'    => $r['asset_class_id'] === null ? null : (int) $r['asset_class_id'],
            'assetClass'      => $r['asset_class_name'] ?? null,
            'assetClassSlug'  => $r['asset_class_slug'] ?? null,
            'teamId'          => $r['team_id'] === null ? null : (int) $r['team_id'],
            'team'            => $r['team_name'] ?? null,
            'teamColor'       => $r['team_color'] ?? null,
            'ownerId'         => $r['owner_id'] === null ? null : (int) $r['owner_id'],
            'owner'           => $r['owner_name'] === null ? null : [
                'id'     => (int) $r['owner_id'],
                'name'   => $r['owner_name'],
                'email'  => $r['owner_email'],
                'accent' => $r['owner_accent'],
                'avatar' => \App\Controllers\ProfileController::avatarUrl($r['owner_avatar'] ?? ''),
            ],
            'status'          => $status,
            'statusLabel'     => self::STATUS_LABELS[$status] ?? $status,
            'stageChangedAt'  => self::iso($r['stage_changed_at'] ?? null),
            'source'          => $r['source'],
            'score'           => (int) $r['score'],
            'volumeBand'      => $band,
            'volumeLabel'     => self::VOLUME_BANDS[$band]['label'] ?? $band,
            'volumeValue'     => (int) $r['volume_value'],
            'horizon'         => $r['horizon'],
            'horizonLabel'    => self::HORIZONS[$r['horizon']] ?? $r['horizon'],
            'experience'      => $r['experience'],
            'experienceLabel' => self::EXPERIENCE[$r['experience']] ?? $r['experience'],
            'goal'            => $r['goal'],
            'contactPref'     => $r['contact_pref'],
            'contactPrefLabel'=> self::CONTACT_PREFS[$r['contact_pref']] ?? $r['contact_pref'],
            // Die Beschriftung kommt aus den gepflegten Zeiten, damit im
            // CRM "Abends (19 – 21 Uhr)" steht und nicht "abends".
            'contactWindowLabel' => Hours::contactWindows()[$r['contact_window']]
                ?? self::CONTACT_WINDOWS[$r['contact_window']] ?? $r['contact_window'],
            'contactWindow'   => $r['contact_window'],
            'message'         => (string) ($r['message'] ?? ''),
            'wizard'          => $r['wizard_payload'] === null ? [] : (json_decode((string) $r['wizard_payload'], true) ?: []),
            'consentMarketing'=> (bool) $r['consent_marketing'],
            'slaDueAt'        => self::iso($r['sla_due_at'] ?? null),
            'firstContactAt'  => self::iso($r['first_contact_at'] ?? null),
            'firstContactBy'  => $r['first_contact_by'] === null ? null : (int) $r['first_contact_by'],
            'responseSeconds' => $r['response_seconds'] === null ? null : (int) $r['response_seconds'],
            'slaBreached'     => (bool) $r['sla_breached'],
            'hasPortal'       => ($r['portal_token'] ?? null) !== null,
            'portalToken'     => $r['portal_token'] ?? null,
            'portalLastLogin' => self::iso($r['portal_last_login'] ?? null),
            'lostReason'      => $r['lost_reason'],
            'createdAt'       => self::iso($r['created_at'] ?? null),
            'updatedAt'       => self::iso($r['updated_at'] ?? null),
        ];
    }

    /** MySQL-DATETIME (UTC) → ISO-8601 mit Z, damit der Browser lokalisiert. */
    public static function iso(?string $value): ?string
    {
        if ($value === null || $value === '' || str_starts_with($value, '0000')) {
            return null;
        }
        return str_replace(' ', 'T', $value) . 'Z';
    }
}
