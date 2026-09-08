<?php
/** Gemeinsamer Kopf aller drei Bereiche. */
use App\Core\Auth;
use App\Core\Config;

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
?>
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="description" content="<?= htmlspecialchars($description ?? 'Anfrage stellen, Fachberatung erhalten – Investments in Edelmetalle, Sachwerte und Beteiligungen.', ENT_QUOTES) ?>">
<title><?= htmlspecialchars($title, ENT_QUOTES) ?></title>
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
</script>
</head>
<body class="<?= htmlspecialchars($bodyClass ?? '', ENT_QUOTES) ?>">
