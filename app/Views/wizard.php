<?php
/** Öffentliche Anfrage-Strecke – deutsch unter /anfrage, englisch unter /en/contact. */
use App\Core\Config;
use App\Core\I18n;

$title = Config::get('company.name') . ' · ' . I18n::t('nav.contact');
$bodyClass = 'page-wizard';
$extraCss = 'wizard.css';
$telefon = (string) Config::get('company.phone');
$telHref = 'tel:' . preg_replace('/[^\d+]/', '', $telefon);
require __DIR__ . '/partials/head.php';
?>
<div id="app"></div>

<?php
/*
 * Wenn das Modul nicht lädt – eine Datei fehlt, ein Zwischenspeicher liefert
 * einen alten Stand, der Server schickt den falschen MIME-Typ –, dann bricht
 * es still ab: kein Fehler auf dem Bildschirm, nur der Hintergrund. Genau das
 * ist passiert. Deshalb steht hier ein Kasten, den ein Wächter nach fünf
 * Sekunden aufdeckt, samt Grund. Lieber eine ehrliche Meldung mit einer
 * Telefonnummer als eine leere Seite.
 */
?>
<div id="wizard-notfall" class="wizard-notfall" hidden>
  <p class="notfall-titel"><?= htmlspecialchars(I18n::t('wizard.notfall'), ENT_QUOTES) ?></p>
  <p><?= htmlspecialchars(I18n::t('wizard.notfallHilfe'), ENT_QUOTES) ?></p>
  <p class="notfall-tel"><a href="<?= htmlspecialchars($telHref, ENT_QUOTES) ?>"><?= htmlspecialchars($telefon, ENT_QUOTES) ?></a></p>
  <p class="notfall-grund" id="wizard-notfall-grund" hidden></p>
</div>

<noscript>
  <div class="wizard-notfall" style="display:block">
    <p class="notfall-titel"><?= htmlspecialchars(I18n::t('wizard.ohneJs'), ENT_QUOTES) ?></p>
    <p class="notfall-tel"><a href="<?= htmlspecialchars($telHref, ENT_QUOTES) ?>"><?= htmlspecialchars($telefon, ENT_QUOTES) ?></a></p>
  </div>
</noscript>

<script type="module" src="<?= $asset('/assets/js/wizard.js') ?>"></script>
<script>
  /* Bewusst kein Modul: dieser Wächter muss auch dann laufen, wenn genau
     daran etwas scheitert. */
  (function () {
    var gruende = [];

    // Fehler beim Laden einer Datei melden sich nur in der Auffangphase.
    window.addEventListener('error', function (e) {
      var ziel = e.target;
      if (ziel && ziel !== window && (ziel.src || ziel.href)) {
        gruende.push('Datei nicht geladen: ' + (ziel.src || ziel.href));
      } else if (e.message) {
        gruende.push(e.message);
      }
    }, true);

    setTimeout(function () {
      if (window.__WIZARD_LAEUFT__) return;
      var kasten = document.getElementById('wizard-notfall');
      if (!kasten) return;
      kasten.hidden = false;
      if (gruende.length) {
        var zeile = document.getElementById('wizard-notfall-grund');
        zeile.textContent = <?= json_encode(I18n::t('wizard.notfallGrund'), JSON_UNESCAPED_UNICODE) ?> + ' ' + gruende[0];
        zeile.hidden = false;
      }
    }, 5000);
  })();
</script>
</body>
</html>
