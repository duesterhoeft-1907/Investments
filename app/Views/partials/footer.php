<?php
/**
 * Gemeinsamer Fuss der öffentlichen Seiten.
 *
 * Der Risikohinweis steht bewusst hier und nicht nur im Impressum: er gehört
 * dorthin, wo die Renditeversprechen stehen, nicht zwei Klicks entfernt.
 */
use App\Core\Config;
use App\Core\I18n;

$company = Config::get('company');
?>
<footer class="s-foot">
  <div class="s-wrap">
    <div class="s-foot-top">
      <img src="/assets/brand/logo.png" alt="" width="120" height="40" loading="lazy">
      <nav class="s-foot-nav">
        <a href="<?= I18n::url('home') ?>"><?= I18n::t('nav.home') ?></a>
        <a href="<?= I18n::url('contact') ?>"><?= I18n::t('nav.contact') ?></a>
        <a href="<?= I18n::url('imprint') ?>"><?= I18n::t('nav.imprint') ?></a>
        <a href="/portal"><?= I18n::t('nav.portal') ?></a>
      </nav>
    </div>

    <p class="s-risk"><?= I18n::t('footer.risk') ?></p>

    <p class="s-copy">
      <?= I18n::t('footer.copyright', htmlspecialchars((string) ($company['name'] ?? '21 Capital Invest'), ENT_QUOTES), date('Y')) ?>
    </p>
  </div>
</footer>
