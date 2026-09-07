#!/usr/bin/env php
<?php
/**
 * Liest das Erscheinungsbild der Unternehmensseite aus.
 *
 *   php bin/fetch-brand.php
 *   php bin/fetch-brand.php https://21capitalinvest.com/en/home_en/
 *
 * Laedt die Seite und ihre Stylesheets, sammelt Farben, Schriften,
 * Bewegungen und das Logo und legt alles unter storage/brand/ ab.
 *
 * Warum als Skript und nicht von Hand: die Seite ist von der Entwicklungs-
 * umgebung aus nicht erreichbar, vom Server aus schon. Was hier
 * herauskommt, ist abgemessen statt geschaetzt – Marken-Farben nach
 * Augenmass zu treffen geht fast immer daneben.
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$url  = $argv[1] ?? 'https://21capitalinvest.com/en/home_en/';
$out  = $root . '/storage/brand';

@mkdir($out, 0775, true);

function fetch(string $url): ?string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; CapitalLeadSuite/1.0; +Markenabgleich)',
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    return ($body === false || $code >= 400) ? null : (string) $body;
}

/** Relative Adressen zu vollstaendigen machen. */
function absolute(string $link, string $base): string
{
    if (preg_match('#^https?://#i', $link) === 1) return $link;
    if (str_starts_with($link, '//')) return 'https:' . $link;

    $parts = parse_url($base);
    // Der Port gehoert dazu – ohne ihn zeigt jede abgeleitete Adresse auf
    // den falschen Dienst, und zwar lautlos: es kommt einfach nichts zurueck.
    $origin = $parts['scheme'] . '://' . $parts['host']
        . (isset($parts['port']) ? ':' . $parts['port'] : '');
    if (str_starts_with($link, '/')) return $origin . $link;

    $dir = rtrim(dirname($parts['path'] ?? '/'), '/');
    return $origin . $dir . '/' . $link;
}

echo "\n\033[1mErscheinungsbild auslesen\033[0m\n";
echo "  Quelle: $url\n\n";

$html = fetch($url);
if ($html === null) {
    fwrite(STDERR, "  Seite nicht erreichbar. Läuft dieses Skript auf dem Server?\n\n");
    exit(1);
}
file_put_contents("$out/seite.html", $html);
printf("  ✓ Seite geladen (%d kB)\n", (int) round(strlen($html) / 1024));

// ── Stylesheets einsammeln ──
$css = '';
preg_match_all('#<link[^>]+rel=["\']?stylesheet["\']?[^>]*>#i', $html, $links);
$sheets = [];
foreach ($links[0] as $tag) {
    if (preg_match('#href=["\']([^"\']+)["\']#i', $tag, $m) === 1) {
        $sheets[] = absolute($m[1], $url);
    }
}
foreach (array_unique($sheets) as $i => $sheet) {
    $body = fetch($sheet);
    if ($body !== null) {
        $css .= "\n/* ---- $sheet ---- */\n" . $body;
    }
}
// Auch das, was direkt in der Seite steht.
preg_match_all('#<style[^>]*>(.*?)</style>#is', $html, $inline);
$css .= "\n" . implode("\n", $inline[1]);

file_put_contents("$out/stile.css", $css);
printf("  ✓ %d Stylesheets, zusammen %d kB\n", count($sheets), (int) round(strlen($css) / 1024));

// ── Farben nach Haeufigkeit ──
preg_match_all('/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/', $css, $colors);
$counted = array_count_values(array_map('strtolower', $colors[0]));
arsort($counted);

// ── Schriften ──
preg_match_all('/font-family\s*:\s*([^;}]+)/i', $css, $fonts);
$families = array_count_values(array_map(
    static fn (string $f): string => trim(preg_replace('/\s+/', ' ', $f)),
    $fonts[1]
));
arsort($families);

preg_match_all('#https://fonts\.googleapis\.com/[^"\'\s>]+#i', $html . $css, $webfonts);

// ── Bewegung ──
preg_match_all('/@keyframes\s+([\w-]+)/i', $css, $keyframes);
preg_match_all('/transition\s*:\s*([^;}]+)/i', $css, $transitions);

// ── Logo und Bilder aus dem Kopfbereich ──
$images = [];
preg_match_all('#<img[^>]+>#i', substr($html, 0, 60000), $imgTags);
foreach ($imgTags[0] as $tag) {
    if (preg_match('#src=["\']([^"\']+)["\']#i', $tag, $m) !== 1) continue;
    $src = absolute($m[1], $url);
    $isLogo = stripos($tag, 'logo') !== false || stripos($src, 'logo') !== false;
    $images[] = ['src' => $src, 'logo' => $isLogo, 'tag' => mb_substr(strip_tags($tag), 0, 120)];
}
foreach (['og:image', 'icon', 'apple-touch-icon', 'mask-icon'] as $rel) {
    if (preg_match('#<(?:meta|link)[^>]+(?:property|rel)=["\']' . preg_quote($rel, '#') . '["\'][^>]*>#i', $html, $m) === 1
        && preg_match('#(?:content|href)=["\']([^"\']+)["\']#i', $m[0], $h) === 1) {
        $images[] = ['src' => absolute($h[1], $url), 'logo' => true, 'tag' => $rel];
    }
}

@mkdir("$out/bilder", 0775, true);
$saved = [];
foreach ($images as $image) {
    if (!$image['logo']) continue;
    $body = fetch($image['src']);
    if ($body === null || strlen($body) > 3_000_000) continue;
    $name = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename(parse_url($image['src'], PHP_URL_PATH) ?: 'bild'));
    file_put_contents("$out/bilder/$name", $body);
    $saved[] = $name;
}
printf("  ✓ %d Logo-Dateien gesichert\n", count($saved));

// ── Bericht, kurz genug zum Verschicken ──
$report = [];
$report[] = 'QUELLE: ' . $url;
$report[] = 'GEHOLT: ' . gmdate('d.m.Y H:i') . ' UTC';
$report[] = '';
$report[] = 'TITEL:  ' . (preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m) ? trim(html_entity_decode($m[1])) : '—');
$report[] = 'NAME:   ' . (preg_match('#<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)#i', $html, $m) ? $m[1] : '—');
$report[] = '';
$report[] = '── FARBEN (häufigste zuerst) ──';
foreach (array_slice($counted, 0, 24, true) as $color => $count) {
    $report[] = sprintf('  %-24s %dx', $color, $count);
}
$report[] = '';
$report[] = '── SCHRIFTEN ──';
foreach (array_slice($families, 0, 10, true) as $family => $count) {
    $report[] = sprintf('  %dx  %s', $count, mb_substr($family, 0, 90));
}
$report[] = '';
$report[] = '── WEBFONTS ──';
foreach (array_unique($webfonts[0]) as $link) {
    $report[] = '  ' . $link;
}
$report[] = '';
$report[] = '── BEWEGUNG ──';
$report[] = '  @keyframes: ' . (count($keyframes[1]) ? implode(', ', array_unique($keyframes[1])) : 'keine');
$report[] = '  Übergänge (Auswahl):';
foreach (array_slice(array_unique(array_map('trim', $transitions[1])), 0, 12) as $t) {
    $report[] = '    ' . mb_substr($t, 0, 80);
}
$report[] = '';
$report[] = '── LOGO-DATEIEN ──';
foreach ($saved as $name) {
    $report[] = '  storage/brand/bilder/' . $name;
}

file_put_contents("$out/bericht.txt", implode("\n", $report) . "\n");

echo "\n" . implode("\n", array_slice($report, 0, 60)) . "\n";
echo "\n\033[1mAbgelegt unter storage/brand/\033[0m\n";
echo "  bericht.txt   die Zusammenfassung oben\n";
echo "  stile.css     alle Stylesheets am Stück\n";
echo "  seite.html    die Startseite\n";
echo "  bilder/       Logo und Symbole\n\n";
echo "  Damit ich es sehen kann, einmal ins Repository legen:\n";
echo "    cp -r storage/brand docs-brand && git add -f docs-brand && \\\n";
echo "      git commit -m 'Erscheinungsbild der Unternehmensseite' && git push\n\n";
