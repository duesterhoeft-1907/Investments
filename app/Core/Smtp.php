<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/**
 * Schlanker SMTP-Client.
 *
 * Bewusst ohne Composer-Abhängigkeit: auf Shared Hosting soll ein Hochladen
 * der Dateien genügen, ohne "composer install" über SSH. Der Client kann,
 * was hier gebraucht wird – STARTTLS, implizites TLS, AUTH LOGIN und PLAIN,
 * UTF-8-Betreff und ein Rumpf aus Text- und HTML-Teil.
 */
final class Smtp
{
    private const CRLF = "\r\n";

    /** @var resource|null */
    private $socket = null;
    private string $lastResponse = '';

    public function __construct(
        private readonly string $host,
        private readonly int $port,
        private readonly string $secure,   // '' | 'tls' | 'ssl'
        private readonly string $user,
        private readonly string $pass,
        private readonly int $timeout = 20,
    ) {
    }

    /**
     * @param list<string> $to
     * @throws RuntimeException bei jedem unerwarteten Serverstatus
     */
    public function send(string $fromAddress, string $fromName, array $to, string $subject, string $html, string $text): void
    {
        $this->connect();
        try {
            $this->handshake();
            $this->authenticate();

            $this->command('MAIL FROM:<' . $fromAddress . '>', [250]);
            foreach ($to as $recipient) {
                $this->command('RCPT TO:<' . $recipient . '>', [250, 251]);
            }
            $this->command('DATA', [354]);
            // Der Abschluss ist <CRLF>.<CRLF>: die Nachricht muss also mit
            // einem Zeilenumbruch enden, sonst klebt der Punkt an der letzten
            // Zeile und der Server bleibt im DATA-Modus haengen.
            $this->write($this->buildMessage($fromAddress, $fromName, $to, $subject, $html, $text) . self::CRLF);
            $this->command('.', [250]);
            $this->command('QUIT', [221, 250]);
        } finally {
            $this->close();
        }
    }

    private function connect(): void
    {
        $prefix = $this->secure === 'ssl' ? 'ssl://' : '';
        $context = stream_context_create([
            'ssl' => ['SNI_enabled' => true, 'peer_name' => $this->host],
        ]);

        $socket = @stream_socket_client(
            $prefix . $this->host . ':' . $this->port,
            $errno,
            $errstr,
            $this->timeout,
            STREAM_CLIENT_CONNECT,
            $context
        );

        if ($socket === false) {
            throw new RuntimeException(sprintf(
                'Verbindung zu %s:%d fehlgeschlagen (%d) %s',
                $this->host, $this->port, $errno, $errstr
            ));
        }

        $this->socket = $socket;
        stream_set_timeout($socket, $this->timeout);
        $this->expect([220]);
    }

    private function handshake(): void
    {
        $hostname = gethostname() ?: 'localhost';
        $this->command('EHLO ' . $hostname, [250]);

        if ($this->secure === 'tls') {
            $this->command('STARTTLS', [220]);
            $ok = @stream_socket_enable_crypto(
                $this->socket,
                true,
                STREAM_CRYPTO_METHOD_TLS_CLIENT
            );
            if ($ok !== true) {
                throw new RuntimeException('STARTTLS fehlgeschlagen – Server hat die Verschlüsselung abgelehnt.');
            }
            // Nach dem Wechsel verlangt das Protokoll ein erneutes EHLO.
            $this->command('EHLO ' . $hostname, [250]);
        }
    }

    private function authenticate(): void
    {
        if ($this->user === '') {
            return;
        }
        $capabilities = strtoupper($this->lastResponse);

        if (str_contains($capabilities, 'AUTH') && str_contains($capabilities, 'PLAIN')) {
            $credentials = base64_encode("\0" . $this->user . "\0" . $this->pass);
            $this->command('AUTH PLAIN ' . $credentials, [235]);
            return;
        }

        $this->command('AUTH LOGIN', [334]);
        $this->command(base64_encode($this->user), [334]);
        $this->command(base64_encode($this->pass), [235]);
    }

    /** @param list<string> $to */
    private function buildMessage(string $fromAddress, string $fromName, array $to, string $subject, string $html, string $text): string
    {
        $boundary = 'b' . bin2hex(random_bytes(12));
        $headers = [
            'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
            'From: ' . $this->encodeName($fromName) . ' <' . $fromAddress . '>',
            'To: ' . implode(', ', $to),
            'Subject: ' . $this->encodeHeader($subject),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . ($this->hostPart($fromAddress)) . '>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];

        $body = [
            '--' . $boundary,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            chunk_split(base64_encode($text), 76, self::CRLF),
            '--' . $boundary,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            chunk_split(base64_encode($html), 76, self::CRLF),
            '--' . $boundary . '--',
        ];

        // Base64 enthält keine Zeile, die mit einem Punkt beginnt – Dot-Stuffing
        // ist damit nicht nötig, wir setzen es aus Vorsicht trotzdem.
        $message = implode(self::CRLF, $headers) . self::CRLF . self::CRLF . implode(self::CRLF, $body);
        return preg_replace('/^\./m', '..', $message) ?? $message;
    }

    private function hostPart(string $address): string
    {
        $at = strrpos($address, '@');
        return $at === false ? 'localhost' : substr($address, $at + 1);
    }

    private function encodeHeader(string $value): string
    {
        if (preg_match('/^[\x20-\x7E]*$/', $value) === 1) {
            return $value;
        }
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    private function encodeName(string $name): string
    {
        $encoded = $this->encodeHeader($name);
        return $encoded === $name ? '"' . str_replace('"', '', $name) . '"' : $encoded;
    }

    /** @param list<int> $expected */
    private function command(string $line, array $expected): void
    {
        $this->write($line . self::CRLF);
        $this->expect($expected, $line);
    }

    private function write(string $data): void
    {
        if ($this->socket === null) {
            throw new RuntimeException('Keine SMTP-Verbindung.');
        }
        if (@fwrite($this->socket, $data) === false) {
            throw new RuntimeException('Schreiben auf die SMTP-Verbindung fehlgeschlagen.');
        }
    }

    /** @param list<int> $expected */
    private function expect(array $expected, string $context = 'Begrüßung'): void
    {
        $response = $this->readResponse();
        $this->lastResponse = $response;
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $expected, true)) {
            throw new RuntimeException(sprintf(
                'SMTP-Server antwortete auf "%s" mit: %s',
                $this->maskSecrets($context),
                trim($response)
            ));
        }
    }

    private function maskSecrets(string $line): string
    {
        // Nach AUTH stehen die Zugangsdaten in der Zeile – nie ins Log.
        return preg_match('/^(AUTH|[A-Za-z0-9+\/=]{16,}$)/', $line) === 1 ? 'AUTH …' : $line;
    }

    private function readResponse(): string
    {
        if ($this->socket === null) {
            throw new RuntimeException('Keine SMTP-Verbindung.');
        }
        $response = '';
        while (($line = fgets($this->socket, 1024)) !== false) {
            $response .= $line;
            // Mehrzeilige Antworten haben nach dem Code ein '-'; die letzte
            // Zeile ein Leerzeichen.
            if (strlen($line) < 4 || $line[3] !== '-') {
                break;
            }
        }
        if ($response === '') {
            $meta = stream_get_meta_data($this->socket);
            throw new RuntimeException($meta['timed_out'] ? 'SMTP-Zeitüberschreitung.' : 'SMTP-Verbindung abgebrochen.');
        }
        return $response;
    }

    private function close(): void
    {
        if ($this->socket !== null) {
            @fclose($this->socket);
            $this->socket = null;
        }
    }
}
