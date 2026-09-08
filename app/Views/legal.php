<?php
/**
 * Impressum und Risikohinweise.
 *
 * Pflichtangaben nach § 5 DDG. Die Angaben stammen aus dem bisherigen
 * Auftritt; ändern sie sich, ändern sie sich in app/Lang/{de,en}.php.
 * Die Firmierung steht in beiden Sprachen gleich da – ein Handelsregister-
 * eintrag wird nicht übersetzt.
 */
use App\Core\Config;
use App\Core\I18n;

$company = Config::get('company');
$title = I18n::t('legal.title') . ' | ' . ($company['name'] ?? '21 Capital Invest');
$description = I18n::t('legal.description');
$bodyClass = 'page-site page-legal';
$extraCss = 'site.css';
require __DIR__ . '/partials/head.php';
?>
<header class="s-top">
  <a class="s-logo" href="<?= I18n::url('home') ?>" aria-label="<?= htmlspecialchars(I18n::t('nav.home'), ENT_QUOTES) ?>">
    <img src="/assets/brand/logo.png" alt="<?= htmlspecialchars((string) ($company['name'] ?? ''), ENT_QUOTES) ?>" width="132" height="44">
  </a>
  <nav class="s-nav">
    <a href="<?= I18n::url('home') ?>"><?= I18n::t('nav.home') ?></a>
    <?php require __DIR__ . '/partials/langswitch.php'; ?>
    <a href="<?= I18n::url('contact') ?>" class="s-btn s-btn-sm"><?= I18n::t('nav.contact') ?></a>
  </nav>
</header>

<main class="s-legal">
  <div class="s-wrap">
    <h1><?= htmlspecialchars(I18n::t('legal.h1'), ENT_QUOTES) ?></h1>

    <div class="s-legal-grid">
      <?php foreach (I18n::list('legal.sections') as $abschnitt): ?>
      <section>
        <h2><?= htmlspecialchars((string) $abschnitt['h'], ENT_QUOTES) ?></h2>
        <p><?= nl2br(htmlspecialchars((string) $abschnitt['p'], ENT_QUOTES)) ?></p>
      </section>
      <?php endforeach; ?>
    </div>

    <h2 class="s-legal-h"><?= htmlspecialchars(I18n::t('legal.risk_h'), ENT_QUOTES) ?></h2>
    <?php foreach (I18n::list('legal.risk') as $absatz): ?>
      <p><?= htmlspecialchars((string) $absatz, ENT_QUOTES) ?></p>
    <?php endforeach; ?>
  </div>
</main>

<?php require __DIR__ . '/partials/footer.php'; ?>
</body>
</html>
