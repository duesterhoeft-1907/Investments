#!/usr/bin/env python3
"""
Schneidet die Rohaufnahme an der weissen Klappe und kodiert sie nach mp4.

Der aufnehmende Browser schreibt vorn und hinten ein paar Sekunden mehr, als der
Film dauert. Damit Ton und Bild spaeter zusammenpassen, blendet film.html zu
Beginn 400 ms weiss ein; hier wird das letzte weisse Bild gesucht und genau dort
geschnitten. Danach steht die Laenge auf die Sekunde.
"""
import glob
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

HIER = Path(__file__).resolve().parent


def ffmpeg() -> str:
    if (pfad := shutil.which('ffmpeg')):
        return pfad
    try:                                   # Faellt in der Bauumgebung hierauf zurueck
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit('ffmpeg fehlt. Auf dem Mac: brew install ffmpeg')


def main() -> None:
    ff = ffmpeg()
    roh = sorted(glob.glob(str(HIER / 'roh' / '*.webm')))
    if not roh:
        sys.exit('Keine Aufnahme in video/roh – erst node video/aufnehmen.mjs laufen lassen.')
    roh = Path(roh[-1])

    dauer = float(json.loads((HIER / 'sprecher.json').read_text(encoding='utf-8'))['gesamt_s'])

    # Mittlere Helligkeit je Bild der ersten 20 Sekunden. Die Klappe ist weiss,
    # alles andere im Film ist dunkel – eine Verwechslung ist ausgeschlossen.
    aus = subprocess.run(
        [ff, '-v', 'error', '-t', '20', '-i', str(roh),
         '-vf', 'scale=64:36,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
         '-f', 'null', '-'],
        capture_output=True, text=True, check=True).stdout

    zeit, hell = None, []
    for zeile in aus.splitlines():
        zeile = zeile.strip()
        if zeile.startswith('frame:'):
            zeit = float(zeile.split('pts_time:')[1])
        elif (treffer := re.search(r'YAVG=([\d.]+)', zeile)) and zeit is not None:
            hell.append((zeit, float(treffer.group(1))))

    weiss = [t for t, y in hell if y > 200]
    if not weiss:
        sys.exit('Klappe nicht gefunden. Gemessene Helligkeiten: '
                 + ', '.join(f'{t:.1f}s={y:.0f}' for t, y in hell[:15]))
    schnitt = max(weiss) + 0.04            # ein Bild nach der letzten weissen Aufnahme
    print(f'Klappe {min(weiss):.2f}–{max(weiss):.2f}s, Schnitt bei {schnitt:.2f}s')

    ziel = HIER / 'erklaerfilm.mp4'
    subprocess.run(
        [ff, '-y', '-v', 'error', '-ss', f'{schnitt:.3f}', '-i', str(roh),
         '-t', f'{dauer:.3f}', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
         '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart', '-an', str(ziel)],
        check=True)

    pruef = subprocess.run([ff, '-hide_banner', '-i', str(ziel)],
                           capture_output=True, text=True)
    for zeile in pruef.stderr.splitlines():
        if 'Duration' in zeile or 'Stream #0:0' in zeile:
            print(zeile.strip())
    print(f'Fertig: {ziel} ({ziel.stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
