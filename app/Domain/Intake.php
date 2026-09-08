<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Db;
use App\Core\I18n;
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
            'SELECT id, name, name_en, slug FROM asset_classes WHERE slug = :slug AND is_active = 1',
            ['slug' => (string) $in['assetClassSlug']]
        );

        /*
         * Wer fragt da? Erst den Menschen, dann die Anfrage.
         *
         * Meldet sich jemand zum zweiten Mal, ist das die wertvollste
         * Information, die diese Anfrage mitbringt – und die einzige, die
         * bisher verlorenging: bis hierher war jede Anfrage ein Fremder.
         */
        $kunde = Customers::findOrCreate($in);
        $wiederkehrer = $kunde['anfragen'] > 0;

        $assetClassId = $assetClass === null ? null : (int) $assetClass['id'];
        // Intern bleibt der deutsche Name stehen – Verlauf, Gruppen-Chat und
        // die Mail an das Fachteam lesen Kolleginnen und Kollegen.
        $assetName    = $assetClass['name'] ?? 'Allgemeine Anfrage';
        // In der Bestaetigung an den Interessenten steht er in dessen Sprache.
        $assetNameKunde = I18n::isEn() && (string) ($assetClass['name_en'] ?? '') !== ''
            ? (string) $assetClass['name_en']
            : $assetName;
        $teamId       = Leads::teamForAssetClass($assetClassId);
        $slaMinutes   = Leads::slaMinutesForTeam($teamId);
        /*
         * Wiederkehrende bekommen moeglichst denselben Menschen ans
         * Telefon. Der kennt den Vorgang schon, und der Anrufer muss
         * seine Geschichte nicht zum zweiten Mal erzaehlen. Ist die
         * Person nicht mehr da oder gerade abwesend, greift wieder die
         * normale Verteilung.
         */
        $ownerId      = ($wiederkehrer ? Customers::lastOwner($kunde['id'], $teamId) : null)
                        ?? Leads::pickOwner($teamId);
        $ownerBekannt = $wiederkehrer && $ownerId !== null
                        && $ownerId === Customers::lastOwner($kunde['id'], $teamId);
        // Die Uhr laeuft nur waehrend der Geschaeftszeiten – nachts ruht sie.
        $deadline     = Leads::slaDeadline($slaMinutes);

        $ref            = Leads::newRef();
        $portalToken    = Leads::newPortalToken();
        /*
         * Das Passwort wird nur einmal vergeben.
         *
         * Bei jeder Anfrage ein neues zu wuerfeln hiesse: die aeltere
         * Bestaetigungsmail wird stillschweigend ungueltig. Wer die
         * aufhebt und Wochen spaeter hervorholt, kommt nicht mehr hinein
         * und weiss nicht, warum. Also behaelt ein wiederkehrender Kunde
         * sein Passwort – die neue Mail nennt dann keins, sondern sagt,
         * dass die alten Zugangsdaten weiter gelten.
         */
        $hatZugang = $kunde['id'] > 0 && Db::value(
            'SELECT portal_password_hash FROM customers WHERE id = :id',
            ['id' => $kunde['id']]
        ) !== null;
        $portalPassword = $hatZugang ? null : Leads::newPortalPassword();
        $band           = Leads::VOLUME_BANDS[(string) $in['volumeBand']] ?? null;

        // Lead und Aufgabe gehören zusammen – entweder beides oder nichts.
        $leadId = Db::transaction(static function () use ($in, $ref, $kunde, $assetClassId, $teamId, $ownerId, $slaMinutes, $deadline, $band, $portalToken, $portalPassword): int {
            $id = Db::insert(
                'INSERT INTO leads (
                    public_ref, customer_id, first_name, last_name, email, phone, company, city, postal_code, country, lang,
                    asset_class_id, team_id, owner_id, status, stage_changed_at, source, score,
                    volume_band, volume_value, horizon, experience, goal, contact_pref, contact_window,
                    message, wizard_payload, consent_contact, consent_marketing,
                    sla_due_at, sla_warn_at, portal_token, portal_password_hash, created_at, updated_at
                 ) VALUES (
                    :ref, :kunde, :first, :last, :email, :phone, :company, :city, :plz, :country, :lang,
                    :asset, :team, :owner, \'new\', NOW(), :source, :score,
                    :band, :value, :horizon, :experience, :goal, :pref, :window,
                    :message, :payload, 1, :marketing,
                    :slaDue, :slaWarn, :token, :pwd, NOW(), NOW()
                 )',
                [
                    'ref'        => $ref,
                    'kunde'      => $kunde['id'] > 0 ? $kunde['id'] : null,
                    'first'      => $in['firstName'],
                    'last'       => $in['lastName'],
                    'email'      => $in['email'],
                    'phone'      => $in['phone'],
                    'company'    => $in['company'],
                    'city'       => $in['city'],
                    'plz'        => $in['postalCode'],
                    'country'    => $in['country'] !== '' ? $in['country'] : 'DE',
                    // In welcher Sprache die Anfrage gestellt wurde – danach
                    // richtet sich die Bestaetigung, nicht nach dem Land.
                    'lang'       => in_array($in['lang'] ?? 'de', ['de', 'en'], true) ? $in['lang'] : 'de',
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
                    'slaDue'     => $deadline['due'],
                    'slaWarn'    => $deadline['warn'],
                    'token'      => $portalToken,
                    'pwd'        => $portalPassword === null ? null : Auth::hash($portalPassword),
                ]
            );

            // Fälligkeit = SLA-Frist, damit der Lead auch in "Aufgaben" auftaucht.
            Db::run(
                "INSERT INTO tasks (lead_id, assigned_to, created_by, kind, title, description, due_at, duration_min, recurrence)
                 VALUES (:lead, :owner, NULL, 'call', 'Erstkontakt herstellen', :desc,
                         :slaDue, 15, 'none')",
                [
                    'lead'  => $id,
                    'owner' => $ownerId,
                    'desc'   => $in['firstName'] . ' ' . $in['lastName'] . ' wartet auf den Rückruf – die Reaktionszeit läuft.',
                    'slaDue' => $deadline['due'],
                ]
            );

            return $id;
        });

        /*
         * Das Portalpasswort gehoert dem Menschen, nicht der Anfrage.
         *
         * Vorher lag es nur am Lead, und die Anmeldung nahm die juengste
         * Anfrage zur Adresse – wer zum zweiten Mal fragte, kam mit dem
         * alten Passwort nicht mehr hinein und sah seine erste Anfrage
         * nie wieder. Jetzt gilt das zuletzt verschickte Passwort fuer
         * alles, was diesem Kunden gehoert.
         */
        if ($kunde['id'] > 0 && $portalPassword !== null) {
            Db::run(
                'UPDATE customers SET portal_password_hash = :pwd WHERE id = :id',
                ['pwd' => Auth::hash($portalPassword), 'id' => $kunde['id']]
            );
        }

        Leads::logActivity(
            $leadId,
            'lead_created',
            'Anfrage über den Wizard eingegangen',
            body: 'Fachgebiet ' . $assetName . ($band !== null ? ' · Volumen ' . $band['label'] : ''),
            meta: ['source' => $in['source'] ?? 'wizard', 'assetClass' => $assetClass['slug'] ?? null],
        );

        // Der Verlauf soll es ausdruecklich festhalten: hier klopft jemand
        // nicht zum ersten Mal an.
        $nummer = $kunde['anfragen'] + 1;
        if ($wiederkehrer) {
            Leads::logActivity(
                $leadId,
                'customer_return',
                'Wiederkehrender Interessent – ' . $nummer . '. Anfrage',
                body: 'Frühere Anfragen liegen unter derselben E-Mail-Adresse. '
                    . 'Der Verlauf lässt sich über den Kunden zusammen ansehen.',
                meta: ['customerId' => $kunde['id'], 'nummer' => $nummer],
            );
        }

        $owner = $ownerId === null ? null : Db::one(
            'SELECT id, name, title, phone, email, avatar_file FROM users WHERE id = :id',
            ['id' => $ownerId]
        );

        if ($owner !== null) {
            Leads::logActivity(
                $leadId,
                'assignment',
                'Automatisch zugewiesen an ' . $owner['name'],
                body: $ownerBekannt
                    ? 'Betreut den Kunden schon aus einer früheren Anfrage'
                    : 'Routing über Fachgebiet ' . $assetName . ' → Gruppe',
                meta: ['ownerId' => (int) $owner['id'], 'automatic' => true, 'bekannt' => $ownerBekannt],
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
                ($isOwner ? 'Dir zugewiesen: ' : 'Neuer Lead: ') . $lead['name']
                    . ($wiederkehrer ? ' (' . $nummer . '. Anfrage)' : ''),
                ($wiederkehrer ? 'Kennt uns schon · ' : '')
                    . $assetName . ' · ' . ($band['label'] ?? '') . ' · Reaktion innerhalb von ' . $slaMinutes . ' Min.',
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
            'assetClassLang'=> $assetNameKunde,
            'volume'        => $band['label'] ?? (string) $in['volumeBand'],
            'horizon'       => $lead['horizonLabel'],
            'contactPref'   => $lead['contactPrefLabel'],
            'contactWindow' => $in['contactWindow'],
            'message'       => $in['message'],
            'slaMinutes'    => $slaMinutes,
            // Ausserhalb der Geschaeftszeiten nennt das die naechste Oeffnung
            // statt einer Minutenzahl, die niemand einhalten koennte.
            'slaPromise'    => Hours::promise($slaMinutes),
        ];

        if ($memberIds !== []) {
            [$placeholders, $params] = Db::inClause('u', $memberIds);
            $members = Db::all("SELECT id, name, email FROM users WHERE id IN ($placeholders)", $params);
            foreach ($members as $member) {
                Mailer::send((string) $member['email'], Mailer::teamAlert($facts, (string) $member['name'], $leadUrl), $leadId);
            }
        }

        $contact = $owner === null ? null : [
            'name'   => (string) $owner['name'],
            'title'  => (string) $owner['title'],
            'phone'  => (string) $owner['phone'],
            'email'  => (string) $owner['email'],
            // Ein Gesicht dazu: das ist der Unterschied zwischen "jemand
            // aus dem Vertrieb" und "Nadja Weber".
            'avatar' => \App\Controllers\ProfileController::avatarUrl($owner['avatar_file'] ?? ''),
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

        /*
         * Was auf der Bestaetigungsseite steht, steht in der Sprache der
         * Anfrage. Der Datensatz selbst bleibt deutsch beschriftet – im CRM
         * soll "Sachwerte & Immobilien" stehen, egal woher die Anfrage kam.
         */
        $present = Leads::present(Leads::find($leadId) ?? []);
        if (I18n::isEn()) {
            $present['assetClass'] = $assetNameKunde;
            $teamNameEn = (string) (Db::value(
                'SELECT name_en FROM teams WHERE id = :id',
                ['id' => $teamId]
            ) ?? '');
            if ($teamNameEn !== '') {
                $present['team'] = $teamNameEn;
            }
        }

        return [
            'lead'       => $present,
            'portal'     => [
                'url'      => $portalUrl,
                'token'    => $portalToken,
                'email'    => $in['email'],
                // Leer bei einem wiederkehrenden Kunden: sein Passwort
                // gilt weiter, und ein neues gaebe es nur, um das alte
                // zu entwerten.
                'password' => $portalPassword,
                'isNew'    => $portalPassword !== null,
            ],
            'contact'    => $contact,
            'slaMinutes' => $slaMinutes,
        ];
    }
}
