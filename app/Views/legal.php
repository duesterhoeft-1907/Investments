<?php
/**
 * Impressum und Risikohinweise.
 *
 * Pflichtangaben nach § 5 DDG. Die Angaben stammen aus dem bisherigen
 * Auftritt; ändern sie sich, ändern sie sich hier.
 */
use App\Core\Config;

$company = Config::get('company');
$title = 'Impressum | ' . ($company['name'] ?? '21 Capital Invest');
$description = 'Impressum und rechtliche Hinweise.';
$bodyClass = 'page-site page-legal';
$extraCss = 'site.css';
require __DIR__ . '/partials/head.php';
?>
<header class="s-top">
  <a class="s-logo" href="/" aria-label="Startseite">
    <img src="/assets/brand/logo.png" alt="<?= htmlspecialchars((string) ($company['name'] ?? ''), ENT_QUOTES) ?>" width="132" height="44">
  </a>
  <nav class="s-nav">
    <a href="/">Start</a>
    <a href="/anfrage" class="s-btn s-btn-sm">Kontaktiere uns</a>
  </nav>
</header>

<main class="s-legal">
  <div class="s-wrap">
    <h1>Impressum</h1>

    <div class="s-legal-grid">
      <section>
        <h2>Firmenzentrale</h2>
        <p>
          BMA Berlin Management Agency GmbH<br>
          Potsdamer Platz 1<br>
          10117 Berlin<br>
          Deutschland
        </p>
      </section>

      <section>
        <h2>Agenturzentrale</h2>
        <p>
          BMA Berlin Management Agency GmbH<br>
          Marketing Department<br>
          Lutherstraße 22<br>
          27576 Bremerhaven<br>
          Deutschland
        </p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>E-Mail: mail(AT)21capitalinvest.com</p>
      </section>

      <section>
        <h2>Geschäftsführer</h2>
        <p>Toni Bloch (CEO)</p>
      </section>

      <section>
        <h2>Sitz der Gesellschaft</h2>
        <p>Berlin und Bremerhaven, Deutschland</p>
      </section>

      <section>
        <h2>Registergericht</h2>
        <p>
          Berlin-Charlottenburg, HRB 208268<br>
          Steuernummer 1130/232/51932
        </p>
      </section>
    </div>

    <h2 class="s-legal-h">Risikohinweis</h2>
    <p>
      Investitionen in Kryptowährungen, digitale Vermögenswerte und dezentrale Finanzsysteme
      (DeFi) sind mit erheblichen Risiken verbunden und können zum vollständigen Verlust des
      eingesetzten Kapitals führen. Renditen sind nicht garantiert.
    </p>
    <p>
      Die auf dieser Website bereitgestellten Informationen dienen ausschließlich allgemeinen
      Informationszwecken und stellen keine individuelle Anlage-, Rechts- oder Steuerberatung dar.
    </p>
  </div>
</main>

<?php require __DIR__ . '/partials/footer.php'; ?>
</body>
</html>
