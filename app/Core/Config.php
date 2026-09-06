<?php
declare(strict_types=1);

namespace App\Core;

/** Zugriff auf die Konfiguration über Punktpfade: Config::get('db.host'). */
final class Config
{
    private static array $values = [];

    public static function load(array $values): void
    {
        self::$values = $values;
    }

    public static function all(): array
    {
        return self::$values;
    }

    public static function get(string $path, mixed $default = null): mixed
    {
        $node = self::$values;
        foreach (explode('.', $path) as $segment) {
            if (!is_array($node) || !array_key_exists($segment, $node)) {
                return $default;
            }
            $node = $node[$segment];
        }
        return $node;
    }

    /**
     * Öffentliche Basisadresse. Ist nichts konfiguriert, wird sie aus der
     * laufenden Anfrage abgeleitet – so funktionieren Links auch ohne Eintrag.
     */
    public static function baseUrl(): string
    {
        $configured = (string) self::get('base_url', '');
        if ($configured !== '') {
            return rtrim($configured, '/');
        }
        if (PHP_SAPI === 'cli') {
            return '';
        }
        $https = (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return ($https ? 'https://' : 'http://') . $host;
    }
}
