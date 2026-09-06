#!/usr/bin/env php
<?php
/**
 * Verschickt eine Testmail über die konfigurierten SMTP-Zugangsdaten.
 *
 *   php bin/test-mail.php empfaenger@example.de
 */
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\Mailer;

$to = $argv[1] ?? '';
if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Aufruf: php bin/test-mail.php empfaenger@example.de\n");
    exit(1);
}

if (!Mailer::isConfigured()) {
    fwrite(STDERR, "Kein SMTP in app/config.local.php hinterlegt – es wird nur protokolliert.\n");
}

$ok = Mailer::send($to, [
    'subject'  => 'Testmail der Lead Suite',
    'html'     => '<p>Wenn Sie das lesen, funktioniert der Mailversand – inklusive Umlauten: äöüß.</p>',
    'text'     => "Wenn Sie das lesen, funktioniert der Mailversand – inklusive Umlauten: äöüß.",
    'template' => 'test',
]);

echo $ok
    ? "Versand ausgelöst. Prüfe das Postfach von $to und den Postausgang im CRM.\n"
    : "Versand fehlgeschlagen. Der Grund steht im Postausgang des CRM und in storage/logs/php-error.log.\n";
