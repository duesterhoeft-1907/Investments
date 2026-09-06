<?php
declare(strict_types=1);

namespace App\Core;

/** Anfrage lesen und Antwort schreiben – bewusst klein gehalten. */
final class Http
{
    private static ?array $jsonBody = null;

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function path(): string
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        return '/' . trim($path, '/');
    }

    /** JSON-Rumpf der Anfrage, einmal gelesen und gemerkt. */
    public static function body(): array
    {
        if (self::$jsonBody !== null) {
            return self::$jsonBody;
        }
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') {
            // Bei Datei-Uploads kommen die Felder als multipart/form-data.
            return self::$jsonBody = $_POST;
        }
        $decoded = json_decode($raw, true);
        return self::$jsonBody = is_array($decoded) ? $decoded : [];
    }

    public static function query(string $key, ?string $default = null): ?string
    {
        $value = $_GET[$key] ?? null;
        return is_string($value) && $value !== '' ? $value : $default;
    }

    public static function queryInt(string $key, int $default = 0): int
    {
        $value = self::query($key);
        return $value === null ? $default : (int) $value;
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$key] ?? null;
        return is_string($value) ? $value : null;
    }

    /** IP des Aufrufers, hinter dem SiteGround-Proxy korrekt aufgelöst. */
    public static function clientIp(): string
    {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
            $value = $_SERVER[$key] ?? '';
            if (!is_string($value) || $value === '') {
                continue;
            }
            $candidate = trim(explode(',', $value)[0]);
            if (filter_var($candidate, FILTER_VALIDATE_IP) !== false) {
                return $candidate;
            }
        }
        return '0.0.0.0';
    }

    public static function json(mixed $data, int $status = 200): never
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store');
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error(string $message, int $status = 400, array $extra = []): never
    {
        self::json(['error' => $message] + $extra, $status);
    }

    public static function noContent(): never
    {
        http_response_code(204);
        exit;
    }
}
