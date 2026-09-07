<?php
declare(strict_types=1);

namespace App\Core;

use Throwable;

/**
 * Versand plus Protokoll. Jede Mail landet in email_log – auch die, die nicht
 * verschickt werden konnte oder mangels SMTP-Zugang nur protokolliert wurde.
 * So ist im CRM unter "Postausgang" immer nachvollziehbar, was rausging.
 */
final class Mailer
{
    public static function isConfigured(): bool
    {
        return (string) Config::get('smtp.host', '') !== '';
    }

    public static function mode(): string
    {
        return self::isConfigured() ? 'smtp' : 'log';
    }

    /** @param array{subject:string,html:string,text:string,template:string} $mail */
    public static function send(string $to, array $mail, ?int $leadId = null): bool
    {
        $status = 'logged';
        $error = '';

        if (self::isConfigured()) {
            try {
                $smtp = new Smtp(
                    (string) Config::get('smtp.host'),
                    (int) Config::get('smtp.port', 587),
                    (string) Config::get('smtp.secure', 'tls'),
                    (string) Config::get('smtp.user', ''),
                    (string) Config::get('smtp.pass', ''),
                );
                $smtp->send(
                    (string) Config::get('smtp.from_address'),
                    (string) Config::get('smtp.from_name', Config::get('company.name', '')),
                    [$to],
                    $mail['subject'],
                    $mail['html'],
                    $mail['text'],
                );
                $status = 'sent';
            } catch (Throwable $e) {
                $status = 'failed';
                $error = mb_substr($e->getMessage(), 0, 480);
                error_log('[mail] Versand an ' . $to . ' fehlgeschlagen: ' . $error);
            }
        }

        Db::run(
            'INSERT INTO email_log (lead_id, to_address, subject, template, preview, status, error)
             VALUES (:lead, :to, :subject, :template, :preview, :status, :error)',
            [
                'lead'     => $leadId,
                'to'       => $to,
                'subject'  => $mail['subject'],
                'template' => $mail['template'],
                'preview'  => mb_substr($mail['text'], 0, 4000),
                'status'   => $status,
                'error'    => $error,
            ]
        );

        return $status !== 'failed';
    }

    // ───────────────────────── Vorlagen ─────────────────────────

    private const ACCENT = '#21b4a6';   // Leitton der Marke
    private const INK = '#0B0F14';
    private const PAPER = '#F6F3EC';

    public static function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function layout(string $title, string $bodyHtml): string
    {
        $company = self::esc((string) Config::get('company.name', ''));
        $phone = self::esc((string) Config::get('company.phone', ''));
        $email = self::esc((string) Config::get('company.email', ''));
        $accent = self::ACCENT;
        $ink = self::INK;
        $paper = self::PAPER;

        return <<<HTML
        <!doctype html><html lang="de"><body style="margin:0;background:{$ink};padding:32px 16px;font-family:Helvetica,Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:{$paper};border-radius:16px;overflow:hidden;">
            <tr><td style="background:{$ink};padding:24px 32px;border-bottom:2px solid {$accent};">
              <span style="color:{$accent};font-size:20px;letter-spacing:3px;font-weight:700;">{$company}</span>
            </td></tr>
            <tr><td style="padding:32px;color:#1a1a1a;font-size:15px;line-height:1.65;">
              <h1 style="margin:0 0 20px;font-size:22px;color:{$ink};">{$title}</h1>
              {$bodyHtml}
            </td></tr>
            <tr><td style="padding:20px 32px;background:#EDE7DA;color:#6b6b6b;font-size:12px;line-height:1.6;">
              {$company} · {$phone} · {$email}
            </td></tr>
          </table>
        </td></tr></table></body></html>
        HTML;
    }

    private static function button(string $href, string $label): string
    {
        $accent = self::ACCENT;
        $ink = self::INK;
        return '<p style="margin:28px 0;"><a href="' . self::esc($href) . '" style="background:' . $accent
            . ';color:' . $ink . ';text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;display:inline-block;">'
            . self::esc($label) . '</a></p>';
    }

    /**
     * Alarm an ein Mitglied der zuständigen Fachgruppe.
     * @param array<string,mixed> $facts
     */
    public static function teamAlert(array $facts, string $agentName, string $leadUrl): array
    {
        $rows = [
            'Referenz'      => $facts['ref'],
            'Name'          => $facts['name'],
            'E-Mail'        => $facts['email'],
            'Telefon'       => $facts['phone'] !== '' ? $facts['phone'] : '–',
            'Fachgebiet'    => $facts['assetClass'],
            'Volumen'       => $facts['volume'] !== '' ? $facts['volume'] : '–',
            'Horizont'      => $facts['horizon'] !== '' ? $facts['horizon'] : '–',
            'Kontaktwunsch' => $facts['contactPref'] . ($facts['contactWindow'] !== '' ? ' (' . $facts['contactWindow'] . ')' : ''),
        ];

        $table = '';
        foreach ($rows as $key => $value) {
            $table .= '<tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;white-space:nowrap;">' . self::esc((string) $key)
                . '</td><td style="padding:6px 0;font-weight:600;">' . self::esc((string) $value) . '</td></tr>';
        }

        $note = $facts['message'] !== ''
            ? '<p style="background:#fff;border-left:3px solid ' . self::ACCENT . ';padding:12px 16px;margin:16px 0;"><em>'
                . self::esc((string) $facts['message']) . '</em></p>'
            : '';

        $html = self::layout(
            'Neuer Lead: ' . self::esc((string) $facts['name']),
            '<p>Hallo ' . self::esc($agentName) . ',</p>'
            . '<p>soeben ist eine neue Anfrage im Fachgebiet <strong>' . self::esc((string) $facts['assetClass'])
            . '</strong> eingegangen. Bitte nimm innerhalb von <strong>' . (int) $facts['slaMinutes']
            . ' Minuten</strong> Kontakt auf – die Reaktionszeit wird gemessen.</p>'
            . '<table style="font-size:14px;margin:20px 0;">' . $table . '</table>'
            . $note
            . self::button($leadUrl, 'Lead jetzt öffnen')
        );

        $lines = ['Neuer Lead: ' . $facts['name'] . ' (' . $facts['ref'] . ')'];
        foreach ($rows as $key => $value) {
            $lines[] = $key . ': ' . $value;
        }
        if ($facts['message'] !== '') {
            $lines[] = 'Nachricht: ' . $facts['message'];
        }
        $lines[] = 'Reaktionsziel: ' . $facts['slaMinutes'] . ' Minuten';
        $lines[] = $leadUrl;

        return [
            'subject'  => 'Neuer Lead · ' . $facts['assetClass'] . ' · ' . $facts['name'],
            'html'     => $html,
            'text'     => implode("\n", $lines),
            'template' => 'team_alert',
        ];
    }

    /**
     * Eingangsbestätigung an den Interessenten inklusive Portalzugang.
     * @param array<string,mixed> $facts
     * @param array{name:string,title:string,phone:string,email:string}|null $contact
     */
    public static function leadWelcome(array $facts, string $portalUrl, string $password, ?array $contact): array
    {
        $contactHtml = $contact === null ? '' :
            '<p style="background:#fff;border-radius:12px;padding:16px 20px;margin:20px 0;">'
            . '<strong style="display:block;font-size:16px;">' . self::esc($contact['name']) . '</strong>'
            . '<span style="color:#6b6b6b;">' . self::esc($contact['title']) . '</span><br/>'
            . self::esc($contact['phone']) . ' · ' . self::esc($contact['email']) . '</p>';

        $html = self::layout(
            'Ihre Anfrage ist angekommen, ' . self::esc((string) $facts['firstName']),
            '<p>vielen Dank für Ihr Interesse an <strong>' . self::esc((string) $facts['assetClass']) . '</strong>. '
            . 'Ihre Anfrage liegt bereits bei unserem Fachteam – wir melden uns <strong>'
            . self::esc((string) ($facts['slaPromise'] ?? 'innerhalb von ' . (int) $facts['slaMinutes'] . ' Minuten'))
            . '</strong> persönlich bei Ihnen.</p>'
            . $contactHtml
            . '<p>In Ihrem persönlichen Kundenbereich sehen Sie jederzeit den Stand Ihrer Anfrage, '
            . 'die nächsten Schritte und – sobald erstellt – Ihr individuelles Angebot.</p>'
            . '<table style="font-size:14px;background:#fff;border-radius:12px;padding:16px;margin:8px 0;">'
            . '<tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;">Zugang</td><td style="padding:6px 0;font-weight:600;">'
            . self::esc((string) $facts['email']) . '</td></tr>'
            . '<tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;">Passwort</td>'
            . '<td style="padding:6px 0;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:1px;">'
            . self::esc($password) . '</td></tr>'
            . '<tr><td style="padding:6px 12px 6px 0;color:#6b6b6b;">Referenz</td><td style="padding:6px 0;font-weight:600;">'
            . self::esc((string) $facts['ref']) . '</td></tr></table>'
            . self::button($portalUrl, 'Zum persönlichen Bereich')
            . '<p style="font-size:13px;color:#6b6b6b;">Bitte ändern Sie das Passwort nach dem ersten Login.</p>'
        );

        $text = "Vielen Dank für Ihre Anfrage ({$facts['ref']}).\n"
            . 'Wir melden uns ' . ($facts['slaPromise'] ?? "innerhalb von {$facts['slaMinutes']} Minuten") . ".\n"
            . ($contact !== null ? "Ihr Ansprechpartner: {$contact['name']}, {$contact['title']}, {$contact['phone']}\n" : '')
            . "Kundenbereich: {$portalUrl}\n"
            . "Zugang: {$facts['email']}\n"
            . "Passwort: {$password}";

        return [
            'subject'  => 'Ihre Anfrage ' . $facts['ref'] . ' ist angekommen – wir melden uns umgehend',
            'html'     => $html,
            'text'     => $text,
            'template' => 'lead_welcome',
        ];
    }

    public static function offerReady(string $firstName, string $ref, string $offerTitle, string $summary, string $portalUrl): array
    {
        $html = self::layout(
            'Ihr Angebot liegt bereit',
            '<p>Guten Tag ' . self::esc($firstName) . ',</p>'
            . '<p>Ihr persönliches Angebot <strong>' . self::esc($offerTitle) . '</strong> steht in Ihrem Kundenbereich bereit.</p>'
            . ($summary !== '' ? '<p>' . self::esc($summary) . '</p>' : '')
            . self::button($portalUrl, 'Angebot ansehen')
        );

        return [
            'subject'  => 'Ihr persönliches Angebot liegt bereit (' . $ref . ')',
            'html'     => $html,
            'text'     => 'Ihr Angebot "' . $offerTitle . '" steht bereit: ' . $portalUrl,
            'template' => 'offer_ready',
        ];
    }
}
