<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Kleiner Router. Muster wie '/api/leads/{id}' – Platzhalter landen als
 * Argumente beim Rückruf. Mehr braucht diese Anwendung nicht.
 */
final class Router
{
    /** @var array<string, list<array{regex:string, keys:list<string>, handler:callable}>> */
    private array $routes = [];
    /** @var list<callable> */
    private array $before = [];

    public function get(string $pattern, callable $handler): void    { $this->add('GET', $pattern, $handler); }
    public function post(string $pattern, callable $handler): void   { $this->add('POST', $pattern, $handler); }
    public function patch(string $pattern, callable $handler): void  { $this->add('PATCH', $pattern, $handler); }
    public function delete(string $pattern, callable $handler): void { $this->add('DELETE', $pattern, $handler); }

    /** Läuft vor jedem Treffer – hier hängt die CSRF-Prüfung. */
    public function before(callable $middleware): void
    {
        $this->before[] = $middleware;
    }

    private function add(string $method, string $pattern, callable $handler): void
    {
        $keys = [];
        $regex = preg_replace_callback(
            '/\{([a-zA-Z_]+)\}/',
            static function (array $m) use (&$keys): string {
                $keys[] = $m[1];
                return '([^/]+)';
            },
            $pattern
        );
        $this->routes[$method][] = [
            'regex'   => '#^' . $regex . '$#',
            'keys'    => $keys,
            'handler' => $handler,
        ];
    }

    /** @return bool true, wenn eine Route gegriffen hat */
    public function dispatch(string $method, string $path): bool
    {
        foreach ($this->routes[$method] ?? [] as $route) {
            if (preg_match($route['regex'], $path, $matches) !== 1) {
                continue;
            }
            array_shift($matches);
            foreach ($this->before as $middleware) {
                $middleware();
            }
            ($route['handler'])(...$matches);
            return true;
        }
        return false;
    }
}
