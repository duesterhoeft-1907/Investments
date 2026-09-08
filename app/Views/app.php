<?php
/** Internes CRM. Die Anmeldung prüft das Frontend über /api/auth/me. */
use App\Core\Config;

$title = Config::get('company.name') . ' · Lead Suite';
$bodyClass = 'page-app';
$extraCss = 'app-crm.css';
require __DIR__ . '/partials/head.php';
?>
<div id="app"></div>
<script type="module" src="<?= $asset('/assets/js/app.js') ?>"></script>
</body>
</html>
