#!/usr/bin/env php
<?php
/**
 * Wächter über die Reaktionszeit. Auf SiteGround minütlich einhängen:
 *
 *   * * * * * /usr/local/bin/php /home/KONTO/www/DOMAIN/bin/cron-sla.php >/dev/null 2>&1
 *
 * (Site Tools → Devs → Cron Jobs. Den genauen PHP-Pfad zeigt dort die Auswahl.)
 * Ohne diesen Eintrag läuft die Prüfung ersatzweise beim Abrufen der
 * Ereignisse mit – dann aber nur, solange jemand angemeldet ist.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

$result = App\Domain\Sla::run();
App\Domain\Events::prune();

echo sprintf(
    "[%s] Vorwarnungen: %d, Überschreitungen: %d\n",
    gmdate('Y-m-d H:i:s'),
    $result['warned'],
    $result['breached']
);
