<?php
/**
 * Sprachumschalter.
 *
 * Er führt auf dieselbe Seite in der anderen Sprache, nicht auf die
 * Startseite: wer im Impressum steht und umschaltet, will das Impressum
 * lesen – und nicht wieder von vorn anfangen.
 */
use App\Core\I18n;

$aktuell = $route ?? 'home';
foreach (I18n::alternates($aktuell) as $sprache => $adresse):
    if ($sprache === I18n::lang()) {
        continue;
    }
    $texte = require dirname(__DIR__, 2) . '/Lang/' . $sprache . '.php';
    ?>
    <a class="s-lang" href="<?= htmlspecialchars($adresse, ENT_QUOTES) ?>"
       hreflang="<?= htmlspecialchars($sprache, ENT_QUOTES) ?>"
       lang="<?= htmlspecialchars($sprache, ENT_QUOTES) ?>"
       title="<?= htmlspecialchars((string) $texte['name'], ENT_QUOTES) ?>">
      <?= htmlspecialchars(strtoupper($sprache), ENT_QUOTES) ?>
    </a>
<?php endforeach; ?>
