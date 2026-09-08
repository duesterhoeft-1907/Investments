<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Db;

/**
 * Der Mensch hinter den Anfragen.
 *
 * Bis hierher war jede Anfrage ein Fremder. Wer sich zum dritten Mal
 * meldete, wurde dreimal neu erfasst: dreimal dieselbe Frage am Telefon,
 * drei Portalzugaenge, und niemand sah, dass hier jemand zum dritten Mal
 * anklopft – dabei ist genau das die interessanteste Information, die
 * eine Anfrage mitbringen kann.
 *
 * Erkannt wird ueber die E-Mail-Adresse, kleingeschrieben und ohne
 * Leerraum. Das ist nicht perfekt: wer zwei Adressen benutzt, zaehlt
 * zweimal. Aber es ist die einzige Angabe, die im Wizard verpflichtend
 * ist, die Menschen selten vertippen und die sich maschinell vergleichen
 * laesst – bei Namen und Telefonnummern ist beides nicht so.
 *
 * Die Stammdaten stehen doppelt: hier der aktuelle Stand, am Lead der
 * Stand zum Zeitpunkt der Anfrage. Das ist Absicht. Zieht jemand um,
 * bleibt die alte Anfrage mit der alten Adresse richtig – sie wurde ja
 * damals so gestellt.
 */
final class Customers
{
    /** Vergleichbare Form einer E-Mail-Adresse. */
    public static function normalise(string $email): string
    {
        return mb_strtolower(trim($email));
    }

    /**
     * Findet den Kunden zur Anfrage – oder legt ihn an.
     *
     * Bei einem Wiedersehen werden die Stammdaten aufgefrischt, aber nur
     * dort, wo jetzt etwas steht: wer die Telefonnummer diesmal weglaesst,
     * soll die von letztem Mal nicht verlieren.
     *
     * @param array<string,mixed> $in geprüfte Eingaben aus dem Wizard
     * @return array{id:int, neu:bool, anfragen:int}
     */
    public static function findOrCreate(array $in): array
    {
        $email = self::normalise((string) ($in['email'] ?? ''));
        if ($email === '') {
            return ['id' => 0, 'neu' => true, 'anfragen' => 0];
        }

        $vorhanden = Db::one('SELECT id FROM customers WHERE email = :e', ['e' => $email]);

        if ($vorhanden === null) {
            $id = Db::insert(
                'INSERT INTO customers (email, first_name, last_name, phone, company, city,
                                        postal_code, country, lang)
                 VALUES (:email, :first, :last, :phone, :company, :city, :plz, :country, :lang)',
                [
                    'email'   => $email,
                    'first'   => (string) ($in['firstName'] ?? ''),
                    'last'    => (string) ($in['lastName'] ?? ''),
                    'phone'   => (string) ($in['phone'] ?? ''),
                    'company' => (string) ($in['company'] ?? ''),
                    'city'    => (string) ($in['city'] ?? ''),
                    'plz'     => (string) ($in['postalCode'] ?? ''),
                    'country' => ($in['country'] ?? '') !== '' ? (string) $in['country'] : 'DE',
                    'lang'    => in_array($in['lang'] ?? 'de', ['de', 'en'], true) ? (string) $in['lang'] : 'de',
                ]
            );
            return ['id' => $id, 'neu' => true, 'anfragen' => 0];
        }

        $id = (int) $vorhanden['id'];

        // NULLIF(:wert, '') laesst leere Angaben durchfallen, COALESCE
        // behaelt dann den bisherigen Wert.
        Db::run(
            "UPDATE customers SET
                first_name  = COALESCE(NULLIF(:first, ''), first_name),
                last_name   = COALESCE(NULLIF(:last, ''), last_name),
                phone       = COALESCE(NULLIF(:phone, ''), phone),
                company     = COALESCE(NULLIF(:company, ''), company),
                city        = COALESCE(NULLIF(:city, ''), city),
                postal_code = COALESCE(NULLIF(:plz, ''), postal_code),
                country     = COALESCE(NULLIF(:country, ''), country),
                lang        = :lang
              WHERE id = :id",
            [
                'first'   => (string) ($in['firstName'] ?? ''),
                'last'    => (string) ($in['lastName'] ?? ''),
                'phone'   => (string) ($in['phone'] ?? ''),
                'company' => (string) ($in['company'] ?? ''),
                'city'    => (string) ($in['city'] ?? ''),
                'plz'     => (string) ($in['postalCode'] ?? ''),
                'country' => (string) ($in['country'] ?? ''),
                'lang'    => in_array($in['lang'] ?? 'de', ['de', 'en'], true) ? (string) $in['lang'] : 'de',
                'id'      => $id,
            ]
        );

        $anfragen = (int) (Db::value('SELECT COUNT(*) FROM leads WHERE customer_id = :id', ['id' => $id]) ?? 0);
        return ['id' => $id, 'neu' => false, 'anfragen' => $anfragen];
    }

    /** @return array<string,mixed>|null */
    public static function find(int $id): ?array
    {
        $row = Db::one('SELECT * FROM customers WHERE id = :id', ['id' => $id]);
        return $row === null ? null : self::present($row);
    }

    /** @return array<string,mixed>|null */
    public static function byEmail(string $email): ?array
    {
        $row = Db::one('SELECT * FROM customers WHERE email = :e', ['e' => self::normalise($email)]);
        return $row === null ? null : self::present($row);
    }

    /**
     * Die Anfragen eines Kunden, knapp – fuer die Liste am Lead und im
     * Kundenbereich. Ohne Verlauf und Anhaenge; wer die will, oeffnet die
     * Anfrage.
     *
     * @return list<array<string,mixed>>
     */
    public static function leads(int $customerId, ?int $ausser = null): array
    {
        $rows = Db::all(
            'SELECT l.id, l.public_ref, l.status, l.created_at, l.volume_band, l.volume_value,
                    l.score, l.first_contact_at, l.sla_due_at, l.contact_window, l.goal, l.message,
                    ac.name AS asset_class_name, t.name AS team_name, t.color AS team_color,
                    u.name AS owner_name
               FROM leads l
               LEFT JOIN asset_classes ac ON ac.id = l.asset_class_id
               LEFT JOIN teams t  ON t.id = l.team_id
               LEFT JOIN users u  ON u.id = l.owner_id
              WHERE l.customer_id = :id
              ORDER BY l.created_at DESC, l.id DESC',
            ['id' => $customerId]
        );

        $out = [];
        foreach ($rows as $r) {
            $id = (int) $r['id'];
            if ($ausser !== null && $id === $ausser) {
                continue;
            }
            $band = (string) $r['volume_band'];
            $out[] = [
                'id'            => $id,
                'ref'           => $r['public_ref'],
                'status'        => $r['status'],
                'statusLabel'   => Leads::STATUS_LABELS[$r['status']] ?? $r['status'],
                'createdAt'     => Leads::iso($r['created_at']),
                'assetClass'    => $r['asset_class_name'],
                'team'          => $r['team_name'],
                'teamColor'     => $r['team_color'],
                'owner'         => $r['owner_name'],
                'volumeLabel'   => Leads::VOLUME_BANDS[$band]['label'] ?? $band,
                'volumeValue'   => (int) $r['volume_value'],
                'score'         => (int) $r['score'],
                'contactWindow' => $r['contact_window'],
                'goal'          => $r['goal'],
                'message'       => $r['message'],
                'answered'      => $r['first_contact_at'] !== null,
            ];
        }
        return $out;
    }

    /**
     * Was ein Kunde bisher gebracht hat.
     *
     * @return array<string,mixed>
     */
    public static function summary(int $customerId): array
    {
        $row = Db::one(
            "SELECT COUNT(*) AS anzahl,
                    MIN(created_at) AS erste,
                    MAX(created_at) AS letzte,
                    SUM(volume_value) AS volumen,
                    SUM(status = 'won')  AS gewonnen,
                    SUM(status = 'lost') AS verloren
               FROM leads WHERE customer_id = :id",
            ['id' => $customerId]
        ) ?? [];

        return [
            'count'    => (int) ($row['anzahl'] ?? 0),
            'first'    => Leads::iso($row['erste'] ?? null),
            'last'     => Leads::iso($row['letzte'] ?? null),
            'volume'   => (int) ($row['volumen'] ?? 0),
            'won'      => (int) ($row['gewonnen'] ?? 0),
            'lost'     => (int) ($row['verloren'] ?? 0),
        ];
    }

    /**
     * Der Verlauf ueber alle Anfragen hinweg.
     *
     * Genau das meint "zusammenfassen": wer schon zweimal angerufen hat,
     * soll das nicht in zwei getrennten Listen suchen muessen. Jeder
     * Eintrag traegt deshalb mit, zu welcher Anfrage er gehoert.
     *
     * @return list<array<string,mixed>>
     */
    public static function activities(int $customerId, int $limit = 200): array
    {
        return Db::all(
            'SELECT a.*, u.name AS user_name, u.accent AS user_accent,
                    l.public_ref AS lead_ref, l.id AS lead_ref_id,
                    ac.name AS lead_asset_class
               FROM activities a
               JOIN leads l ON l.id = a.lead_id
               LEFT JOIN users u ON u.id = a.user_id
               LEFT JOIN asset_classes ac ON ac.id = l.asset_class_id
              WHERE l.customer_id = :id
              ORDER BY a.occurred_at DESC, a.id DESC
              LIMIT ' . max(1, min(500, $limit)),
            ['id' => $customerId]
        );
    }

    /**
     * Wer den Kunden zuletzt betreut hat.
     *
     * Ein wiederkehrender Interessent soll moeglichst denselben Menschen
     * ans Telefon bekommen – der kennt den Vorgang schon. Nur wenn die
     * Person nicht mehr aktiv oder gerade abwesend ist, greift wieder die
     * normale Verteilung.
     */
    public static function lastOwner(int $customerId, ?int $teamId): ?int
    {
        $row = Db::one(
            'SELECT l.owner_id
               FROM leads l
               JOIN users u ON u.id = l.owner_id
              WHERE l.customer_id = :id
                AND u.is_active = 1
                AND (u.away_until IS NULL OR u.away_until < NOW())
                AND (:team IS NULL OR l.team_id = :team2)
              ORDER BY l.created_at DESC, l.id DESC
              LIMIT 1',
            ['id' => $customerId, 'team' => $teamId, 'team2' => $teamId]
        );
        return $row === null ? null : (int) $row['owner_id'];
    }

    /** @param array<string,mixed> $r */
    private static function present(array $r): array
    {
        return [
            'id'         => (int) $r['id'],
            'email'      => $r['email'],
            'firstName'  => $r['first_name'],
            'lastName'   => $r['last_name'],
            'name'       => trim($r['first_name'] . ' ' . $r['last_name']),
            'phone'      => $r['phone'],
            'company'    => $r['company'],
            'city'       => $r['city'],
            'postalCode' => $r['postal_code'],
            'country'    => $r['country'],
            'lang'       => $r['lang'],
            'note'       => $r['note'],
            'createdAt'  => Leads::iso($r['created_at']),
            'lastLogin'  => Leads::iso($r['portal_last_login'] ?? null),
            'hasPortal'  => $r['portal_password_hash'] !== null,
        ];
    }
}
