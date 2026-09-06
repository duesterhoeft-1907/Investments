<?php
/** Gemeinsamer Kopf aller drei Bereiche. */
use App\Core\Auth;
use App\Core\Config;

/** @var string $title */
/** @var string $bodyClass */
$version = '1.0.0';
?>
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="description" content="<?= htmlspecialchars($description ?? 'Anfrage stellen, Fachberatung erhalten – Investments in Edelmetalle, Sachwerte und Beteiligungen.', ENT_QUOTES) ?>">
<title><?= htmlspecialchars($title, ENT_QUOTES) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/app.css?v=<?= $version ?>">
<?php if (!empty($extraCss)): ?>
<link rel="stylesheet" href="/assets/css/<?= htmlspecialchars($extraCss, ENT_QUOTES) ?>?v=<?= $version ?>">
<?php endif; ?>
<script>
  // Der Token steht hier und nicht im Cookie – so kann ihn eine fremde
  // Seite nicht mitschicken.
  window.__CSRF__ = <?= json_encode(Auth::csrfToken()) ?>;
  window.__COMPANY__ = <?= json_encode(Config::get('company'), JSON_UNESCAPED_UNICODE) ?>;
</script>
</head>
<body class="<?= htmlspecialchars($bodyClass ?? '', ENT_QUOTES) ?>">
