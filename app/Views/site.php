<?php
/**
 * Startseite – die öffentliche Strecke vor dem Wizard.
 *
 * Inhalte und Aufbau folgen dem bisherigen Auftritt: Problem, Weckruf,
 * Lösung, dann die Anfrage. Serverseitig gerendert und nicht per JavaScript
 * aufgebaut, weil eine Startseite auch dann stehen muss, wenn ein Skript
 * hakt – und weil Suchmaschinen den Text so ohne Umweg lesen.
 */
use App\Core\Config;
use App\Domain\Hours;

$company = Config::get('company');
$title = 'Vermögensschutz & globale Investments | ' . ($company['name'] ?? '21 Capital Invest');
$description = 'Bargeldobergrenzen und Inflation fressen dein Geld auf. Erfahre in einem '
    . 'diskreten Erstgespräch, wie du dein Kapital legal außerhalb der EU-Reichweite parkst.';
$bodyClass = 'page-site';
$extraCss = 'site.css';

// Was wir zusagen dürfen, hängt an den Geschäftszeiten.
$promise = Hours::promise((int) Config::get('sla_minutes', 15));

/**
 * Gibt die Adresse eines Markenbildes zurück – oder null, wenn es fehlt.
 *
 * Die Themenbilder holt bin/fetch-images.php von der Unternehmensseite
 * nach. Fehlen sie, soll die Seite nicht mit Platzhaltern aufwarten,
 * sondern den Abschnitt schlicht ohne Bild zeigen.
 */
$bild = static function (string $datei): ?string {
    $pfad = __DIR__ . '/../../public_html/assets/brand/' . $datei;
    return is_file($pfad) ? '/assets/brand/' . $datei . '?v=' . filemtime($pfad) : null;
};

require __DIR__ . '/partials/head.php';

/*
 * Strukturierte Daten.
 *
 * Klassische Suchmaschinen lesen daraus die Angaben für ihre Trefferkarte;
 * KI-Suchsysteme zitieren daraus, wer hier eigentlich spricht. Beides sind
 * Angaben, die im Fließtext stehen – hier stehen sie noch einmal in einer
 * Form, die eine Maschine ohne Raten versteht.
 */
$firmenname = (string) ($company['name'] ?? '21 Capital Invest');
$basis = rtrim((string) Config::get('base_url', ''), '/');
$strukturiert = [
    '@context' => 'https://schema.org',
    '@graph'   => [
        [
            '@type'       => 'FinancialService',
            '@id'         => $basis . '/#organisation',
            'name'        => $firmenname,
            'url'         => $basis . '/',
            'logo'        => $basis . '/assets/brand/logo.png',
            'description' => $description,
            'telephone'   => (string) ($company['phone'] ?? ''),
            'email'       => (string) ($company['email'] ?? ''),
            'address'     => [
                '@type'           => 'PostalAddress',
                'streetAddress'   => 'Potsdamer Platz 1',
                'postalCode'      => '10117',
                'addressLocality' => 'Berlin',
                'addressCountry'  => 'DE',
            ],
            'areaServed' => ['@type' => 'Country', 'name' => 'Deutschland'],
            'knowsAbout' => [
                'Vermögensschutz', 'Edelmetalle', 'Sachwerte',
                'Private Equity', 'Diversifikation außerhalb der EU',
            ],
        ],
        [
            '@type'    => 'WebSite',
            '@id'      => $basis . '/#website',
            'url'      => $basis . '/',
            'name'     => $firmenname,
            'publisher' => ['@id' => $basis . '/#organisation'],
            'inLanguage' => 'de-DE',
        ],
        [
            // Das Versprechen, um das sich die ganze Anwendung dreht –
            // maschinenlesbar, nicht nur als Werbezeile.
            '@type'       => 'Service',
            'name'        => 'Diskretes Erstgespräch zum Vermögensschutz',
            'provider'    => ['@id' => $basis . '/#organisation'],
            'description' => 'Kostenloses und vertrauliches Erstgespräch. Die Anfrage geht direkt '
                . 'an das zuständige Fachteam; die Reaktionszeit wird gemessen.',
            'areaServed'  => ['@type' => 'Country', 'name' => 'Deutschland'],
            'offers'      => [
                '@type'         => 'Offer',
                'price'         => '0',
                'priceCurrency' => 'EUR',
                'url'           => $basis . '/anfrage',
            ],
        ],
    ],
];
?>
<script type="application/ld+json"><?= json_encode($strukturiert, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>

<header class="s-top">
  <a class="s-logo" href="/" aria-label="<?= htmlspecialchars((string) ($company['name'] ?? ''), ENT_QUOTES) ?>">
    <img src="/assets/brand/logo.png" alt="<?= htmlspecialchars((string) ($company['name'] ?? ''), ENT_QUOTES) ?>" width="132" height="44">
  </a>
  <nav class="s-nav">
    <a href="#problem">Das Problem</a>
    <a href="#loesung">Die Lösung</a>
    <a href="/anfrage" class="s-btn s-btn-sm">Kontaktiere uns</a>
  </nav>
</header>

<main>
  <!-- ── Hero ── -->
  <section class="s-hero">
    <?php /* Dasselbe Bild wie auf der Unternehmensseite, gleich gesetzt
             (cover, mittig). Darüber ein dunkler Verlauf – ohne ihn stünde
             heller Text auf hellem Himmel, und die Aussage wäre nicht mehr
             zu lesen. */ ?>
    <div class="s-hero-bild" aria-hidden="true"></div>
    <div class="s-hero-glow" aria-hidden="true"></div>
    <div class="s-wrap">
      <p class="s-kicker reveal">EU-Geld-Diktat steht bevor</p>
      <h1 class="reveal">Vermögensschutz &amp;<br><span class="s-accent">globale Investments</span></h1>
      <p class="s-lead reveal">
        Bargeldobergrenzen und Inflation fressen dein Geld auf. Erfahre in einem diskreten
        Erstgespräch, wie du dein Kapital legal außerhalb der EU-Reichweite parkst.
      </p>
      <div class="s-cta reveal">
        <a href="/anfrage" class="s-btn">Kontaktiere uns</a>
        <a href="#problem" class="s-btn s-btn-ghost">Mehr Informationen</a>
      </div>
      <p class="s-promise reveal">Rückmeldung <?= htmlspecialchars($promise, ENT_QUOTES) ?> – von einem Menschen, nicht aus einem Postfach.</p>
    </div>
  </section>

  <!-- ── Das Problem ── -->
  <section class="s-section" id="problem">
    <div class="s-wrap s-split">
      <div class="reveal">
        <p class="s-eyebrow">Das Problem</p>
        <h2>Enteignung &amp; Nullzinsfalle</h2>
        <p class="s-claim">Sie nehmen dir dein Bargeld – und die Inflation vernichtet den Rest.</p>
        <p>Die Brüsseler Hinterzimmer haben das Urteil über dein Erspartes längst gefällt:</p>
        <ul class="s-list">
          <li>Der digitale Euro kommt. Jede Transaktion wird gläsern, dein Geld auf Knopfdruck
              programmierbar und im Ernstfall gesperrt.</li>
          <li>Traditionelle Banken bieten dir mickrige Zinsen, die nicht einmal die reale Inflation
              ausgleichen. Dein Geld auf dem Sparbuch stirbt einen langsamen Tod.</li>
          <li>Während der Staat über Vermögensabgaben nachdenkt, wirst du durch die Teuerungsrate
              schleichend enteignet.</li>
        </ul>
        <?php if ($bild('thema-euro.png')): ?>
        <div class="s-thumbs">
          <?php foreach ([
              'thema-euro.png'      => 'Der digitale Euro',
              'thema-inflation.png' => 'Inflation',
              'thema-steuern.png'   => 'Vermögensabgaben',
          ] as $datei => $titel): ?>
            <?php if ($bild($datei)): ?>
              <figure><img src="<?= $bild($datei) ?>" alt="" loading="lazy"><figcaption><?= $titel ?></figcaption></figure>
            <?php endif; ?>
          <?php endforeach; ?>
        </div>
        <?php endif; ?>
        <p class="s-result">
          <strong>Das Ergebnis:</strong> Wer sein Geld im klassischen EU-Banksystem liegen lässt,
          verliert doppelt – an Kontrolle und an Kaufkraft.
        </p>
      </div>
      <div class="s-figure reveal">
        <img src="/assets/brand/section.webp" alt="" width="720" height="480" loading="lazy">
      </div>
    </div>
  </section>

  <!-- ── Weckruf ── -->
  <section class="s-band">
    <div class="s-wrap reveal">
      <h2>Hör auf, Opfer der EU-Politik zu sein.<br><span class="s-accent">Werde zum Gewinner der Krise!</span></h2>
      <p>
        Die Uhr tickt. Während die breite Masse blind in die finanzielle Überwachung steuert,
        sichern sich clevere Anleger jetzt die besten Plätze und die höchsten Renditen.
        Nutze deine Chance auf ein echtes Insider-Gespräch, solange die Schlupflöcher noch offen sind.
      </p>
      <a href="/anfrage" class="s-btn">Erstgespräch anfragen</a>
    </div>
  </section>

  <!-- ── Die Lösung ── -->
  <section class="s-section" id="loesung">
    <div class="s-wrap">
      <div class="s-head reveal">
        <p class="s-eyebrow">Die Lösung</p>
        <h2>Vermögensschutz <span class="s-accent">plus maximalen Profit</span></h2>
        <p class="s-claim">Die Eliten bringen ihr Geld nicht nur in Sicherheit – sie lassen es im Ausland massiv wachsen!</p>
        <p class="s-lead-2">
          Es gibt legale Finanz-Oasen und krisenfeste Sachwerte außerhalb der EU-Regulierungswut,
          die normalen Sparern völlig unbekannt sind. Diese Strategien bieten dir das Beste aus
          zwei Welten: absoluten Schutz vor staatlichem Zugriff und überdurchschnittlich hohe,
          steueroptimierte Renditen.
        </p>
      </div>

      <p class="s-sub reveal">In deinem kostenlosen und absolut vertraulichen Erstgespräch zeigen wir dir:</p>
      <div class="s-cards">
        <?php foreach ([
            ['01', 'thema-schutz.png',  'Welche Sachwerte dein Vermögen unsichtbar für die EU machen und gleichzeitig historische Spitzen-Renditen abwerfen.'],
            ['02', 'thema-wege.png',    'Wie du legale Schlupflöcher nutzt, um von den Wachstums-Märkten außerhalb Europas zu profitieren – weit weg von der Euro-Krise.'],
            ['03', 'thema-rendite.png', 'Wie du dein Kapital innerhalb von 48 Stunden so umschichtest, dass es geschützt ist und sofort für dich arbeitet.'],
        ] as [$nummer, $datei, $text]): ?>
          <article class="s-card reveal">
            <?php if ($bild($datei)): ?>
              <img class="s-card-bild" src="<?= $bild($datei) ?>" alt="" loading="lazy">
            <?php endif; ?>
            <span class="s-num"><?= $nummer ?></span>
            <p><?= $text ?></p>
          </article>
        <?php endforeach; ?>
      </div>
    </div>
  </section>

  <!-- ── Abschluss ── -->
  <section class="s-final">
    <div class="s-wrap reveal">
      <h2>Vier Fragen. Dann meldet sich ein Mensch.</h2>
      <p>
        Ihre Anfrage geht direkt an das zuständige Fachteam – nicht in ein anonymes Postfach.
        Rückmeldung <?= htmlspecialchars($promise, ENT_QUOTES) ?>.
      </p>
      <a href="/anfrage" class="s-btn s-btn-lg">Jetzt Anfrage stellen</a>
      <p class="s-fineprint">Keine Weitergabe an Dritte · Persönlicher Rückruf statt Warteschleife · Eigener Kundenbereich inklusive</p>
    </div>
  </section>
</main>

<?php require __DIR__ . '/partials/footer.php'; ?>
<script type="module" src="<?= $asset('/assets/js/site.js') ?>"></script>
</body>
</html>
