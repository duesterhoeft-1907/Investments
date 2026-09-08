#!/usr/bin/env python3
"""
Vertont den Erklaerfilm mit ElevenLabs.

Warum ausserhalb der Anwendung: api.elevenlabs.io ist aus der Bauumgebung
nicht erreichbar, und welche Stimmen die Lieblingsstimmen sind, weiss nur ihr.
Das Skript braucht nur Python 3 (Bordmittel) und ffmpeg/ffprobe.

    export ELEVENLABS_API_KEY=...
    python3 video/vertonen.py --mundart schwaebisch --stimme <voice_id>
    python3 video/vertonen.py --mundart platt       --stimme <voice_id>

Ergebnis: video/erklaerfilm-<mundart>.mp4

Ablauf je Abschnitt: Text sprechen lassen, Laenge messen, notfalls minimal
straffen, an die Startsekunde des Abschnitts setzen, mit Stille auffuellen.
So bleibt Ton und Bild bis zum Schluss synchron, auch wenn eine Stimme
schneller oder langsamer spricht als die naechste.
"""

from __future__ import annotations

import argparse
import json
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


def werkzeug(name: str) -> str:
    pfad = shutil.which(name)
    if pfad is None:
        sys.exit(f"{name} fehlt. Auf dem Mac: brew install ffmpeg")
    return pfad


def laenge(ffprobe: str, datei: Path) -> float:
    aus = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(datei)],
        capture_output=True, text=True, check=True,
    )
    return float(aus.stdout.strip())


def sprechen(text: str, stimme: str, modell: str, schluessel: str, ziel: Path) -> None:
    anfrage = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{stimme}",
        data=json.dumps({
            "text": text,
            "model_id": modell,
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.25},
        }).encode("utf-8"),
        headers={"xi-api-key": schluessel, "Content-Type": "application/json",
                 "Accept": "audio/mpeg"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(anfrage, timeout=180) as antwort:
            ziel.write_bytes(antwort.read())
    except urllib.error.HTTPError as fehler:
        sys.exit(f"ElevenLabs antwortet mit {fehler.code}: {fehler.read().decode('utf-8', 'replace')[:400]}")


def main() -> None:
    args = argparse.ArgumentParser(description="Erklaerfilm vertonen")
    args.add_argument("--mundart", choices=["schwaebisch", "platt"], required=True)
    args.add_argument("--stimme", required=True, help="Voice-ID aus der ElevenLabs-Bibliothek")
    args.add_argument("--modell", default="eleven_multilingual_v2")
    args.add_argument("--film", default=str(HIER / "erklaerfilm.mp4"))
    args.add_argument("--texte", default=str(HIER / "sprecher.json"))
    args.add_argument("--behalten", action="store_true", help="Einzelspuren nicht loeschen")
    opt = args.parse_args()

    schluessel = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not schluessel:
        sys.exit("ELEVENLABS_API_KEY ist nicht gesetzt.")

    ffmpeg, ffprobe = werkzeug("ffmpeg"), werkzeug("ffprobe")
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
            sprechen(abschnitt[opt.mundart], opt.stimme, opt.modell, schluessel, roh)
        else:
            print(f"[{nr:02d}] {abschnitt['id']} – vorhanden, wird wiederverwendet")

        gesprochen = laenge(ffprobe, roh)
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

    gesamt = laenge(ffprobe, spur)
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
