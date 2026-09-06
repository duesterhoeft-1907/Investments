<?php
/** Kundenbereich – helle Fläche, bewusst abgesetzt vom dunklen CRM. */
use App\Core\Config;

$title = Config::get('company.name') . ' · Ihr Kundenbereich';
$bodyClass = 'page-portal';
$extraCss = 'portal.css';
require __DIR__ . '/partials/head.php';
?>
<div id="app"></div>
<script type="module" src="/assets/js/portal.js?v=1.0.0"></script>
</body>
</html>
