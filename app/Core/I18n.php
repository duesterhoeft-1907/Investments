<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Zweisprachigkeit der öffentlichen Strecke.
 *
 * Deutsch ist die Grundsprache; Englisch liegt unter /en. Die Texte stehen
 * in app/Lang/{de,en}.php und nicht in den Ansichten – sonst müsste jede
 * Änderung an einem Satz an zwei Stellen nachgezogen werden, und genau das
 * geht auf Dauer schief.
 *
 * Die internen Bereiche (CRM, Verwaltung) bleiben deutsch: dort sitzen
 * Kolleginnen und Kollegen, keine Interessenten aus dem Ausland.
 */
final class I18n
{
    /** @var list<string> */
    public const LANGS = ['de', 'en'];

    /**
     * Die öffentlichen Seiten mit ihrer Adresse je Sprache.
     *
     * Sprechende englische Adressen statt /en/anfrage: wer die Seite auf
     * Englisch liest, soll auch in der Adresszeile Englisch lesen – und
     * Suchmaschinen ordnen /en/contact der englischen Fassung zu, ohne den
     * Umweg über das hreflang-Attribut zu brauchen.
     *
     * @var array<string,array<string,string>>
     */
    private const ROUTES = [
        'home'    => ['de' => '/',            'en' => '/en'],
        'contact' => ['de' => '/anfrage',     'en' => '/en/contact'],
        'imprint' => ['de' => '/impressum',   'en' => '/en/imprint'],
        'privacy' => ['de' => '/datenschutz', 'en' => '/en/privacy'],
    ];

    private static string $lang = 'de';

    /** @var array<string,array<string,mixed>> */
    private static array $dicts = [];

    public static function use(string $lang): void
    {
        self::$lang = in_array($lang, self::LANGS, true) ? $lang : 'de';
    }

    public static function lang(): string
    {
        return self::$lang;
    }

    public static function isEn(): bool
    {
        return self::$lang === 'en';
    }

    /** Das Kürzel für <html lang> und die Locale für Datumsangaben. */
    public static function locale(): string
    {
        return self::isEn() ? 'en-GB' : 'de-DE';
    }

    /**
     * Erkennt die Sprache am Pfad. /en und /en/… sind englisch, alles andere
     * deutsch. Der Aufrufer bekommt beides zurück, damit er nicht selbst
     * schneiden muss.
     *
     * @return array{0:string,1:string} Sprache und der Pfad ohne Präfix
     */
    public static function split(string $path): array
    {
        if ($path === '/en' || $path === '/en/') {
            return ['en', '/'];
        }
        if (str_starts_with($path, '/en/')) {
            return ['en', substr($path, 3)];
        }
        return ['de', $path === '' ? '/' : $path];
    }

    /**
     * Der Name der öffentlichen Seite zu einem Pfad – oder null, wenn der
     * Pfad zu keiner gehört.
     */
    public static function route(string $path): ?string
    {
        $path = $path === '' ? '/' : rtrim($path, '/');
        if ($path === '') {
            $path = '/';
        }
        foreach (self::ROUTES as $name => $paths) {
            foreach ($paths as $candidate) {
                if (rtrim($candidate, '/') === rtrim($path, '/') || $candidate === $path) {
                    return $name;
                }
            }
        }
        return null;
    }

    /** Die Adresse einer Seite in der aktuellen – oder einer anderen – Sprache. */
    public static function url(string $route, ?string $lang = null): string
    {
        $lang = $lang !== null && in_array($lang, self::LANGS, true) ? $lang : self::$lang;
        return self::ROUTES[$route][$lang] ?? '/';
    }

    /**
     * Alle Sprachfassungen einer Seite – für die hreflang-Angaben im Kopf.
     *
     * @return array<string,string> Sprache => Adresse
     */
    public static function alternates(string $route): array
    {
        $out = [];
        foreach (self::LANGS as $lang) {
            if (isset(self::ROUTES[$route][$lang])) {
                $out[$lang] = self::ROUTES[$route][$lang];
            }
        }
        return $out;
    }

    /**
     * Ein Text aus dem Wörterbuch, angesprochen über einen Punktpfad
     * ("site.hero.lead"). Fehlt er, kommt der Schlüssel zurück – sichtbar
     * falsch ist besser als still leer.
     *
     * Weitere Argumente werden per sprintf eingesetzt.
     */
    public static function t(string $key, string|int ...$args): string
    {
        $value = self::get($key);
        if (!is_string($value)) {
            return $key;
        }
        return $args === [] ? $value : vsprintf($value, $args);
    }

    /**
     * Wie t(), nur für Listen und Tabellen aus dem Wörterbuch.
     *
     * @return array<mixed>
     */
    public static function list(string $key): array
    {
        $value = self::get($key);
        return is_array($value) ? $value : [];
    }

    /**
     * Überlagert eine deutsche Beschriftungstabelle mit der Übersetzung.
     *
     * Die Schlüssel bleiben, was sie sind – sie stehen so in der Datenbank
     * und dürfen sich nicht mit der Sprache ändern. Fehlt eine Übersetzung,
     * bleibt der deutsche Text stehen; eine Lücke ist besser als ein
     * verschwundener Eintrag.
     *
     * @param  array<string,string> $labels
     * @return array<string,string>
     */
    public static function labels(string $key, array $labels): array
    {
        if (!self::isEn()) {
            return $labels;
        }
        $translated = self::list($key);
        foreach ($labels as $value => $label) {
            if (isset($translated[$value]) && is_string($translated[$value])) {
                $labels[$value] = $translated[$value];
            }
        }
        return $labels;
    }

    private static function get(string $key): mixed
    {
        $dict = self::dict(self::$lang);
        $value = self::dig($dict, $key);

        // Deutsch ist die Rückfallebene: eine noch nicht übersetzte Stelle
        // zeigt den deutschen Satz statt einer leeren Zeile.
        if ($value === null && self::$lang !== 'de') {
            $value = self::dig(self::dict('de'), $key);
        }
        return $value;
    }

    private static function dig(array $dict, string $key): mixed
    {
        $node = $dict;
        foreach (explode('.', $key) as $part) {
            if (!is_array($node) || !array_key_exists($part, $node)) {
                return null;
            }
            $node = $node[$part];
        }
        return $node;
    }

    /** @return array<string,mixed> */
    private static function dict(string $lang): array
    {
        if (!isset(self::$dicts[$lang])) {
            $file = dirname(__DIR__) . '/Lang/' . $lang . '.php';
            self::$dicts[$lang] = is_file($file) ? (array) require $file : [];
        }
        return self::$dicts[$lang];
    }
}
