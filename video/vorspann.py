#!/usr/bin/env python3
"""
Setzt den executex-Vorspann vor den Film.

Der Vorspann liegt nicht im Git – er ist Markenmaterial, kein Quelltext.
Erwartet wird er unter video/intro.mp4:

    python3 video/vorspann.py
    python3 video/vorspann.py --intro ~/Vorspann_executex.mp4 --sekunden 6
    python3 video/vorspann.py --film video/erklaerfilm-schwaebisch.mp4

Warum in zwei Schritten und nicht in einem ffmpeg-Aufruf: der concat-Filter
zieht beide Eingänge gleichzeitig auf und puffert dabei den ganzen zweiten
Film im Speicher, während der erste noch läuft. Bei 222 Sekunden in 1080p
bleibt er dabei stehen. Also erst den Vorspann für sich schneiden, dann beide
Teile nur noch aneinanderhängen – das kostet Sekunden statt Minuten und
rechnet das Bild kein zweites Mal.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HIER = Path(__file__).resolve().parent


def ffmpeg() -> str:
    if (pfad := shutil.which('ffmpeg')):
        return pfad
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit('ffmpeg fehlt. Auf dem Mac: brew install ffmpeg')


def beschreibung(ff: str, datei: Path) -> str:
    return subprocess.run([ff, '-hide_banner', '-i', str(datei)],
                          capture_output=True, text=True).stderr


def laenge(ff: str, datei: Path) -> float:
    treffer = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', beschreibung(ff, datei))
    if treffer is None:
        sys.exit(f'Länge von {datei} nicht lesbar.')
    h, m, s = treffer.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def hat_ton(ff: str, datei: Path) -> bool:
    return 'Audio:' in beschreibung(ff, datei)


BILD = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-r', '25', '-video_track_timescale', '12800']
TON = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']


def main() -> None:
    opt = argparse.ArgumentParser(description='Vorspann vor den Film setzen')
    opt.add_argument('--intro', default=str(HIER / 'intro.mp4'))
    opt.add_argument('--film', default=str(HIER / 'erklaerfilm.mp4'))
    opt.add_argument('--sekunden', type=float, default=6.0,
                     help='Wie viel vom Anfang des Vorspanns genommen wird (0 = alles)')
    opt.add_argument('--out', default=None)
    args = opt.parse_args()

    ff = ffmpeg()
    intro, film = Path(args.intro), Path(args.film)
    for datei in (intro, film):
        if not datei.is_file():
            sys.exit(f'Nicht gefunden: {datei}')

    ziel = Path(args.out) if args.out else film.with_name(film.stem + '-mit-vorspann.mp4')
    dauerFilm = laenge(ff, film)
    dauerIntro = args.sekunden if args.sekunden > 0 else laenge(ff, intro)

    with tempfile.TemporaryDirectory() as tmp:
        teilIntro = Path(tmp) / 'intro.mp4'
        teilFilm = Path(tmp) / 'film.mp4'

        # 1. Vorspann zuschneiden und auf das Format des Films bringen.
        befehl = [ff, '-y', '-v', 'error', '-i', str(intro)]
        if args.sekunden > 0:
            befehl += ['-t', f'{args.sekunden:.3f}']
        befehl += ['-vf', 'scale=1920:1080:flags=lanczos,setsar=1', *BILD]
        if hat_ton(ff, intro):
            befehl += TON
        else:
            befehl += ['-f', 'lavfi', '-t', f'{dauerIntro:.3f}',
                       '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', *TON]
        subprocess.run(befehl + [str(teilIntro)], check=True)

        # 2. Den Film nur umpacken – das Bild bleibt, wie es ist. Fehlt der
        #    Ton, kommt Stille dazu: eine Datei, die nach dem Vorspann keine
        #    Tonspur mehr hat, beenden manche Abspieler einfach.
        if hat_ton(ff, film):
            subprocess.run([ff, '-y', '-v', 'error', '-i', str(film),
                            '-c', 'copy', str(teilFilm)], check=True)
        else:
            subprocess.run([ff, '-y', '-v', 'error', '-i', str(film),
                            '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
                            '-c:v', 'copy', *TON, '-shortest', str(teilFilm)], check=True)

        # 3. Aneinanderhängen, ohne noch einmal zu rechnen.
        liste = Path(tmp) / 'reihe.txt'
        liste.write_text(f"file '{teilIntro}'\nfile '{teilFilm}'\n", encoding='utf-8')
        subprocess.run([ff, '-y', '-v', 'error', '-f', 'concat', '-safe', '0',
                        '-i', str(liste), '-c', 'copy',
                        '-movflags', '+faststart', str(ziel)], check=True)

    print(f'{dauerIntro:.0f} s Vorspann + {dauerFilm:.1f} s Film '
          f'= {dauerIntro + dauerFilm:.1f} s')
    for zeile in beschreibung(ff, ziel).splitlines():
        if 'Duration' in zeile or 'Stream #0:' in zeile:
            print('  ' + zeile.strip())
    print(f'Fertig: {ziel} ({ziel.stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
