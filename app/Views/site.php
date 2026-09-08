<?php
/**
 * Startseite – die öffentliche Strecke vor dem Wizard.
 *
 * Inhalte und Aufbau folgen dem bisherigen Auftritt: Problem, Weckruf,
 * Lösung, dann die Anfrage. Serverseitig gerendert und nicht per JavaScript
 * aufgebaut, weil eine Startseite auch dann stehen muss, wenn ein Skript
 * hakt – und weil Suchmaschinen den Text so ohne Umweg lesen.
 *
 * Die Sätze selbst stehen in app/Lang/{de,en}.php; hier steht nur, in
 * welcher Reihenfolge sie erscheinen.
 */
use App\Core\Config;
use App\Core\I18n;
use App\Domain\Hours;

$company = Config::get('company');
$t = static fn (string $key, string|int ...$args): string => I18n::t($key, ...$args);

$title = $t('site.title') . ' | ' . ($company['name'] ?? '21 Capital Invest');
$description = $t('site.description');
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
            'url'         => $basis . I18n::url('home'),
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
            'areaServed' => ['@type' => 'Country', 'name' => I18n::isEn() ? 'Germany' : 'Deutschland'],
            'knowsAbout' => I18n::list('site.schema.knows'),
        ],
        [
            '@type'    => 'WebSite',
            '@id'      => $basis . '/#website',
            'url'      => $basis . I18n::url('home'),
            'name'     => $firmenname,
            'publisher' => ['@id' => $basis . '/#organisation'],
            'inLanguage' => I18n::locale(),
        ],
        [
            // Das Versprechen, um das sich die ganze Anwendung dreht –
            // maschinenlesbar, nicht nur als Werbezeile.
            '@type'       => 'Service',
            'name'        => $t('site.schema.service'),
            'provider'    => ['@id' => $basis . '/#organisation'],
            'description' => $t('site.schema.description'),
            'areaServed'  => ['@type' => 'Country', 'name' => I18n::isEn() ? 'Germany' : 'Deutschland'],
            'offers'      => [
                '@type'         => 'Offer',
                'price'         => '0',
                'priceCurrency' => 'EUR',
                'url'           => $basis . I18n::url('contact'),
            ],
        ],
    ],
];
?>
<script type="application/ld+json"><?= json_encode($strukturiert, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>

<header class="s-top">
  <a class="s-logo" href="<?= I18n::url('home') ?>" aria-label="<?= htmlspecialchars((string) ($company['name'] ?? ''), ENT_QUOTES) ?>">
    <img src="/assets/brand/logo.png" alt="<?= htmlspecialchars((string) ($company['name'] ?? ''), ENT_QUOTES) ?>" width="132" height="44">
  </a>
  <nav class="s-nav">
    <a href="#problem"><?= $t('nav.problem') ?></a>
    <a href="#loesung"><?= $t('nav.solution') ?></a>
    <?php require __DIR__ . '/partials/langswitch.php'; ?>
    <a href="<?= I18n::url('contact') ?>" class="s-btn s-btn-sm"><?= $t('nav.contact') ?></a>
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
      <p class="s-kicker reveal"><?= $t('site.hero.kicker') ?></p>
      <h1 class="reveal"><?= $t('site.hero.h1') ?><br><span class="s-accent"><?= $t('site.hero.h1b') ?></span></h1>
      <p class="s-lead reveal"><?= $t('site.hero.lead') ?></p>
      <div class="s-cta reveal">
        <a href="<?= I18n::url('contact') ?>" class="s-btn"><?= $t('site.hero.cta') ?></a>
        <a href="#problem" class="s-btn s-btn-ghost"><?= $t('site.hero.more') ?></a>
      </div>
      <p class="s-promise reveal"><?= htmlspecialchars($t('site.hero.promise', $promise), ENT_QUOTES) ?></p>
    </div>
  </section>

  <!-- ── Das Problem ── -->
  <section class="s-section" id="problem">
    <div class="s-wrap s-split">
      <div class="reveal">
        <p class="s-eyebrow"><?= $t('site.problem.eyebrow') ?></p>
        <h2><?= $t('site.problem.h2') ?></h2>
        <p class="s-claim"><?= $t('site.problem.claim') ?></p>
        <p><?= $t('site.problem.intro') ?></p>
        <ul class="s-list">
          <?php foreach (I18n::list('site.problem.items') as $punkt): ?>
            <li><?= htmlspecialchars((string) $punkt, ENT_QUOTES) ?></li>
          <?php endforeach; ?>
        </ul>
        <?php if ($bild('thema-euro.webp')): ?>
        <div class="s-thumbs">
          <?php foreach (I18n::list('site.problem.thumbs') as $datei => $titel): ?>
            <?php if ($bild((string) $datei)): ?>
              <figure><img src="<?= $bild((string) $datei) ?>" alt="" loading="lazy"><figcaption><?= htmlspecialchars((string) $titel, ENT_QUOTES) ?></figcaption></figure>
            <?php endif; ?>
          <?php endforeach; ?>
        </div>
        <?php endif; ?>
        <p class="s-result">
          <strong><?= $t('site.problem.result_label') ?></strong> <?= $t('site.problem.result') ?>
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
      <h2><?= $t('site.band.h2') ?><br><span class="s-accent"><?= $t('site.band.h2b') ?></span></h2>
      <p><?= $t('site.band.text') ?></p>
      <a href="<?= I18n::url('contact') ?>" class="s-btn"><?= $t('site.band.cta') ?></a>
    </div>
  </section>

  <!-- ── Die Lösung ── -->
  <section class="s-section" id="loesung">
    <div class="s-wrap">
      <div class="s-head reveal">
        <p class="s-eyebrow"><?= $t('site.solution.eyebrow') ?></p>
        <h2><?= $t('site.solution.h2') ?> <span class="s-accent"><?= $t('site.solution.h2b') ?></span></h2>
        <p class="s-claim"><?= $t('site.solution.claim') ?></p>
        <p class="s-lead-2"><?= $t('site.solution.lead') ?></p>
      </div>

      <p class="s-sub reveal"><?= $t('site.solution.sub') ?></p>
      <div class="s-cards">
        <?php foreach (array_values(I18n::list('site.solution.cards')) as $i => $text): ?>
          <?php $datei = ['thema-schutz.webp', 'thema-wege.webp', 'thema-rendite.webp'][$i] ?? ''; ?>
          <article class="s-card reveal">
            <?php if ($datei !== '' && $bild($datei)): ?>
              <img class="s-card-bild" src="<?= $bild($datei) ?>" alt="" loading="lazy">
            <?php endif; ?>
            <span class="s-num"><?= str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT) ?></span>
            <p><?= htmlspecialchars((string) $text, ENT_QUOTES) ?></p>
          </article>
        <?php endforeach; ?>
      </div>
    </div>
  </section>

  <!-- ── Abschluss ── -->
  <section class="s-final">
    <div class="s-wrap reveal">
      <h2><?= $t('site.final.h2') ?></h2>
      <p><?= htmlspecialchars($t('site.final.text', $promise), ENT_QUOTES) ?></p>
      <a href="<?= I18n::url('contact') ?>" class="s-btn s-btn-lg"><?= $t('site.final.cta') ?></a>
      <p class="s-fineprint"><?= $t('site.final.fineprint') ?></p>
    </div>
  </section>
</main>

<?php require __DIR__ . '/partials/footer.php'; ?>
<script type="module" src="<?= $asset('/assets/js/site.js') ?>"></script>
</body>
</html>
