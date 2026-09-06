<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Config;
use App\Core\Db;

/**
 * Angebotsentwurf aus Bedarf und gesamtem Gesprächsverlauf.
 *
 * Mit ANTHROPIC_API_KEY über die Claude API, sonst über einen strukturierten
 * Textbaustein – die Funktion ist damit nie blockiert und die Anwendung hat
 * keine harte Abhängigkeit nach außen.
 *
 * Der Aufruf läuft bewusst über cURL statt über das offizielle PHP-SDK:
 * das Projekt soll ohne "composer install" auf Shared Hosting laufen. Wer
 * später Composer einsetzt, kann diese eine Klasse gegen das SDK tauschen –
 * sonst ändert sich nichts.
 */
final class OfferDraft
{
    private const ENDPOINT = 'https://api.anthropic.com/v1/messages';
    private const API_VERSION = '2023-06-01';

    public static function isEnabled(): bool
    {
        return (string) Config::get('anthropic.api_key', '') !== '';
    }

    public static function model(): string
    {
        return (string) Config::get('anthropic.model', 'claude-opus-5');
    }

    /**
     * @return array{title:string,summary:string,body:string,amount:int,nextSteps:list<string>,generatedBy:string,note:?string}
     */
    public static function create(array $leadRow, string $instruction): array
    {
        $lead = Leads::present($leadRow);
        $dossier = self::buildDossier($lead, (int) $leadRow['id']);

        if (!self::isEnabled()) {
            return self::template($lead, $instruction, 'Kein API-Schlüssel hinterlegt – Textbaustein verwendet.');
        }

        try {
            $text = self::callApi($dossier, $instruction);
        } catch (\Throwable $e) {
            error_log('[ai] Angebotsentwurf fehlgeschlagen: ' . $e->getMessage());
            return self::template($lead, $instruction, 'Die KI war nicht erreichbar – Textbaustein verwendet.');
        }

        $parsed = self::parse($text);
        if ($parsed === null) {
            return self::template($lead, $instruction, 'Antwort war nicht auswertbar – Textbaustein verwendet.');
        }

        return $parsed + ['generatedBy' => 'ai', 'note' => null];
    }

    private static function buildDossier(array $lead, int $leadId): string
    {
        $activities = Db::all(
            'SELECT a.type, a.title, a.body, a.outcome, a.duration_s, a.occurred_at, u.name AS user_name
               FROM activities a LEFT JOIN users u ON u.id = a.user_id
              WHERE a.lead_id = :id ORDER BY a.occurred_at ASC LIMIT 60',
            ['id' => $leadId]
        );

        $history = [];
        foreach ($activities as $a) {
            $when = mb_substr((string) $a['occurred_at'], 0, 16);
            $who = $a['user_name'] !== null ? ' (' . $a['user_name'] . ')' : '';
            $detail = trim(implode(' – ', array_filter([
                (string) ($a['body'] ?? ''),
                $a['outcome'] !== '' ? 'Ergebnis: ' . $a['outcome'] : '',
            ])));
            $duration = (int) $a['duration_s'] > 0 ? ' [' . Leads::formatDuration((int) $a['duration_s']) . ']' : '';
            $history[] = '- ' . $when . ' · ' . $a['type'] . $who . ': ' . $a['title'] . $duration
                . ($detail !== '' ? ' — ' . $detail : '');
        }

        return implode("\n", [
            'Referenz: ' . $lead['ref'],
            'Name: ' . $lead['name'] . ($lead['company'] !== '' ? ' (' . $lead['company'] . ')' : ''),
            'Ort: ' . trim($lead['postalCode'] . ' ' . $lead['city']),
            'Fachgebiet: ' . ($lead['assetClass'] ?? 'unbekannt'),
            'Zuständige Gruppe: ' . ($lead['team'] ?? 'unbekannt'),
            'Berater: ' . ($lead['owner']['name'] ?? 'noch nicht zugewiesen'),
            'Anlagevolumen: ' . ($lead['volumeLabel'] !== '' ? $lead['volumeLabel'] : 'unbekannt')
                . ' (kalkulatorisch ' . $lead['volumeValue'] . ' EUR)',
            'Anlagehorizont: ' . ($lead['horizonLabel'] !== '' ? $lead['horizonLabel'] : 'unbekannt'),
            'Erfahrung: ' . ($lead['experienceLabel'] !== '' ? $lead['experienceLabel'] : 'unbekannt'),
            'Ziel: ' . ($lead['goal'] !== '' ? $lead['goal'] : '–'),
            'Status: ' . $lead['statusLabel'],
            'Nachricht des Interessenten: ' . ($lead['message'] !== '' ? $lead['message'] : '–'),
            '',
            'Bisheriger Verlauf:',
            $history === [] ? '- (noch keine Einträge)' : implode("\n", $history),
        ]);
    }

    private static function systemPrompt(): string
    {
        $company = (string) Config::get('company.name', '');

        return implode("\n", [
            "Du bist erfahrener Anlageberater bei {$company} und schreibst den Entwurf",
            'eines individuellen Angebots für einen Interessenten.',
            '',
            'Regeln:',
            '- Schreibe auf Deutsch, in der Sie-Form, sachlich und ohne Superlative.',
            '- Nutze ausschließlich Fakten aus dem Dossier. Erfinde keine Preise, Renditen,',
            '  Produktnamen oder Zusagen. Wo eine Zahl fehlt, formuliere einen Platzhalter',
            '  in eckigen Klammern, z. B. [Tagespreis einsetzen].',
            '- Keine Renditeversprechen und keine steuerliche oder rechtliche Beratung.',
            '- Der Entwurf geht an den Berater zur Prüfung, nicht direkt an den Kunden.',
            '',
            'Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown-Codefence:',
            '{"title": string, "summary": string, "body": string, "amount": number, "nextSteps": string[]}',
            '- title: kurzer Angebotstitel',
            '- summary: 1–2 Sätze Zusammenfassung',
            '- body: Angebotstext in Markdown, 250–450 Wörter',
            '- amount: empfohlenes Anlagevolumen in EUR als Zahl',
            '- nextSteps: 3–5 konkrete nächste Schritte',
        ]);
    }

    private static function callApi(string $dossier, string $instruction): string
    {
        $payload = [
            'model'      => self::model(),
            'max_tokens' => 16000,
            'system'     => self::systemPrompt(),
            'thinking'      => ['type' => 'adaptive'],
            'output_config' => ['effort' => 'medium'],
            'messages'   => [[
                'role'    => 'user',
                'content' => "Dossier:\n" . $dossier . "\n\nZusätzliche Anweisung des Beraters:\n"
                    . ($instruction !== '' ? $instruction : '(keine)'),
            ]],
        ];

        $ch = curl_init(self::ENDPOINT);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 180,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HTTPHEADER     => [
                'content-type: application/json',
                'x-api-key: ' . Config::get('anthropic.api_key'),
                'anthropic-version: ' . self::API_VERSION,
            ],
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ]);

        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new \RuntimeException('Verbindung zur Claude API fehlgeschlagen: ' . $error);
        }
        if ($status !== 200) {
            throw new \RuntimeException('Claude API antwortete mit Status ' . $status . ': ' . mb_substr((string) $response, 0, 300));
        }

        $data = json_decode((string) $response, true);
        if (!is_array($data)) {
            throw new \RuntimeException('Antwort der Claude API war kein gültiges JSON.');
        }

        // Sicherheitsklassifizierer können ablehnen – das ist kein Fehler,
        // sondern ein regulärer Abschlussgrund, den wir abfangen müssen.
        if (($data['stop_reason'] ?? '') === 'refusal') {
            throw new \RuntimeException('Die Anfrage wurde vom Modell abgelehnt.');
        }

        $text = '';
        foreach ($data['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'text') {
                $text .= $block['text'];
            }
        }

        if (trim($text) === '') {
            throw new \RuntimeException('Die Antwort enthielt keinen Text.');
        }
        return $text;
    }

    /** Toleranter Parser – akzeptiert auch ein in Fließtext eingebettetes Objekt. */
    private static function parse(string $text): ?array
    {
        $candidates = [trim($text)];
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $text, $m) === 1) {
            $candidates[] = trim($m[1]);
        }
        $start = strpos($text, '{');
        $end = strrpos($text, '}');
        if ($start !== false && $end !== false && $end > $start) {
            $candidates[] = substr($text, $start, $end - $start + 1);
        }

        foreach ($candidates as $candidate) {
            $data = json_decode($candidate, true);
            if (!is_array($data) || !isset($data['title'], $data['body'])) {
                continue;
            }
            $steps = [];
            foreach (array_slice((array) ($data['nextSteps'] ?? []), 0, 8) as $step) {
                $steps[] = mb_substr((string) $step, 0, 200);
            }
            return [
                'title'     => mb_substr((string) $data['title'], 0, 200),
                'summary'   => mb_substr((string) ($data['summary'] ?? ''), 0, 1000),
                'body'      => (string) $data['body'],
                'amount'    => (int) round((float) ($data['amount'] ?? 0)),
                'nextSteps' => $steps,
            ];
        }
        return null;
    }

    /** Fällt immer zurück auf einen brauchbaren, strukturierten Entwurf. */
    private static function template(array $lead, string $instruction, string $note): array
    {
        $asset = $lead['assetClass'] ?? 'Ihre gewünschte Anlageklasse';
        $volume = $lead['volumeLabel'] !== '' ? $lead['volumeLabel'] : '[Volumen ergänzen]';
        $advisor = $lead['owner']['name'] ?? '[Berater einsetzen]';
        $hint = $instruction !== '' ? "> Hinweis des Beraters: {$instruction}\n\n" : '';

        $body = <<<MD
        ## Ihr persönliches Angebot

        Sehr geehrte/r {$lead['name']},

        vielen Dank für Ihr Interesse an **{$asset}**. Auf Basis unseres Gesprächs fassen wir
        Ihre Ausgangslage wie folgt zusammen:

        - **Anlageziel:** {$lead['goal']}
        - **Volumen:** {$volume}
        - **Anlagehorizont:** {$lead['horizonLabel']}
        - **Erfahrung:** {$lead['experienceLabel']}

        ### Unser Vorschlag

        Wir empfehlen einen gestaffelten Einstieg in {$asset}. Die konkrete Stückelung und die
        Verwahrform stimmen wir im nächsten Gespräch auf Ihre Liquiditätsplanung ab.
        Der tagesaktuelle Preis wird bei Zeichnung verbindlich festgelegt: [Tagespreis einsetzen].

        ### Konditionen

        | Position | Wert |
        | --- | --- |
        | Anlagevolumen | {$volume} |
        | Aufgeld / Gebühren | [einsetzen] |
        | Verwahrung | [Verwahrform einsetzen] |
        | Gültigkeit | 14 Tage ab Versand |

        {$hint}Ihr Ansprechpartner {$advisor} begleitet Sie durch den gesamten Prozess.

        *Dieses Dokument ist ein unverbindlicher Entwurf und stellt keine Anlageberatung dar.*
        MD;

        return [
            'title'       => 'Angebot ' . $asset . ' – ' . $lead['name'],
            'summary'     => 'Entwurf für ein Investment in ' . $asset . ' über ' . $volume . '.',
            'body'        => $body,
            'amount'      => (int) $lead['volumeValue'],
            'nextSteps'   => [
                'Angebot prüfen und Platzhalter mit Tagespreisen füllen',
                'Rückfragen des Interessenten telefonisch klären',
                'Angebot im Kundenportal freigeben',
                'Zeichnungsunterlagen vorbereiten',
            ],
            'generatedBy' => 'template',
            'note'        => $note,
        ];
    }
}
