<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Bilder auf ein handliches Mass bringen.
 *
 * Nur für Profilbilder gedacht, und deshalb bewusst schmal: quadratisch
 * zuschneiden, verkleinern, als WebP ablegen. Kein Bildbearbeitungs-
 * werkzeug, keine Filter.
 *
 * Warum überhaupt umrechnen und nicht einfach ablegen, was hochgeladen
 * wurde: ein Porträt aus einer Handykamera hat gern vier Megabyte. Das
 * lädt in einer Übersicht mit zwölf Beratern niemand freiwillig – und es
 * wären zwölf Bilder, die nur als 36 Pixel grosser Kreis erscheinen.
 */
final class Bild
{
    /** Kantenlänge der abgelegten Datei. Reicht für die grösste Stelle, an der sie erscheint. */
    public const KANTE = 320;

    public static function verfuegbar(): bool
    {
        return extension_loaded('gd') && function_exists('imagecreatetruecolor');
    }

    /**
     * Schneidet mittig ein Quadrat heraus, verkleinert es und legt es ab.
     *
     * @return string der geschriebene Dateiname
     * @throws \RuntimeException wenn die Datei kein lesbares Bild ist
     */
    public static function quadrat(string $quelle, string $zielOrdner, int $kante = self::KANTE): string
    {
        if (!self::verfuegbar()) {
            throw new \RuntimeException('Auf diesem Server fehlt die Bildbibliothek GD.');
        }

        $info = @getimagesize($quelle);
        if ($info === false) {
            throw new \RuntimeException('Die Datei ist kein lesbares Bild.');
        }

        [$breite, $hoehe, $typ] = $info;
        $original = match ($typ) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($quelle),
            IMAGETYPE_PNG  => @imagecreatefrompng($quelle),
            IMAGETYPE_WEBP => @imagecreatefromwebp($quelle),
            IMAGETYPE_GIF  => @imagecreatefromgif($quelle),
            default        => false,
        };
        if ($original === false) {
            throw new \RuntimeException('Dieses Bildformat lässt sich hier nicht verarbeiten.');
        }

        // Mittig zuschneiden: bei einem Porträt ist das Gesicht selten am
        // Rand, und alles andere waere Raten.
        $seite = min($breite, $hoehe);
        $x = (int) (($breite - $seite) / 2);
        $y = (int) (($hoehe - $seite) / 2);

        $ziel = imagecreatetruecolor($kante, $kante);
        // Durchsichtigkeit erhalten, damit ein PNG mit freigestelltem
        // Hintergrund nicht auf Schwarz landet.
        imagealphablending($ziel, false);
        imagesavealpha($ziel, true);
        imagefill($ziel, 0, 0, imagecolorallocatealpha($ziel, 0, 0, 0, 127));

        imagecopyresampled($ziel, $original, 0, 0, $x, $y, $kante, $kante, $seite, $seite);
        imagedestroy($original);

        if (!is_dir($zielOrdner) && !mkdir($zielOrdner, 0775, true) && !is_dir($zielOrdner)) {
            imagedestroy($ziel);
            throw new \RuntimeException('Ablageordner konnte nicht angelegt werden.');
        }

        $name = bin2hex(random_bytes(16)) . '.webp';
        $ok = imagewebp($ziel, $zielOrdner . '/' . $name, 82);
        imagedestroy($ziel);

        if (!$ok) {
            throw new \RuntimeException('Bild konnte nicht gespeichert werden.');
        }
        return $name;
    }
}
