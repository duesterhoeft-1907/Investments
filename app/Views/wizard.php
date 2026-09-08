<?php
/** Öffentliche Anfrage-Strecke. */
use App\Core\Config;

$title = Config::get('company.name') . ' · Anfrage stellen';
$bodyClass = 'page-wizard';
$extraCss = 'wizard.css';
require __DIR__ . '/partials/head.php';
?>
<div id="app"></div>
<script type="module" src="<?= $asset('/assets/js/wizard.js') ?>"></script>
</body>
</html>
