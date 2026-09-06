<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Db;
use App\Core\Http;
use App\Core\Mailer;
use App\Domain\Leads;
use App\Domain\OfferDraft;

final class OffersController
{
    private const SELECT = 'SELECT o.*, u.name AS created_by_name FROM offers o
                              LEFT JOIN users u ON u.id = o.created_by';

    public static function aiStatus(): void
    {
        Auth::requireStaff();
        Http::json([
            'enabled' => OfferDraft::isEnabled(),
            'model'   => OfferDraft::isEnabled() ? OfferDraft::model() : null,
        ]);
    }

    public static function draft(): void
    {
        $me = Auth::requireStaff();
        $body = Http::body();
        $leadId = (int) ($body['leadId'] ?? 0);
        $instruction = mb_substr(trim((string) ($body['instruction'] ?? '')), 0, 2000);

        $lead = Leads::find($leadId);
        if ($lead === null) {
            Http::error('Lead nicht gefunden.', 404);
        }

        $draft = OfferDraft::create($lead, $instruction);

        $offerId = Db::insert(
            "INSERT INTO offers (lead_id, created_by, title, summary, body, amount, status, generated_by, valid_until)
             VALUES (:lead, :user, :title, :summary, :body, :amount, 'draft', :generated,
                     DATE_ADD(NOW(), INTERVAL 14 DAY))",
            [
                'lead'      => $leadId,
                'user'      => (int) $me['id'],
                'title'     => $draft['title'],
                'summary'   => $draft['summary'],
                'body'      => $draft['body'],
                'amount'    => $draft['amount'],
                'generated' => $draft['generatedBy'],
            ]
        );

        // Die vorgeschlagenen Schritte werden zu kundensichtbaren Aufgaben.
        foreach (array_values($draft['nextSteps']) as $i => $step) {
            Db::run(
                "INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, due_at, recurrence, visible_to_client)
                 VALUES (:lead, :owner, :creator, 'task', :title, DATE_ADD(NOW(), INTERVAL :days DAY), 'none', 1)",
                [
                    'lead'    => $leadId,
                    'owner'   => $lead['owner_id'],
                    'creator' => (int) $me['id'],
                    'title'   => $step,
                    'days'    => $i + 1,
                ]
            );
        }

        Leads::logActivity(
            $leadId,
            'system',
            $draft['generatedBy'] === 'ai' ? 'Angebotsentwurf per KI erstellt' : 'Angebotsentwurf aus Vorlage erstellt',
            (int) $me['id'],
            $draft['summary'],
            meta: ['offerId' => $offerId, 'generatedBy' => $draft['generatedBy']],
        );

        Http::json([
            'offer'       => self::present(Db::one(self::SELECT . ' WHERE o.id = :id', ['id' => $offerId]) ?? []),
            'nextSteps'   => $draft['nextSteps'],
            'note'        => $draft['note'],
            'generatedBy' => $draft['generatedBy'],
        ], 201);
    }

    public static function update(string $id): void
    {
        Auth::requireStaff();
        $offerId = (int) $id;
        if (Db::value('SELECT 1 FROM offers WHERE id = :id', ['id' => $offerId]) === null) {
            Http::error('Angebot nicht gefunden.', 404);
        }

        $body = Http::body();
        $sets = [];
        $params = ['id' => $offerId];

        foreach (['title' => 200, 'summary' => 1000, 'body' => 40000] as $field => $max) {
            if (isset($body[$field])) {
                $sets[] = "$field = :$field";
                $params[$field] = mb_substr((string) $body[$field], 0, $max);
            }
        }
        if (isset($body['amount'])) {
            $sets[] = 'amount = :amount';
            $params['amount'] = max(0, (int) $body['amount']);
        }
        if (isset($body['status']) && in_array($body['status'], ['draft', 'sent', 'accepted', 'declined'], true)) {
            $sets[] = 'status = :status';
            $params['status'] = $body['status'];
            if ($body['status'] === 'sent') {
                $sets[] = 'sent_at = NOW()';
            }
            if (in_array($body['status'], ['accepted', 'declined'], true)) {
                $sets[] = 'responded_at = NOW()';
            }
        }

        if ($sets !== []) {
            Db::run('UPDATE offers SET ' . implode(', ', $sets) . ' WHERE id = :id', $params);
        }

        Http::json(['offer' => self::present(Db::one(self::SELECT . ' WHERE o.id = :id', ['id' => $offerId]) ?? [])]);
    }

    /** Freigeben: im Portal sichtbar machen und den Kunden benachrichtigen. */
    public static function send(string $id): void
    {
        $me = Auth::requireStaff();
        $offerId = (int) $id;

        $offer = Db::one('SELECT * FROM offers WHERE id = :id', ['id' => $offerId]);
        if ($offer === null) {
            Http::error('Angebot nicht gefunden.', 404);
        }
        $lead = Leads::find((int) $offer['lead_id']);
        if ($lead === null) {
            Http::error('Lead nicht gefunden.', 404);
        }

        Db::run("UPDATE offers SET status = 'sent', sent_at = NOW() WHERE id = :id", ['id' => $offerId]);
        Db::run(
            "UPDATE leads
                SET status = CASE WHEN status IN ('new','contacted','qualified') THEN 'proposal' ELSE status END,
                    stage_changed_at = NOW(), updated_at = NOW()
              WHERE id = :id",
            ['id' => (int) $lead['id']]
        );

        $portalUrl = Config::baseUrl() . '/portal/' . $lead['portal_token'];
        Mailer::send(
            (string) $lead['email'],
            Mailer::offerReady(
                (string) $lead['first_name'],
                (string) $lead['public_ref'],
                (string) $offer['title'],
                (string) ($offer['summary'] ?? ''),
                $portalUrl
            ),
            (int) $lead['id']
        );

        Leads::logActivity(
            (int) $lead['id'],
            'offer_sent',
            'Angebot freigegeben: ' . $offer['title'],
            (int) $me['id'],
            'Im Kundenportal sichtbar, Benachrichtigung versendet.',
            meta: ['offerId' => $offerId],
        );

        Http::json(['offer' => self::present(Db::one(self::SELECT . ' WHERE o.id = :id', ['id' => $offerId]) ?? [])]);
    }

    public static function destroy(string $id): void
    {
        Auth::requireStaff();
        Db::run("DELETE FROM offers WHERE id = :id AND status = 'draft'", ['id' => (int) $id]);
        Http::json(['ok' => true]);
    }

    public static function present(array $o): array
    {
        if ($o === []) {
            return [];
        }
        return [
            'id'          => (int) $o['id'],
            'leadId'      => (int) $o['lead_id'],
            'title'       => $o['title'],
            'summary'     => $o['summary'],
            'body'        => (string) ($o['body'] ?? ''),
            'amount'      => (int) $o['amount'],
            'currency'    => $o['currency'],
            'status'      => $o['status'],
            'generatedBy' => $o['generated_by'],
            'validUntil'  => Leads::iso($o['valid_until']),
            'sentAt'      => Leads::iso($o['sent_at']),
            'respondedAt' => Leads::iso($o['responded_at']),
            'createdBy'   => $o['created_by_name'] ?? null,
            'createdAt'   => Leads::iso($o['created_at']),
        ];
    }
}
