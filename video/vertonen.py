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
        hinweis = ''
        if fehler.code == 401:
            hinweis = '\n    Das heißt: der Schlüssel wird nicht anerkannt. Der richtige steht in der config.py des Video-Kits.'
        sys.exit(f"ElevenLabs antwortet mit {fehler.code}: "
                 f"{fehler.read().decode('utf-8', 'replace')[:400]}{hinweis}")
    except urllib.error.URLError as fehler:
        sys.exit(f"api.elevenlabs.io ist nicht erreichbar: {fehler.reason}")


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
    for abschnitt in plan["abschnitte"]:
        nr = abschnitt["nr"]
        budget = float(abschnitt["dauer_s"])
        roh = arbeit / f"{nr:02d}.mp3"
        stueck = arbeit / f"{nr:02d}.wav"

        if not roh.is_file():
            print(f"[{nr:02d}/{len(plan['abschnitte'])}] {abschnitt['id']} – spreche …")
            sprechen(abschnitt[opt.mundart], stimme, opt.modell, schluessel, roh)
        else:
            print(f"[{nr:02d}] {abschnitt['id']} – vorhanden, wird wiederverwendet")

        gesprochen = laenge(ffmpeg, roh)
        platz = budget - VORLAUF_S - 0.15
        tempo = max(1.0, gesprochen / platz) if platz > 0 else 1.0
        if tempo > MAX_STRAFFUNG:
            print(f"    ! {gesprochen:.1f}s in {budget:.0f}s – Text ist zu lang "
                  f"(Faktor {tempo:.2f}). Gekuerzt klingt es besser als gestrafft.")
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


if __name__ == "__main__":
    main()
