<?php
/** Gemeinsamer Kopf aller drei Bereiche. */
use App\Core\Auth;
use App\Core\Config;
use App\Core\I18n;

/** @var string $title */
/** @var string $bodyClass */
/**
 * Die Version haengt an der Aenderungszeit der Datei, nicht an einer Zahl,
 * die jemand pflegen muesste. Eine feste Nummer heisst: nach jedem
 * Ausrollen sieht der Browser weiter die alte Datei – und der Fehler sieht
 * aus, als waere gar nichts angekommen.
 */
$asset = static function (string $path): string {
    $file = dirname(__DIR__, 3) . '/public_html' . $path;
    $stamp = is_file($file) ? filemtime($file) : time();
    return $path . '?v=' . $stamp;
};
$version = '1.0.0';   // nur noch fuer Aeusserlichkeiten

/**
 * Die Sprachfassungen dieser Seite.
 *
 * Ohne hreflang haelt eine Suchmaschine die deutsche und die englische
 * Fassung fuer zwei Seiten, die sich gegenseitig Konkurrenz machen; mit
 * hreflang sind es zwei Fassungen derselben Seite, und jede Fassung wird
 * dem passenden Publikum gezeigt. Die internen Bereiche haben keine
 * zweite Fassung – dort bleibt es leer.
 */
$seite = $route ?? null;
$sprachen = $seite !== null ? I18n::alternates($seite) : [];
$basisUrl = rtrim((string) Config::get('base_url', ''), '/');
?>
<!doctype html>
<html lang="<?= I18n::lang() ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<?php /* Die Wahl hell/dunkel muss stehen, bevor das erste Bild gezeichnet
         wird – sonst blitzt eine Fassung auf und wird sofort ersetzt. Ein
         Skript hier oben ist der einzige Weg dahin; alles Spätere kommt zu
         spät. Wer nichts gewählt hat, bekommt gar kein Attribut, und dann
         entscheidet die @media-Regel in app.css nach der Einstellung des
         Geräts. */ ?>
<script>
  try {
    var w = localStorage.getItem('21ci-theme');
    if (w === 'light' || w === 'dark') document.documentElement.dataset.theme = w;
  } catch (e) { /* privater Modus: dann eben die Vorgabe des Geräts */ }
</script>
<meta name="description" content="<?= htmlspecialchars($description ?? 'Anfrage stellen, Fachberatung erhalten – Investments in Edelmetalle, Sachwerte und Beteiligungen.', ENT_QUOTES) ?>">
<title><?= htmlspecialchars($title, ENT_QUOTES) ?></title>
<?php foreach ($sprachen as $sprache => $adresse): ?>
<link rel="alternate" hreflang="<?= htmlspecialchars($sprache, ENT_QUOTES) ?>" href="<?= htmlspecialchars($basisUrl . $adresse, ENT_QUOTES) ?>">
<?php endforeach; ?>
<?php if ($sprachen !== []): ?>
<link rel="alternate" hreflang="x-default" href="<?= htmlspecialchars($basisUrl . ($sprachen['de'] ?? '/'), ENT_QUOTES) ?>">
<link rel="canonical" href="<?= htmlspecialchars($basisUrl . I18n::url($seite), ENT_QUOTES) ?>">
<?php endif; ?>
<?php /* Die Schriften liegen unter assets/fonts/ und werden selbst
         ausgeliefert – kein Aufruf zu Google, damit auch kein Abfluss der
         Besucher-IP dorthin. Vorgeladen wird nur, was sofort sichtbar ist. */ ?>
<link rel="preload" href="/assets/fonts/archivo-600-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/inter-tight-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="<?= $asset('/assets/css/app.css') ?>">
<?php if (!empty($extraCss)): ?>
<link rel="stylesheet" href="<?= htmlspecialchars($asset('/assets/css/' . $extraCss), ENT_QUOTES) ?>">
<?php endif; ?>
<script>
  // Der Token steht hier und nicht im Cookie – so kann ihn eine fremde
  // Seite nicht mitschicken.
  window.__CSRF__ = <?= json_encode(Auth::csrfToken()) ?>;
  window.__COMPANY__ = <?= json_encode(Config::get('company'), JSON_UNESCAPED_UNICODE) ?>;
  // Damit das JavaScript in derselben Sprache spricht wie die Seite.
  window.__LANG__ = <?= json_encode(I18n::lang()) ?>;
</script>
<?php if (($bodyClass ?? '') === 'page-app'): ?>
<?php /* Nur das CRM ist eine App zum Installieren. Auf der oeffentlichen
         Seite waere ein Manifest sinnlos: dort gibt es nichts, was man auf
         den Startbildschirm legen wollte. */ ?>
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0B1816">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Lead Suite">
<link rel="apple-touch-icon" href="/assets/icons/icon-192.png">
<?php endif; ?>
</head>
<body class="<?= htmlspecialchars($bodyClass ?? '', ENT_QUOTES) ?>">
