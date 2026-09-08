<?php
/** Öffentliche Anfrage-Strecke – deutsch unter /anfrage, englisch unter /en/contact. */
use App\Core\Config;
use App\Core\I18n;

$title = Config::get('company.name') . ' · ' . I18n::t('nav.contact');
$bodyClass = 'page-wizard';
$extraCss = 'wizard.css';
require __DIR__ . '/partials/head.php';
?>
<div id="app"></div>
<script type="module" src="<?= $asset('/assets/js/wizard.js') ?>"></script>
</body>
</html>
