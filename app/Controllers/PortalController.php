<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Db;
use App\Core\Http;
use App\Core\Validator;
use App\Domain\Events;
use App\Domain\Leads;
use App\Domain\Notify;

/** Kundenbereich – eigene Anmeldung, streng auf den eigenen Vorgang begrenzt. */
final class PortalController
{
    /** Bestätigt einen gültigen Link, ohne Daten preiszugeben. */
    public static function preview(string $token): void
    {
        $lead = Db::one(
            'SELECT l.first_name, l.public_ref, ac.name AS asset_class, u.name AS owner_name
               FROM leads l
               LEFT JOIN asset_classes ac ON ac.id = l.asset_class_id
               LEFT JOIN users u ON u.id = l.owner_id
              WHERE l.portal_token = :token',
            ['token' => $token]
        );

        if ($lead === null) {
            Http::error('Dieser Zugang ist nicht (mehr) gültig.', 404);
        }

        Http::json([
            'firstName'  => $lead['first_name'],
            'ref'        => $lead['public_ref'],
            'assetClass' => $lead['asset_class'],
            'advisor'    => $lead['owner_name'],
            'company'    => Config::get('company'),
        ]);
    }

    public static function login(): void
    {
        $v = new Validator(Http::body());
        $v->email('email')->text('password', 'das Passwort', 1, 200)->text('token', 'den Zugang', 0, 64, false);
        $clean = $v->orFail();

        $lead = $clean['token'] !== ''
            ? Db::one('SELECT * FROM leads WHERE portal_token = :t', ['t' => $clean['token']])
            : Db::one('SELECT * FROM leads WHERE email = :e ORDER BY id DESC LIMIT 1', ['e' => $clean['email']]);

        $ok = $lead !== null
            && $lead['portal_password_hash'] !== null
            && mb_strtolower((string) $lead['email']) === mb_strtolower((string) $clean['email'])
            && Auth::verify($clean['password'], (string) $lead['portal_password_hash']);

        if (!$ok) {
            Http::error('E-Mail oder Passwort stimmt nicht.', 401);
        }

        Db::run('UPDATE leads SET portal_last_login = NOW() WHERE id = :id', ['id' => (int) $lead['id']]);
        Auth::loginPortal((int) $lead['id']);
        Leads::logActivity((int) $lead['id'], 'portal_login', 'Kunde hat sich im Portal angemeldet');

        Http::json(['ok' => true, 'token' => $lead['portal_token'], 'csrf' => Auth::csrfToken()]);
    }

    public static function logout(): void
    {
        Auth::logoutPortal();
        Http::json(['ok' => true]);
    }

    public static function me(): void
    {
        $leadId = Auth::requirePortal();
        $row = Leads::find($leadId);
        if ($row === null) {
            Http::error('Vorgang nicht gefunden.', 404);
        }
        $lead = Leads::present($row);

        $advisor = $row['owner_id'] === null ? null : Db::one(
            'SELECT name, title, phone, email, accent FROM users WHERE id = :id',
            ['id' => (int) $row['owner_id']]
        );

        $nextSteps = Db::all(
            "SELECT id, kind, title, description, due_at, status FROM tasks
              WHERE lead_id = :id AND visible_to_client = 1 AND status <> 'cancelled'
              ORDER BY (status = 'open') DESC, due_at ASC LIMIT 20",
            ['id' => $leadId]
        );

        $offers = Db::all(
            "SELECT id, title, summary, body, amount, currency, status, valid_until, sent_at
               FROM offers WHERE lead_id = :id AND status <> 'draft' ORDER BY id DESC",
            ['id' => $leadId]
        );

        $documents = Db::all(
            'SELECT id, filename, stored_name, mime, size_bytes, created_at FROM attachments
              WHERE lead_id = :id AND visible_to_client = 1 ORDER BY id DESC',
            ['id' => $leadId]
        );

        $conversation = Db::all(
            "SELECT a.id, a.type, a.title, a.body, a.occurred_at, u.name AS user_name
               FROM activities a LEFT JOIN users u ON u.id = a.user_id
              WHERE a.lead_id = :id
                AND a.type IN ('client_message','offer_sent','meeting','first_contact','lead_created')
              ORDER BY a.occurred_at DESC LIMIT 30",
            ['id' => $leadId]
        );

        // Der Trichter, den der Kunde sieht – ohne "Verloren".
        $stages = ['new', 'contacted', 'qualified', 'proposal', 'won'];
        $stageIndex = array_search($lead['status'], $stages, true);

        Http::json([
            'company' => Config::get('company'),
            'lead' => [
                'ref'          => $lead['ref'],
                'firstName'    => $lead['firstName'],
                'lastName'     => $lead['lastName'],
                'email'        => $lead['email'],
                'phone'        => $lead['phone'],
                'assetClass'   => $lead['assetClass'],
                'volumeLabel'  => $lead['volumeLabel'],
                'horizonLabel' => $lead['horizonLabel'],
                'goal'         => $lead['goal'],
                'status'       => $lead['status'],
                'statusLabel'  => $lead['statusLabel'],
                'createdAt'    => $lead['createdAt'],
                'stageIndex'   => $stageIndex === false ? 0 : $stageIndex,
                'stages'       => array_map(
                    static fn (string $s): array => ['key' => $s, 'label' => Leads::STATUS_LABELS[$s]],
                    $stages
                ),
            ],
            'advisor'   => $advisor === null ? null : [
                'name'   => $advisor['name'],
                'title'  => $advisor['title'],
                'phone'  => $advisor['phone'],
                'email'  => $advisor['email'],
                'accent' => $advisor['accent'],
            ],
            'nextSteps' => array_map(static fn (array $t): array => [
                'id'          => (int) $t['id'],
                'kind'        => $t['kind'],
                'title'       => $t['title'],
                'description' => (string) ($t['description'] ?? ''),
                'dueAt'       => Leads::iso($t['due_at']),
                'done'        => $t['status'] === 'done',
            ], $nextSteps),
            'offers'    => array_map(static fn (array $o): array => [
                'id'         => (int) $o['id'],
                'title'      => $o['title'],
                'summary'    => $o['summary'],
                'body'       => (string) ($o['body'] ?? ''),
                'amount'     => (int) $o['amount'],
                'currency'   => $o['currency'],
                'status'     => $o['status'],
                'validUntil' => Leads::iso($o['valid_until']),
                'sentAt'     => Leads::iso($o['sent_at']),
            ], $offers),
            'documents' => array_map(static fn (array $d): array => [
                'id'        => (int) $d['id'],
                'filename'  => $d['filename'],
                'url'       => '/api/uploads/' . $d['stored_name'],
                'mime'      => $d['mime'],
                'sizeBytes' => (int) $d['size_bytes'],
                'createdAt' => Leads::iso($d['created_at']),
            ], $documents),
            'conversation' => array_map(static fn (array $c): array => [
                'id'         => (int) $c['id'],
                'type'       => $c['type'],
                'title'      => $c['title'],
                'body'       => (string) ($c['body'] ?? ''),
                'author'     => $c['user_name'],
                'occurredAt' => Leads::iso($c['occurred_at']),
            ], $conversation),
        ]);
    }

    public static function message(): void
    {
        $leadId = Auth::requirePortal();
        $v = new Validator(Http::body());
        $v->text('body', 'eine Nachricht', 2, 4000);
        $clean = $v->orFail();

        $lead = Leads::find($leadId);
        if ($lead === null) {
            Http::error('Vorgang nicht gefunden.', 404);
        }

        Leads::logActivity(
            $leadId,
            'client_message',
            'Nachricht aus dem Kundenportal',
            body: (string) $clean['body'],
            direction: 'inbound',
        );

        if ($lead['owner_id'] !== null) {
            Notify::send(
                (int) $lead['owner_id'],
                'client_message',
                'Nachricht von ' . $lead['first_name'] . ' ' . $lead['last_name'],
                mb_substr((string) $clean['body'], 0, 160),
                '/app/leads/' . $leadId,
                $leadId,
                'high',
            );
        }
        Events::toCompany('lead:updated', ['lead' => Leads::present(Leads::find($leadId) ?? [])], $leadId);

        Http::json(['ok' => true], 201);
    }

    public static function respondToOffer(): void
    {
        $leadId = Auth::requirePortal();
        $body = Http::body();
        $offerId = (int) ($body['offerId'] ?? 0);
        $decision = (string) ($body['decision'] ?? '');

        if (!in_array($decision, ['accepted', 'declined'], true)) {
            Http::error('Unbekannte Entscheidung.', 400);
        }

        $offer = Db::one('SELECT * FROM offers WHERE id = :id AND lead_id = :lead', ['id' => $offerId, 'lead' => $leadId]);
        if ($offer === null) {
            Http::error('Angebot nicht gefunden.', 404);
        }
        if ($offer['status'] !== 'sent') {
            Http::error('Dieses Angebot kann nicht mehr beantwortet werden.', 400);
        }

        $lead = Leads::find($leadId);
        $note = mb_substr(trim((string) ($body['note'] ?? '')), 0, 2000);

        Db::run('UPDATE offers SET status = :s, responded_at = NOW() WHERE id = :id', ['s' => $decision, 'id' => $offerId]);
        Db::run(
            'UPDATE leads SET status = :s, stage_changed_at = NOW(), updated_at = NOW() WHERE id = :id',
            ['s' => $decision === 'accepted' ? 'won' : 'lost', 'id' => $leadId]
        );

        Leads::logActivity(
            $leadId,
            'client_message',
            ($decision === 'accepted' ? 'Angebot angenommen: ' : 'Angebot abgelehnt: ') . $offer['title'],
            body: $note,
            direction: 'inbound',
            meta: ['offerId' => $offerId, 'decision' => $decision],
        );

        if (($lead['owner_id'] ?? null) !== null) {
            Notify::send(
                (int) $lead['owner_id'],
                'client_message',
                $decision === 'accepted' ? 'Angebot angenommen' : 'Angebot abgelehnt',
                $lead['first_name'] . ' ' . $lead['last_name'] . ' · ' . $offer['title'],
                '/app/leads/' . $leadId,
                $leadId,
                'critical',
            );
        }

        Events::toCompany('lead:updated', ['lead' => Leads::present(Leads::find($leadId) ?? [])], $leadId);
        Events::toCompany('stats:dirty', ['reason' => 'offer:respond']);

        Http::json(['ok' => true]);
    }

    public static function changePassword(): void
    {
        $leadId = Auth::requirePortal();
        $v = new Validator(Http::body());
        $v->text('currentPassword', 'das aktuelle Passwort', 1, 200)
          ->text('newPassword', 'das neue Passwort', 8, 200);
        $clean = $v->orFail();

        $hash = (string) Db::value('SELECT portal_password_hash FROM leads WHERE id = :id', ['id' => $leadId]);
        if (!Auth::verify($clean['currentPassword'], $hash)) {
            Http::error('Aktuelles Passwort stimmt nicht.', 400);
        }

        Db::run('UPDATE leads SET portal_password_hash = :h WHERE id = :id', [
            'h'  => Auth::hash($clean['newPassword']),
            'id' => $leadId,
        ]);
        Http::json(['ok' => true]);
    }
}
