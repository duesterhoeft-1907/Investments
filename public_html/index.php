<?php
/**
 * Front-Controller. Jede Anfrage läuft hier durch (siehe .htaccess).
 *
 * Drei Bereiche:
 *   /            öffentlicher Lead-Wizard
 *   /app/…       internes CRM (Anmeldung nötig)
 *   /portal/…    Kundenbereich
 *   /api/…       JSON-Schnittstelle für alle drei
 */
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Auth;
use App\Core\Config;
use App\Core\Db;
use App\Core\Http;
use App\Core\Router;
use App\Controllers as C;

$path = Http::path();
$method = Http::method();

// ───────────────────────── Seiten ─────────────────────────

if (!str_starts_with($path, '/api')) {
    $view = match (true) {
        $path === '/' || $path === ''      => 'wizard',
        str_starts_with($path, '/app')     => 'app',
        str_starts_with($path, '/portal')  => 'portal',
        default                            => null,
    };

    if ($view === null) {
        http_response_code(404);
        $view = 'wizard';
    }

    Auth::startSession();
    require APP_DIR . '/Views/' . $view . '.php';
    exit;
}

// ───────────────────────── Schnittstelle ─────────────────────────

try {
    $router = new Router();

    // Verändernde Aufrufe brauchen den Token aus der Sitzung. Ausgenommen
    // sind die beiden öffentlichen Einstiege, die noch keine Sitzung haben.
    $router->before(static function () use ($path, $method): void {
        $publicPost = in_array($path, ['/api/public/leads', '/api/auth/login', '/api/portal/login'], true);
        if (!$publicPost) {
            Auth::requireCsrf();
        }
        unset($method);
    });

    // ── Öffentlich ──
    $router->get('/api/public/wizard-config', [C\PublicController::class, 'wizardConfig']);
    $router->post('/api/public/leads', [C\PublicController::class, 'submit']);

    // ── Anmeldung ──
    $router->post('/api/auth/login', [C\AuthController::class, 'login']);
    $router->post('/api/auth/logout', [C\AuthController::class, 'logout']);
    $router->get('/api/auth/me', [C\AuthController::class, 'me']);
    $router->post('/api/auth/password', [C\AuthController::class, 'changePassword']);

    // ── Ereignisse (ersetzt WebSockets) ──
    $router->get('/api/events', [C\EventsController::class, 'poll']);

    // ── Leads ──
    $router->get('/api/leads', [C\LeadsController::class, 'index']);
    $router->get('/api/leads/{id}', [C\LeadsController::class, 'show']);
    $router->patch('/api/leads/{id}', [C\LeadsController::class, 'update']);
    $router->post('/api/leads/{id}/contact', [C\LeadsController::class, 'contact']);
    $router->post('/api/leads/{id}/claim', [C\LeadsController::class, 'claim']);
    $router->delete('/api/leads/{id}', [C\LeadsController::class, 'destroy']);

    // ── Verlauf und Anhänge ──
    $router->post('/api/activities', [C\ActivitiesController::class, 'store']);
    $router->patch('/api/activities/{id}/pin', [C\ActivitiesController::class, 'togglePin']);
    $router->get('/api/activities/stream', [C\ActivitiesController::class, 'stream']);
    $router->post('/api/uploads', [C\UploadsController::class, 'store']);
    $router->get('/api/uploads/{name}', [C\UploadsController::class, 'serve']);
    $router->patch('/api/uploads/{id}/transcript', [C\UploadsController::class, 'transcript']);

    // ── Aufgaben ──
    $router->get('/api/tasks', [C\TasksController::class, 'index']);
    $router->post('/api/tasks', [C\TasksController::class, 'store']);
    $router->patch('/api/tasks/{id}', [C\TasksController::class, 'update']);
    $router->delete('/api/tasks/{id}', [C\TasksController::class, 'destroy']);

    // ── Angebote ──
    $router->get('/api/offers/ai-status', [C\OffersController::class, 'aiStatus']);
    $router->post('/api/offers/draft', [C\OffersController::class, 'draft']);
    $router->patch('/api/offers/{id}', [C\OffersController::class, 'update']);
    $router->post('/api/offers/{id}/send', [C\OffersController::class, 'send']);
    $router->delete('/api/offers/{id}', [C\OffersController::class, 'destroy']);

    // ── Chat ──
    $router->get('/api/chat/channels', [C\ChatController::class, 'channels']);
    $router->get('/api/chat/channels/{id}/messages', [C\ChatController::class, 'messages']);
    $router->post('/api/chat/channels/{id}/messages', [C\ChatController::class, 'send']);
    $router->post('/api/chat/channels/{id}/read', [C\ChatController::class, 'markRead']);
    $router->post('/api/chat/dm/{userId}', [C\ChatController::class, 'openDirect']);

    // ── Benachrichtigungen ──
    $router->get('/api/notifications', [C\NotificationsController::class, 'index']);
    $router->post('/api/notifications/{id}/read', [C\NotificationsController::class, 'markRead']);
    $router->post('/api/notifications/read-all', [C\NotificationsController::class, 'markAllRead']);
    $router->get('/api/notifications/outbox', [C\NotificationsController::class, 'outbox']);

    // ── Kennzahlen ──
    $router->get('/api/stats/dashboard', [C\StatsController::class, 'dashboard']);
    $router->get('/api/stats/my-day', [C\StatsController::class, 'myDay']);

    // ── Verzeichnis und Routing ──
    $router->get('/api/directory/users', [C\DirectoryController::class, 'users']);
    $router->get('/api/directory/teams', [C\DirectoryController::class, 'teams']);
    $router->get('/api/directory/asset-classes', [C\DirectoryController::class, 'assetClasses']);
    $router->patch('/api/directory/asset-classes/{id}', [C\DirectoryController::class, 'routeAssetClass']);
    $router->patch('/api/directory/teams/{id}', [C\DirectoryController::class, 'updateTeam']);

    // ── Verwaltung: Ruhezeiten und Mitarbeiter ──
    $router->get('/api/admin/hours', [C\AdminController::class, 'hours']);
    $router->patch('/api/admin/hours', [C\AdminController::class, 'saveHours']);
    $router->get('/api/admin/staff', [C\AdminController::class, 'staff']);
    $router->post('/api/admin/staff', [C\AdminController::class, 'createStaff']);
    $router->patch('/api/admin/staff/{id}', [C\AdminController::class, 'updateStaff']);
    $router->patch('/api/staff/{id}/away', [C\AdminController::class, 'setAway']);

    // ── Kundenportal ──
    $router->get('/api/portal/preview/{token}', [C\PortalController::class, 'preview']);
    $router->post('/api/portal/login', [C\PortalController::class, 'login']);
    $router->post('/api/portal/logout', [C\PortalController::class, 'logout']);
    $router->get('/api/portal/me', [C\PortalController::class, 'me']);
    $router->post('/api/portal/messages', [C\PortalController::class, 'message']);
    $router->post('/api/portal/offers/respond', [C\PortalController::class, 'respondToOffer']);
    $router->post('/api/portal/password', [C\PortalController::class, 'changePassword']);

    // ── Betriebszustand ──
    $router->get('/api/health', static function (): void {
        Http::json([
            'ok'         => true,
            'service'    => 'capital-lead-suite',
            'php'        => PHP_VERSION,
            'database'   => Db::value('SELECT VERSION()'),
            'mail'       => App\Core\Mailer::mode(),
            'ai'         => App\Domain\OfferDraft::isEnabled(),
            'slaMinutes' => (int) Config::get('sla_minutes'),
            'time'       => gmdate('c'),
        ]);
    });

    if (!$router->dispatch($method, $path)) {
        Http::error('Endpunkt nicht gefunden.', 404);
    }
} catch (Throwable $e) {
    error_log('[api] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());

    if (Config::get('app_env') === 'development') {
        Http::json([
            'error' => $e->getMessage(),
            'type'  => $e::class,
            'where' => $e->getFile() . ':' . $e->getLine(),
            'trace' => array_slice(explode("\n", $e->getTraceAsString()), 0, 8),
        ], 500);
    }
    Http::error('Interner Serverfehler.', 500);
}
