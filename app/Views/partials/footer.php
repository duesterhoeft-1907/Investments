<?php
/**
 * Gemeinsamer Fuss der öffentlichen Seiten.
 *
 * Der Risikohinweis steht bewusst hier und nicht nur im Impressum: er gehört
 * dorthin, wo die Renditeversprechen stehen, nicht zwei Klicks entfernt.
 */
use App\Core\Config;

$company = Config::get('company');
?>
<footer class="s-foot">
  <div class="s-wrap">
    <div class="s-foot-top">
      <img src="/assets/brand/logo.png" alt="" width="120" height="40" loading="lazy">
      <nav class="s-foot-nav">
        <a href="/">Start</a>
        <a href="/anfrage">Kontaktiere uns</a>
        <a href="/impressum">Impressum</a>
        <a href="/portal">Kundenbereich</a>
      </nav>
    </div>

    <p class="s-risk">
      Investitionen in Kryptowährungen, digitale Vermögenswerte und dezentrale Finanzsysteme
      (DeFi) sind mit erheblichen Risiken verbunden und können zum vollständigen Verlust des
      eingesetzten Kapitals führen. Renditen sind nicht garantiert. Die auf dieser Website
      bereitgestellten Informationen dienen ausschließlich allgemeinen Informationszwecken und
      stellen keine individuelle Anlage-, Rechts- oder Steuerberatung dar.
    </p>

    <p class="s-copy">
      Copyright <?= htmlspecialchars((string) ($company['name'] ?? '21 Capital Invest'), ENT_QUOTES) ?>
      &copy; <?= date('Y') ?>
    </p>
  </div>
</footer>
