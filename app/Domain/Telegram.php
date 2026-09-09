<?php
declare(strict_types=1);

namespace App\Domain;

use App\Core\Config;
use App\Core\Db;

/**
 * Telegram als zusätzlicher Weg für Meldungen an Mitarbeitende.
 *
 * Warum ausgerechnet Telegram: es kostet je Nachricht nichts, braucht kein
 * verifiziertes Unternehmensprofil und keine von einem Konzern genehmigten
 * Textvorlagen. Ein Bot beim BotFather, fertig.
 *
 * Der Preis dafür ist eine Bedingung: der Bot darf niemanden von sich aus
 * anschreiben. Jede und jeder muss ihn einmal selbst starten – erst dann gibt
 * es eine Chat-Kennung, und die steht im eigenen Profil. Ohne Kennung geht
 * nichts hinaus, und das ist gut so.
 *
 * Ohne Bot-Token in der Konfiguration ist alles hier still: keine Fehler,
 * keine Meldungen, kein halber Zustand.
 */
final class Telegram
{
    public static function eingerichtet(): bool
    {
        return self::token() !== '';
    }

    private static function token(): string
    {
        return trim((string) Config::get('telegram.bot_token', ''));
    }

    /** Der Name des Bots, damit die Oberfläche sagen kann, wen man anschreibt. */
    public static function botName(): string
    {
        return trim((string) Config::get('telegram.bot_name', ''));
    }

    /**
     * Schickt eine Meldung an eine Person, wenn sie eine Kennung hinterlegt hat.
     *
     * @return bool ob sie angenommen wurde
     */
    public static function anPerson(int $userId, string $titel, string $text = '', string $link = ''): bool
    {
        $kennung = trim((string) (Db::value(
            'SELECT telegram_chat_id FROM users WHERE id = :u',
            ['u' => $userId]
        ) ?? ''));

        return $kennung === '' ? false : self::anKennung($kennung, $titel, $text, $link);
    }

    public static function anKennung(string $kennung, string $titel, string $text = '', string $link = ''): bool
    {
        if (!self::eingerichtet() || $kennung === '') {
            return false;
        }

        // HTML statt Markdown: in Namen und Betreffzeilen stecken Zeichen wie
        // _ und *, die Markdown zerlegen würde. htmlspecialchars ist die
        // ehrlichere Bremse.
        $nachricht = '<b>' . self::sicher($titel) . '</b>';
        if ($text !== '') {
            $nachricht .= "\n" . self::sicher($text);
        }
        if ($link !== '') {
            $nachricht .= "\n" . self::sicher(rtrim((string) Config::get('base_url', ''), '/') . $link);
        }

        $antwort = self::ruf('sendMessage', [
            'chat_id'                  => $kennung,
            'text'                     => mb_substr($nachricht, 0, 3900),
            'parse_mode'               => 'HTML',
            'disable_web_page_preview' => true,
        ]);

        return ($antwort['ok'] ?? false) === true;
    }

    /**
     * Holt die Chat-Kennung zu einem Menschen ab, der den Bot gerade gestartet
     * hat. getUpdates ist dafür der einfachste Weg: kein Webhook, keine
     * öffentliche Adresse, kein Zertifikat.
     *
     * @return array<int,array{id:string,name:string}>
     */
    public static function neueChats(): array
    {
        if (!self::eingerichtet()) {
            return [];
        }

        $antwort = self::ruf('getUpdates', ['limit' => 50, 'timeout' => 0]);
        $chats = [];
        foreach ($antwort['result'] ?? [] as $eintrag) {
            $chat = $eintrag['message']['chat'] ?? null;
            if (!is_array($chat) || !isset($chat['id'])) {
                continue;
            }
            $name = trim(($chat['first_name'] ?? '') . ' ' . ($chat['last_name'] ?? ''));
            $chats[(string) $chat['id']] = [
                'id'   => (string) $chat['id'],
                'name' => $name !== '' ? $name : (string) ($chat['username'] ?? $chat['id']),
            ];
        }

        return array_values($chats);
    }

    /** @return array<string,mixed> */
    private static function ruf(string $methode, array $daten): array
    {
        $handle = curl_init('https://api.telegram.org/bot' . self::token() . '/' . $methode);
        curl_setopt_array($handle, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($daten),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 6,
            CURLOPT_CONNECTTIMEOUT => 3,
        ]);
        $roh = curl_exec($handle);
        curl_close($handle);

        if (!is_string($roh)) {
            return ['ok' => false];
        }
        $daten = json_decode($roh, true);
        return is_array($daten) ? $daten : ['ok' => false];
    }

    private static function sicher(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
