#!/usr/bin/env python3
"""
Setzt den executex-Vorspann vor den Film.

Der Vorspann kommt aus einem anderen Projekt und liegt nicht im Git (er ist
Markenmaterial, kein Quelltext). Erwartet wird er unter video/intro.mp4 –
oder als beliebiges Video, aus dem die ersten Sekunden geschnitten werden:

    python3 video/vorspann.py                          # video/intro.mp4 + erklaerfilm.mp4
    python3 video/vorspann.py --intro ~/Vertriebspartner_v3.mp4 --sekunden 6
    python3 video/vorspann.py --film video/erklaerfilm-schwaebisch.mp4

Der Ton des Vorspanns bleibt erhalten. Hat der Film selbst keinen Ton, wird
für seine Länge Stille eingesetzt – sonst hätte die Datei nach sechs
Sekunden gar keine Tonspur mehr, und manche Abspieler beenden sie dann.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
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
        sys.exit(f'Laenge von {datei} nicht lesbar.')
    h, m, s = treffer.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def hat_ton(ff: str, datei: Path) -> bool:
    return 'Audio:' in beschreibung(ff, datei)


def main() -> None:
    opt = argparse.ArgumentParser(description='Vorspann vor den Film setzen')
    opt.add_argument('--intro', default=str(HIER / 'intro.mp4'))
    opt.add_argument('--film', default=str(HIER / 'erklaerfilm.mp4'))
    opt.add_argument('--sekunden', type=float, default=6.0,
                     help='Wie viel vom Anfang des Vorspanns genommen wird')
    opt.add_argument('--out', default=None)
    args = opt.parse_args()

    ff = ffmpeg()
    intro, film = Path(args.intro), Path(args.film)
    for datei in (intro, film):
        if not datei.is_file():
            sys.exit(f'Nicht gefunden: {datei}')

    ziel = Path(args.out) if args.out else film.with_name(film.stem + '-mit-vorspann.mp4')
    dauer = laenge(ff, film)

    # Beide Teile auf dasselbe Format bringen: 1920x1080, 25 Bilder, Ton in
    # 48 kHz Stereo. Ohne das lehnt der concat-Filter die Verbindung ab.
    kette = [
        f'[0:v]trim=0:{args.sekunden},setpts=PTS-STARTPTS,'
        'scale=1920:1080:flags=lanczos,setsar=1,fps=25,format=yuv420p[v0]',
        '[1:v]scale=1920:1080:flags=lanczos,setsar=1,fps=25,format=yuv420p[v1]',
    ]
    eingaben = ['-i', str(intro), '-i', str(film)]

    if hat_ton(ff, intro):
        kette.append(f'[0:a]atrim=0:{args.sekunden},asetpts=PTS-STARTPTS,'
                     'aresample=48000,aformat=channel_layouts=stereo[a0]')
    else:
        eingaben += ['-f', 'lavfi', '-t', str(args.sekunden),
                     '-i', 'anullsrc=r=48000:cl=stereo']
        kette.append(f'[{eingaben.count("-i") - 1}:a]anull[a0]')

    if hat_ton(ff, film):
        kette.append('[1:a]aresample=48000,aformat=channel_layouts=stereo[a1]')
    else:
        eingaben += ['-f', 'lavfi', '-t', f'{dauer:.3f}',
                     '-i', 'anullsrc=r=48000:cl=stereo']
        kette.append(f'[{eingaben.count("-i") - 1}:a]anull[a1]')

    kette.append('[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]')

    subprocess.run(
        [ff, '-y', '-v', 'error', *eingaben,
         '-filter_complex', ';'.join(kette), '-map', '[v]', '-map', '[a]',
         '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(ziel)],
        check=True)

    print(f'{args.sekunden:.0f} s Vorspann + {dauer:.1f} s Film '
          f'= {args.sekunden + dauer:.1f} s')
    for zeile in beschreibung(ff, ziel).splitlines():
        if 'Duration' in zeile or 'Stream #0:' in zeile:
            print('  ' + zeile.strip())
    print(f'Fertig: {ziel} ({ziel.stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
