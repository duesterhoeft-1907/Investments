<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Db;
use App\Core\Mailer;

/**
 * Die Aufnahme einer Anfrage – das Herzstück des Versprechens
 * "innerhalb von Minuten meldet sich ein Mensch".
 *
 * In einem Zug:
 *   1. Lead anlegen und über das Fachgebiet in die richtige Gruppe routen
 *   2. Reaktionsuhr starten (Frist aus der SLA der Gruppe)
 *   3. Fair einen Berater zuweisen
 *   4. Offene Aufgabe "Erstkontakt herstellen" erzeugen
 *   5. Gruppe alarmieren: Glocke, Toast, Gruppen-Chat und E-Mail
 *   6. Kundenportal anlegen und Eingangsbestätigung verschicken
 */
final class Intake
{
    /**
     * @param array<string,mixed> $in bereits geprüfte Eingaben
     * @return array{lead:array,portal:array,contact:?array,slaMinutes:int}
     */
    public static function submit(array $in): array
    {
        $assetClass = Db::one(
            'SELECT id, name, slug FROM asset_classes WHERE slug = :slug AND is_active = 1',
            ['slug' => (string) $in['assetClassSlug']]
        );

        $assetClassId = $assetClass === null ? null : (int) $assetClass['id'];
        $assetName    = $assetClass['name'] ?? 'Allgemeine Anfrage';
        $teamId       = Leads::teamForAssetClass($assetClassId);
        $slaMinutes   = Leads::slaMinutesForTeam($teamId);
        $ownerId      = Leads::pickOwner($teamId);

        $ref            = Leads::newRef();
        $portalToken    = Leads::newPortalToken();
        $portalPassword = Leads::newPortalPassword();
        $band           = Leads::VOLUME_BANDS[(string) $in['volumeBand']] ?? null;

        // Lead und Aufgabe gehören zusammen – entweder beides oder nichts.
        $leadId = Db::transaction(static function () use ($in, $ref, $assetClassId, $teamId, $ownerId, $slaMinutes, $band, $portalToken, $portalPassword): int {
            $id = Db::insert(
                'INSERT INTO leads (
                    public_ref, first_name, last_name, email, phone, company, city, postal_code, country,
                    asset_class_id, team_id, owner_id, status, stage_changed_at, source, score,
                    volume_band, volume_value, horizon, experience, goal, contact_pref, contact_window,
                    message, wizard_payload, consent_contact, consent_marketing,
                    sla_due_at, portal_token, portal_password_hash, created_at, updated_at
                 ) VALUES (
                    :ref, :first, :last, :email, :phone, :company, :city, :plz, :country,
                    :asset, :team, :owner, \'new\', NOW(), :source, :score,
                    :band, :value, :horizon, :experience, :goal, :pref, :window,
                    :message, :payload, 1, :marketing,
                    DATE_ADD(NOW(), INTERVAL :sla MINUTE), :token, :pwd, NOW(), NOW()
                 )',
                [
                    'ref'        => $ref,
                    'first'      => $in['firstName'],
                    'last'       => $in['lastName'],
                    'email'      => $in['email'],
                    'phone'      => $in['phone'],
                    'company'    => $in['company'],
                    'city'       => $in['city'],
                    'plz'        => $in['postalCode'],
                    'country'    => $in['country'] !== '' ? $in['country'] : 'DE',
                    'asset'      => $assetClassId,
                    'team'       => $teamId,
                    'owner'      => $ownerId,
                    'source'     => $in['source'] ?? 'wizard',
                    'score'      => Leads::score(
                        (string) $in['volumeBand'],
                        (string) $in['horizon'],
                        (string) $in['experience'],
                        (string) $in['phone'],
                        (string) $in['message'],
                    ),
                    'band'       => $in['volumeBand'],
                    'value'      => $band['value'] ?? 0,
                    'horizon'    => $in['horizon'],
                    'experience' => $in['experience'],
                    'goal'       => $in['goal'],
                    'pref'       => $in['contactPref'],
                    'window'     => $in['contactWindow'],
                    'message'    => $in['message'],
                    'payload'    => json_encode([
                        'goal'          => $in['goal'],
                        'contactWindow' => $in['contactWindow'],
                        'experience'    => $in['experience'],
                        'submittedAt'   => gmdate('c'),
                    ], JSON_UNESCAPED_UNICODE),
                    'marketing'  => $in['consentMarketing'] ? 1 : 0,
                    'sla'        => $slaMinutes,
                    'token'      => $portalToken,
                    'pwd'        => Auth::hash($portalPassword),
                ]
            );

            // Fälligkeit = SLA-Frist, damit der Lead auch in "Aufgaben" auftaucht.
            Db::run(
                "INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at, duration_min, recurrence)
                 VALUES (:lead, :owner, NULL, 'call', 'Erstkontakt herstellen', :desc,
                         DATE_ADD(NOW(), INTERVAL :sla MINUTE), 15, 'none')",
                [
                    'lead'  => $id,
                    'owner' => $ownerId,
                    'desc'  => $in['firstName'] . ' ' . $in['lastName'] . ' wartet auf den Rückruf – die Reaktionszeit läuft.',
                    'sla'   => $slaMinutes,
                ]
            );

            return $id;
        });

        Leads::logActivity(
            $leadId,
            'lead_created',
            'Anfrage über den Wizard eingegangen',
            body: 'Fachgebiet ' . $assetName . ($band !== null ? ' · Volumen ' . $band['label'] : ''),
            meta: ['source' => $in['source'] ?? 'wizard', 'assetClass' => $assetClass['slug'] ?? null],
        );

        $owner = $ownerId === null ? null : Db::one(
            'SELECT id, name, title, phone, email FROM users WHERE id = :id',
            ['id' => $ownerId]
        );

        if ($owner !== null) {
            Leads::logActivity(
                $leadId,
                'assignment',
                'Automatisch zugewiesen an ' . $owner['name'],
                body: 'Routing über Fachgebiet ' . $assetName . ' → Gruppe',
                meta: ['ownerId' => (int) $owner['id'], 'automatic' => true],
            );
        }

        $lead = Leads::present(Leads::find($leadId) ?? []);
        $base = Config::baseUrl();
        $leadUrl = $base . '/app/leads/' . $leadId;
        $portalUrl = $base . '/portal/' . $portalToken;

        // ── Gruppe alarmieren ──
        $memberIds = Leads::teamMemberIds($teamId);
        foreach ($memberIds as $memberId) {
            $isOwner = $memberId === $ownerId;
            Notify::send(
                $memberId,
                $isOwner ? 'assignment' : 'new_lead',
                $isOwner ? 'Dir zugewiesen: ' . $lead['name'] : 'Neuer Lead in ' . ($lead['team'] ?? 'deiner Gruppe'),
                $assetName . ' · ' . ($band['label'] ?? '') . ' · Reaktion innerhalb von ' . $slaMinutes . ' Min.',
                '/app/leads/' . $leadId,
                $leadId,
                $isOwner ? 'critical' : 'high',
            );
        }

        Events::toTeam($teamId, 'lead:new', ['lead' => $lead, 'slaMinutes' => $slaMinutes], $leadId);
        Events::toCompany('stats:dirty', ['reason' => 'lead:new']);

        // ── Meldung in den Gruppen-Chat ──
        $channel = Db::one("SELECT id FROM channels WHERE type = 'team' AND team_id = :team", ['team' => $teamId]);
        if ($channel !== null) {
            $body = 'Neuer Lead: ' . $lead['name'] . ' · ' . $assetName . ' · ' . ($band['label'] ?? '–')
                . ($owner !== null ? ' → ' . $owner['name'] : '');
            $messageId = Db::insert(
                "INSERT INTO messages (channel_id, user_id, body, kind, lead_id, meta)
                 VALUES (:channel, NULL, :body, 'lead_alert', :lead, :meta)",
                [
                    'channel' => (int) $channel['id'],
                    'body'    => $body,
                    'lead'    => $leadId,
                    'meta'    => json_encode(['ref' => $ref, 'slaMinutes' => $slaMinutes], JSON_UNESCAPED_UNICODE),
                ]
            );
            Events::toChannel((int) $channel['id'], 'chat:message', ['messageId' => $messageId, 'channelId' => (int) $channel['id']]);
        }

        // ── Mails ──
        $facts = [
            'ref'           => $ref,
            'name'          => $lead['name'],
            'firstName'     => $in['firstName'],
            'email'         => $in['email'],
            'phone'         => $in['phone'],
            'assetClass'    => $assetName,
            'volume'        => $band['label'] ?? (string) $in['volumeBand'],
            'horizon'       => $lead['horizonLabel'],
            'contactPref'   => $lead['contactPrefLabel'],
            'contactWindow' => $in['contactWindow'],
            'message'       => $in['message'],
            'slaMinutes'    => $slaMinutes,
        ];

        if ($memberIds !== []) {
            [$placeholders, $params] = Db::inClause('u', $memberIds);
            $members = Db::all("SELECT id, name, email FROM users WHERE id IN ($placeholders)", $params);
            foreach ($members as $member) {
                Mailer::send((string) $member['email'], Mailer::teamAlert($facts, (string) $member['name'], $leadUrl), $leadId);
            }
        }

        $contact = $owner === null ? null : [
            'name'  => (string) $owner['name'],
            'title' => (string) $owner['title'],
            'phone' => (string) $owner['phone'],
            'email' => (string) $owner['email'],
        ];

        Mailer::send((string) $in['email'], Mailer::leadWelcome($facts, $portalUrl, $portalPassword, $contact), $leadId);

        Leads::logActivity(
            $leadId,
            'email',
            'Eingangsbestätigung an den Interessenten versendet',
            direction: 'outbound',
            body: 'Portal-Zugang für ' . $in['email'] . ' erstellt.',
            meta: ['template' => 'lead_welcome'],
        );

        return [
            'lead'       => Leads::present(Leads::find($leadId) ?? []),
            'portal'     => ['url' => $portalUrl, 'token' => $portalToken, 'email' => $in['email'], 'password' => $portalPassword],
            'contact'    => $contact,
            'slaMinutes' => $slaMinutes,
        ];
    }
}
