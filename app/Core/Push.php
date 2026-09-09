<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Web-Push ohne Fremdbibliothek.
 *
 * Der übliche Weg wäre eine Bibliothek mit verschlüsselter Nutzlast. Die
 * braucht ECDH, HKDF und AES-GCM – viel Kryptografie für einen Text, der
 * ohnehin schon in der Datenbank steht. Deshalb hier der andere, ausdrücklich
 * erlaubte Weg: eine Meldung **ohne Inhalt**. Der Service Worker im Browser
 * holt sich beim Eintreffen die letzte Benachrichtigung über die eigene
 * Schnittstelle und zeigt sie an.
 *
 * Was bleibt, ist VAPID: ein signiertes Kärtchen, mit dem sich der Server beim
 * Push-Dienst ausweist. Das ist ein JWT mit ES256 – und das kann openssl.
 *
 * Die Schlüssel entstehen beim ersten Mal von selbst und liegen in settings.
 */
final class Push
{
    private const SCHLUESSEL_OEFFENTLICH = 'vapid_public';
    private const SCHLUESSEL_PRIVAT = 'vapid_private';

    /** Ist Push überhaupt möglich? Ohne openssl-EC nicht. */
    public static function moeglich(): bool
    {
        return function_exists('openssl_pkey_new') && function_exists('openssl_sign');
    }

    /** Der öffentliche Schlüssel für den Browser (base64url, 65 Byte Punkt). */
    public static function oeffentlicherSchluessel(): string
    {
        return self::schluessel()['public'];
    }

    /**
     * Schickt eine leere Meldung an alle Geräte einer Person.
     *
     * @return int Zahl der Geräte, die sie angenommen haben
     */
    public static function anPerson(int $userId): int
    {
        if (!self::moeglich()) {
            return 0;
        }

        $geraete = Db::all(
            'SELECT id, endpoint FROM push_subscriptions WHERE user_id = :u',
            ['u' => $userId]
        );
        if ($geraete === []) {
            return 0;
        }

        $mehrfach = curl_multi_init();
        $offen = [];

        foreach ($geraete as $geraet) {
            $handle = self::anfrage((string) $geraet['endpoint']);
            if ($handle === null) {
                continue;
            }
            $offen[(int) $geraet['id']] = $handle;
            curl_multi_add_handle($mehrfach, $handle);
        }

        // Alle Geräte gleichzeitig – nacheinander würde die Anfrage, die den
        // Alarm auslöst, um je eine Netzwerkrunde länger dauern.
        do {
            $status = curl_multi_exec($mehrfach, $laufen);
            if ($laufen) {
                curl_multi_select($mehrfach, 1.0);
            }
        } while ($laufen && $status === CURLM_OK);

        $angekommen = 0;
        foreach ($offen as $id => $handle) {
            $code = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
            curl_multi_remove_handle($mehrfach, $handle);
            curl_close($handle);

            if ($code >= 200 && $code < 300) {
                $angekommen++;
                Db::run('UPDATE push_subscriptions SET last_ok_at = NOW(), fehler = 0 WHERE id = :id',
                    ['id' => $id]);
                continue;
            }

            // 404 und 410 heißen: diese Anmeldung gibt es nicht mehr. Sie
            // wegzuwerfen ist richtig – ein Gerät, das nie wieder antwortet,
            // kostet sonst bei jedem Alarm eine Netzwerkrunde.
            if ($code === 404 || $code === 410) {
                Db::run('DELETE FROM push_subscriptions WHERE id = :id', ['id' => $id]);
            } else {
                Db::run('UPDATE push_subscriptions SET fehler = fehler + 1 WHERE id = :id', ['id' => $id]);
                Db::run('DELETE FROM push_subscriptions WHERE id = :id AND fehler >= 10', ['id' => $id]);
            }
        }

        curl_multi_close($mehrfach);
        return $angekommen;
    }

    /** @return \CurlHandle|null */
    private static function anfrage(string $endpoint)
    {
        $teile = parse_url($endpoint);
        if (!is_array($teile) || !isset($teile['scheme'], $teile['host'])) {
            return null;
        }
        $herkunft = $teile['scheme'] . '://' . $teile['host'];

        $handle = curl_init($endpoint);
        curl_setopt_array($handle, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => '',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_HTTPHEADER     => [
                'TTL: 120',
                'Content-Length: 0',
                'Urgency: high',
                'Authorization: vapid t=' . self::jwt($herkunft) . ', k=' . self::oeffentlicherSchluessel(),
            ],
        ]);
        return $handle;
    }

    /** Das Ausweiskärtchen für einen Push-Dienst, zwölf Stunden gültig. */
    private static function jwt(string $herkunft): string
    {
        $schluessel = self::schluessel();
        $kopf = self::b64(json_encode(['typ' => 'JWT', 'alg' => 'ES256'], JSON_THROW_ON_ERROR));
        $inhalt = self::b64(json_encode([
            'aud' => $herkunft,
            'exp' => time() + 12 * 3600,
            'sub' => 'mailto:' . Config::get('company.email', 'noreply@example.com'),
        ], JSON_THROW_ON_ERROR));

        $roh = '';
        openssl_sign($kopf . '.' . $inhalt, $roh, $schluessel['pem'], OPENSSL_ALGO_SHA256);

        return $kopf . '.' . $inhalt . '.' . self::b64(self::derZuRoh($roh));
    }

    /**
     * openssl unterschreibt im DER-Format, JWT will die beiden Zahlen roh
     * hintereinander, je 32 Byte. Ohne diese Umformung lehnt jeder Push-Dienst
     * die Unterschrift ab – und zwar mit einer Meldung, die alles Mögliche
     * vermuten lässt, nur nicht das.
     */
    private static function derZuRoh(string $der): string
    {
        $zeiger = 0;
        $lesen = static function (string $daten, int &$zeiger): string {
            $zeiger++;                                   // 0x02, Kennung für "Zahl"
            $laenge = ord($daten[$zeiger++]);
            $zahl = substr($daten, $zeiger, $laenge);
            $zeiger += $laenge;
            return ltrim($zahl, "\x00");                 // führende Null wegwerfen
        };

        $zeiger += 2;                                    // 0x30, Gesamtlänge
        $r = $lesen($der, $zeiger);
        $s = $lesen($der, $zeiger);

        return str_pad($r, 32, "\x00", STR_PAD_LEFT) . str_pad($s, 32, "\x00", STR_PAD_LEFT);
    }

    /** @return array{public:string,pem:string} */
    private static function schluessel(): array
    {
        static $zwischenspeicher = null;
        if ($zwischenspeicher !== null) {
            return $zwischenspeicher;
        }

        $pem = (string) (Db::value(
            'SELECT setting_value FROM settings WHERE setting_key = :k',
            ['k' => self::SCHLUESSEL_PRIVAT]
        ) ?? '');
        $oeffentlich = (string) (Db::value(
            'SELECT setting_value FROM settings WHERE setting_key = :k',
            ['k' => self::SCHLUESSEL_OEFFENTLICH]
        ) ?? '');

        if ($pem === '' || $oeffentlich === '') {
            [$pem, $oeffentlich] = self::neueSchluessel();
            self::merken(self::SCHLUESSEL_PRIVAT, $pem);
            self::merken(self::SCHLUESSEL_OEFFENTLICH, $oeffentlich);
        }

        return $zwischenspeicher = ['pem' => $pem, 'public' => $oeffentlich];
    }

    /** @return array{0:string,1:string} */
    private static function neueSchluessel(): array
    {
        $paar = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name'       => 'prime256v1',
        ]);
        if ($paar === false) {
            throw new \RuntimeException('Push-Schlüssel konnten nicht erzeugt werden.');
        }

        openssl_pkey_export($paar, $pem);
        $details = openssl_pkey_get_details($paar);

        // Der öffentliche Schlüssel ist der unkomprimierte Punkt: 0x04, dann
        // x und y mit je 32 Byte.
        $punkt = "\x04"
            . str_pad($details['ec']['x'], 32, "\x00", STR_PAD_LEFT)
            . str_pad($details['ec']['y'], 32, "\x00", STR_PAD_LEFT);

        return [(string) $pem, self::b64($punkt)];
    }

    private static function merken(string $key, string $wert): void
    {
        Db::run(
            'INSERT INTO settings (setting_key, setting_value) VALUES (:k, :v)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            ['k' => $key, 'v' => $wert]
        );
    }

    private static function b64(string $roh): string
    {
        return rtrim(strtr(base64_encode($roh), '+/', '-_'), '=');
    }
}
