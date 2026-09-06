<?php
/** Öffentliche Anfrage-Strecke. */
use App\Core\Config;

$title = Config::get('company.name') . ' · Anfrage stellen';
$bodyClass = 'page-wizard';
$extraCss = 'wizard.css';
require __DIR__ . '/partials/head.php';
?>
<div id="app"></div>
<script type="module" src="/assets/js/wizard.js?v=1.0.0"></script>
</body>
</html>
