#!/usr/bin/env python3
"""
Vertont den Erklaerfilm mit ElevenLabs.

Warum ausserhalb der Anwendung: api.elevenlabs.io ist aus der Bauumgebung
nicht erreichbar, und welche Stimmen die Lieblingsstimmen sind, weiss nur ihr.
Das Skript braucht nur Python 3 (Bordmittel) und ffmpeg.

    # Den Schlüssel einmal hinterlegen – danach findet ihn das Skript selbst:
    umask 077; printf '%s' 'sk_…' > ~/.elevenlabs_key
    python3 video/vertonen.py --mundart schwaebisch --stimme M   # Bill
    python3 video/vertonen.py --mundart platt       --stimme W   # Corinna

Ergebnis: video/erklaerfilm-<mundart>.mp4. Danach den Vorspann davorsetzen:

    python3 video/vorspann.py --film video/erklaerfilm-schwaebisch.mp4

Stimmen, Modell und Einstellungen sind dieselben wie im EXECUTEX-Video-Kit –
damit klingt der Film wie die anderen Filme aus dem Haus.

Ablauf je Abschnitt: Text sprechen lassen, Laenge messen, notfalls minimal
straffen, an die Startsekunde des Abschnitts setzen, mit Stille auffuellen.
So bleibt Ton und Bild bis zum Schluss synchron, auch wenn eine Stimme
schneller oder langsamer spricht als die naechste.
"""

from __future__ import annotations

import argparse
import json
import re
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

HIER = Path(__file__).resolve().parent
VORLAUF_S = 0.35          # kleiner Atemzug, damit der Satz nicht auf dem Schnitt klebt
MAX_STRAFFUNG = 1.18      # darueber klingt es gehetzt – dann lieber den Text kuerzen

# Die zwei Lieblingsstimmen aus dem EXECUTEX-Video-Kit.
STIMMEN = {
    'M': ('pqHfZKP75CvOlQylNhV4', 'Bill · Erzähler, reif, ruhig'),
    'W': ('gVOibprogMfmHVVyo5r6', 'Corinna · Moderatorin, selbstbewusst, warm'),
}
# Ebenfalls aus dem Kit übernommen, damit der Klang zu den anderen Filmen passt.
EINSTELLUNGEN = {
    'stability': 0.40,
    'similarity_boost': 0.80,
    'style': 0.50,
    'use_speaker_boost': True,
}


def werkzeug() -> str:
    """ffmpeg aus dem Suchpfad, sonst das von imageio mitgelieferte."""
    if (pfad := shutil.which("ffmpeg")):
        return pfad
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit("ffmpeg fehlt. Auf dem Mac: brew install ffmpeg")


def laenge(ff: str, datei: Path) -> float:
    """Länge in Sekunden – aus der Ausgabe von ffmpeg selbst gelesen.

    Absichtlich ohne ffprobe: das liegt zwar meist daneben, fehlt aber
    genau dann, wenn ffmpeg aus einem Python-Paket kommt."""
    aus = subprocess.run([ff, "-hide_banner", "-i", str(datei)],
                         capture_output=True, text=True).stderr
    treffer = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", aus)
    if treffer is None:
        sys.exit(f"Länge von {datei} nicht lesbar.")
    h, m, s = treffer.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def schluesselPruefen(schluessel: str, woher: str) -> None:
    """
    Sieht das nach einem Schlüssel aus?

    Der häufigste Fehler ist kein Tippfehler, sondern ein kopierter
    Platzhalter: "sk_…" mit dem Auslassungszeichen aus einer Anleitung. Ohne
    diese Prüfung stirbt das Skript erst tief in der HTTP-Bibliothek, mit
    einer Meldung über den Latin-1-Zeichensatz, in der das Wort Schlüssel
    nicht vorkommt.
    """
    if not schluessel.isascii():
        fremde = ''.join(sorted({z for z in schluessel if not z.isascii()}))
        sys.exit(
            f"Der Schlüssel {woher} enthält Zeichen, die dort nicht hingehören: {fremde}\n"
            f"    Das ist fast immer ein kopierter Platzhalter wie sk_… – "
            f"bitte den echten Schlüssel einsetzen.\n"
            f"    Steht er in der Umgebung, gewinnt er gegen ~/.elevenlabs_key: "
            f"dann erst 'unset ELEVENLABS_API_KEY'."
        )
    if len(schluessel) < 20:
        sys.exit(f"Der Schlüssel {woher} ist mit {len(schluessel)} Zeichen zu kurz, "
                 f"um echt zu sein.")


def sprechen(text: str, stimme: str, modell: str, schluessel: str, ziel: Path) -> None:
    anfrage = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{stimme}",
        data=json.dumps({
            "text": text,
            "model_id": modell,
            "voice_settings": EINSTELLUNGEN,
        }).encode("utf-8"),
        headers={"xi-api-key": schluessel, "Content-Type": "application/json",
                 "Accept": "audio/mpeg"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(anfrage, timeout=180) as antwort:
            ziel.write_bytes(antwort.read())
    except urllib.error.HTTPError as fehler:
        rumpf = fehler.read().decode('utf-8', 'replace')

        # ElevenLabs schickt 401 sowohl für "Schlüssel falsch" als auch für
        # "Guthaben leer". Der Unterschied steht im Rumpf, und er ist
        # erheblich: das eine behebt man mit einem anderen Schlüssel, das
        # andere nur mit Geld oder Warten.
        try:
            code = json.loads(rumpf).get('detail', {}).get('code', '')
        except (ValueError, AttributeError):
            code = ''

        hinweis = ''
        if code == 'quota_exceeded':
            hinweis = ('\n    Das Guthaben ist aufgebraucht – am Schlüssel liegt es nicht.'
                       '\n    Was dieser Schlüssel wirklich sieht:'
                       '\n      curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" '
                       'https://api.elevenlabs.io/v1/user/subscription')
        elif fehler.code == 401:
            hinweis = ('\n    Der Schlüssel wird nicht anerkannt. '
                       'Der richtige steht in der config.py des Video-Kits.')

        sys.exit(f"ElevenLabs antwortet mit {fehler.code}: {rumpf[:400]}{hinweis}")
    except urllib.error.URLError as fehler:
        sys.exit(f"api.elevenlabs.io ist nicht erreichbar: {fehler.reason}")


def zahlenBauen(ffmpeg: str, plan: dict, mundart: str, stimme: str, modell: str,
                schluessel: str, arbeit: Path, nr: int, budget: float, ziel: Path) -> None:
    """
    Baut einen Countdown, der auf den Ziffern sitzt.

    Im Film wechselt die Zahl im Sekundentakt: die Vier steht von 0 bis 1, die
    Drei von 1 bis 2, und so weiter. Eine am Stück gesprochene Zeile hält sich
    nicht daran – sie ist schneller fertig, als das Bild zählt.

    Deshalb wird jede Zahl einzeln gesprochen und mit adelay an ihre Sekunde
    gesetzt. Die vier Aufnahmen entstehen einmal je Mundart und werden für alle
    sechs Countdowns wiederverwendet: das spart nicht nur Guthaben, es klingt
    auch gleich – ein Countdown, der beim vierten Mal anders betont, fällt auf.
    """
    zahlen = plan.get("zahlen", {}).get(mundart)
    if not zahlen:
        sys.exit("In sprecher.json fehlt der Block 'zahlen' für " + mundart)

    aufnahmen = []
    for i, wort in enumerate(zahlen):
        datei = arbeit / f"zahl-{i + 1}.mp3"
        if not datei.is_file():
            print(f"    Zahl „{wort}“ – spreche …")
            sprechen(wort, stimme, modell, schluessel, datei)
        aufnahmen.append(datei)

    # Ein Hauch nach dem Wechsel, nicht davor: die Zahl ist schon zu sehen,
    # wenn sie gesagt wird.
    versatz = [0.15 + i for i in range(len(aufnahmen))]

    eingaben = []
    for datei in aufnahmen:
        eingaben += ["-i", str(datei)]

    kette = ";".join(
        f"[{i}]adelay={int(ms * 1000)}:all=1,aresample=48000[z{i}]"
        for i, ms in enumerate(versatz)
    )
    kette += ";" + "".join(f"[z{i}]" for i in range(len(aufnahmen)))
    kette += f"amix=inputs={len(aufnahmen)}:normalize=0,apad[aus]"

    subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", *eingaben,
         "-filter_complex", kette, "-map", "[aus]",
         "-t", f"{budget:.3f}", "-ac", "2", "-ar", "48000", str(ziel)],
        check=True,
    )
    print(f"[{nr:02d}] countdown – vier Zahlen auf ihre Sekunde gesetzt")


def schluesselFinden(kit: str | None) -> tuple[str, str]:
    """
    Sucht den Schlüssel an drei Stellen, in dieser Reihenfolge:
    Umgebung, Schlüsseldatei im Benutzerordner, config.py des Video-Kits.

    Die Datei ist der bequemste Weg: einmal hinterlegen, danach nie wieder
    daran denken. Sie gehört niemandem außer dem eigenen Konto – deshalb wird
    beim Lesen geprüft, ob sie für andere zugänglich ist, und gemeckert, statt
    es stillschweigend hinzunehmen.
    """
    if (aus_umgebung := os.environ.get("ELEVENLABS_API_KEY", "").strip()):
        return aus_umgebung, "aus der Umgebung"

    datei = Path.home() / ".elevenlabs_key"
    if datei.is_file():
        if datei.stat().st_mode & 0o077:
            print(f"Hinweis: {datei} ist auch für andere lesbar. "
                  f"Besser: chmod 600 {datei}")
        if (aus_datei := datei.read_text(encoding="utf-8").strip()):
            return aus_datei, f"aus {datei}"

    if kit:
        # Der Schlüssel gehört EXECUTEX und hat in diesem Repository nichts zu
        # suchen. Er wird gelesen, nie geschrieben.
        sys.path.insert(0, str(Path(kit).expanduser().resolve()))
        try:
            import config as kit_config
        except ImportError:
            sys.exit(f"Im Ordner {kit} liegt keine config.py.")
        if (aus_kit := str(getattr(kit_config, "ELEVENLABS_API_KEY", "")).strip()):
            return aus_kit, "aus dem Video-Kit"

    return "", ""


def main() -> None:
    args = argparse.ArgumentParser(description="Erklaerfilm vertonen")
    args.add_argument("--mundart", choices=["schwaebisch", "platt"], required=True)
    args.add_argument("--stimme", required=True,
                      help="M (Bill), W (Corinna) oder eine ElevenLabs Voice-ID")
    args.add_argument("--kit", default=None,
                      help="Ordner des EXECUTEX-Video-Kits – von dort wird der "
                           "Schlüssel gelesen, wenn ELEVENLABS_API_KEY leer ist")
    args.add_argument("--modell", default="eleven_multilingual_v2")
    args.add_argument("--film", default=str(HIER / "erklaerfilm.mp4"))
    args.add_argument("--texte", default=str(HIER / "sprecher.json"))
    args.add_argument("--behalten", action="store_true", help="Einzelspuren nicht loeschen")
    opt = args.parse_args()

    schluessel, woher = schluesselFinden(opt.kit)
    if not schluessel:
        sys.exit(
            "Kein ElevenLabs-Schlüssel gefunden. Einmal hinterlegen:\n"
            "    umask 077; printf '%s' 'sk_…' > ~/.elevenlabs_key\n"
            "oder in die Umgebung setzen (ELEVENLABS_API_KEY), "
            "oder mit --kit auf den Ordner des Video-Kits zeigen."
        )
    schluesselPruefen(schluessel, woher)
    print(f"Schlüssel: {woher}")

    stimme, wer = STIMMEN.get(opt.stimme, (opt.stimme, "eigene Voice-ID"))
    print(f"Stimme: {wer}")

    ffmpeg = werkzeug()
    film = Path(opt.film)
    if not film.is_file():
        sys.exit(f"Film nicht gefunden: {film}")

    plan = json.loads(Path(opt.texte).read_text(encoding="utf-8"))
    arbeit = HIER / f"ton-{opt.mundart}"
    arbeit.mkdir(exist_ok=True)

    teile: list[Path] = []
    zulang: list[tuple[int, str, float, float, float]] = []
    for abschnitt in plan["abschnitte"]:
        nr = abschnitt["nr"]
        budget = float(abschnitt["dauer_s"])
        roh = arbeit / f"{nr:02d}.mp3"
        stueck = arbeit / f"{nr:02d}.wav"

        # Der Countdown geht einen eigenen Weg: die vier Zahlen werden
        # einzeln gesprochen und auf die Sekunde gesetzt, an der das Bild
        # sie zeigt. Am Stück gesprochen wäre die Stimme nach knapp drei
        # Sekunden fertig, während im Bild noch die Zwei steht.
        if abschnitt["id"] == "countdown":
            zahlenBauen(ffmpeg, plan, opt.mundart, stimme, opt.modell,
                        schluessel, arbeit, nr, budget, stueck)
            teile.append(stueck)
            continue

        if not roh.is_file():
            print(f"[{nr:02d}/{len(plan['abschnitte'])}] {abschnitt['id']} – spreche …")
            sprechen(abschnitt[opt.mundart], stimme, opt.modell, schluessel, roh)
        else:
            print(f"[{nr:02d}] {abschnitt['id']} – vorhanden, wird wiederverwendet")

        gesprochen = laenge(ffmpeg, roh)
        platz = budget - VORLAUF_S - 0.15
        tempo = max(1.0, gesprochen / platz) if platz > 0 else 1.0
        if tempo > MAX_STRAFFUNG:
            # Über die Straffung hinaus wird hinten abgeschnitten – der Satz
            # bricht mitten im Wort ab. Das darf nicht in der Ausgabe
            # untergehen, deshalb wird es am Ende noch einmal aufgezählt.
            fehlt = gesprochen / MAX_STRAFFUNG - platz
            print(f"    ! {gesprochen:.1f}s in {budget:.0f}s – Text ist zu lang "
                  f"(Faktor {tempo:.2f}). Es fehlen hinten rund {fehlt:.1f}s.")
            zulang.append((nr, abschnitt["id"], gesprochen, budget, fehlt))
            tempo = MAX_STRAFFUNG

        filter_kette = (
            (f"atempo={tempo:.4f}," if tempo > 1.001 else "")
            + f"adelay={int(VORLAUF_S * 1000)}:all=1,"
            + "apad,aresample=48000"
        )
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", str(roh),
             "-af", filter_kette, "-t", f"{budget:.3f}",
             "-ac", "2", "-ar", "48000", str(stueck)],
            check=True,
        )
        teile.append(stueck)

    liste = arbeit / "reihenfolge.txt"
    liste.write_text("".join(f"file '{p.name}'\n" for p in teile), encoding="utf-8")
    spur = arbeit / "spur.wav"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-f", "concat",
                    "-safe", "0", "-i", str(liste), "-c", "copy", str(spur)], check=True)

    gesamt = laenge(ffmpeg, spur)
    print(f"Tonspur: {gesamt:.1f}s (Film: {plan['gesamt_s']}s)")

    ziel = HIER / f"erklaerfilm-{opt.mundart}.mp4"
    subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", "-i", str(film), "-i", str(spur),
         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
         "-c:a", "aac", "-b:a", "192k", "-shortest", str(ziel)],
        check=True,
    )
    if not opt.behalten:
        for p in teile:
            p.unlink(missing_ok=True)
        liste.unlink(missing_ok=True)
        spur.unlink(missing_ok=True)
    print(f"Fertig: {ziel}")

    # Zum Schluss noch einmal deutlich: was hier steht, ist im Film
    # abgeschnitten. In einer Ausgabe von fünfzehn Zeilen geht eine Warnung
    # in der Mitte sonst unter – und man merkt es erst beim Anschauen.
    if zulang:
        print("\nAchtung – diese Abschnitte sind hinten abgeschnitten:")
        for nr, name, gesprochen, budget, fehlt in zulang:
            print(f"  {nr:02d} {name}: {gesprochen:.1f}s gesprochen, {budget:.0f}s Platz, "
                  f"rund {fehlt:.1f}s fehlen")
        print("  Text in sprecher.json kürzen, die betroffene Datei in "
              f"ton-{opt.mundart}/ löschen und noch einmal laufen lassen.")


if __name__ == "__main__":
    main()
