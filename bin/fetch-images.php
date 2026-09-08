#!/usr/bin/env php
<?php
/**
 * Holt die Bilder der Unternehmensseite nach.
 *
 *   php bin/fetch-images.php
 *
 * Der Archiv-Abzug enthielt sie nicht – sie liegen weiterhin auf dem
 * Server der Seite. Von der Entwicklungsumgebung aus ist der nicht
 * erreichbar, von hier aus schon.
 *
 * Was fehlt, wird geladen; was schon da ist, bleibt liegen. Die Startseite
 * kommt auch ohne aus: fehlt ein Bild, zeigt der Abschnitt seinen Verlauf.
 */
declare(strict_types=1);

$root   = dirname(__DIR__);
$target = $root . '/public_html/assets/brand';
$quelle = 'https://21capitalinvest.com/wp-content/uploads/2026/08/';

@mkdir($target, 0775, true);

/** Datei im Auftritt => Name bei uns. */
$bilder = [
    'digital_euro.png'          => 'thema-euro.png',
    'inflation.png'             => 'thema-inflation.png',
    'taxes.png'                 => 'thema-steuern.png',
    'schutzschild.png'          => 'thema-schutz.png',
    'legale_schlupfloecher.png' => 'thema-wege.png',
    'rendite.png'               => 'thema-rendite.png',
];

echo "\n\033[1mBilder der Unternehmensseite holen\033[0m\n";
echo "  Quelle: $quelle\n\n";

$geholt = 0;
$fehlt  = [];

foreach ($bilder as $quelldatei => $ziel) {
    $pfad = "$target/$ziel";
    if (is_file($pfad) && filesize($pfad) > 1000) {
        echo "  \033[32m·\033[0m $ziel liegt schon vor\n";
        continue;
    }

    $ch = curl_init($quelle . $quelldatei);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; CapitalLeadSuite/1.0)',
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    // Kurze Antworten sind meist Fehlerseiten, keine Bilder.
    if ($body === false || $code >= 400 || strlen((string) $body) < 1000) {
        echo "  \033[31m✗\033[0m $quelldatei nicht geladen (HTTP $code)\n";
        $fehlt[] = $quelldatei;
        continue;
    }

    file_put_contents($pfad, $body);
    printf("  \033[32m✓\033[0m %-28s %d kB\n", $ziel, (int) round(strlen((string) $body) / 1024));
    $geholt++;
}

echo "\n  $geholt neu geholt";
echo $fehlt === [] ? ".\n" : ', ' . count($fehlt) . " nicht gefunden.\n";
if ($fehlt !== []) {
    echo "  Die Startseite läuft trotzdem – die betroffenen Abschnitte zeigen\n";
    echo "  dann ihren Farbverlauf statt eines Bildes.\n";
}
echo "\n";
