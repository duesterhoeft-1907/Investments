#!/usr/bin/env python3
"""
Baut aus film.html die Fassung film-lokal.html, in der die Schriften als
data-URI drinstecken.

Warum: der aufnehmende Browser kommt in der Bauumgebung nicht an
fonts.googleapis.com heran, und ohne die Schriften laeuft der ganze Film in
Arial. Fuer die Aufnahme wird deshalb immer erst dieses Skript aufgerufen.
"""
import base64
import pathlib
import re
import subprocess
import sys

HIER = pathlib.Path(__file__).resolve().parent
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'

# Variable Schnitte, wo es sie gibt – ein Aufruf je Familie.
FAMILIEN = [
    ('Bricolage Grotesque', 'family=Bricolage+Grotesque:opsz,wght@12..96,400..800'),
    ('Source Serif 4',      'family=Source+Serif+4:opsz,wght@8..60,400..600'),
    ('IBM Plex Mono',       'family=IBM+Plex+Mono:wght@400;500'),
]
LATIN = 'U+0000-00FF'   # Kennzeichen des Latin-Basissatzes in der Antwort


def hole(url: str) -> bytes:
    aus = subprocess.run(['curl', '-sS', '--max-time', '60', '-A', UA, url],
                         capture_output=True, check=True)
    if not aus.stdout:
        sys.exit('Leere Antwort von ' + url)
    return aus.stdout


def main() -> None:
    teile = []
    for name, anfrage in FAMILIEN:
        css = hole(f'https://fonts.googleapis.com/css2?{anfrage}&display=block').decode()
        for block in css.split('@font-face')[1:]:
            if LATIN not in block:
                continue
            url = re.search(r'url\((https://[^)]+\.woff2)\)', block).group(1)
            gewicht = re.search(r'font-weight:\s*([^;]+);', block).group(1).strip()
            roh = hole(url)
            teile.append(
                f"@font-face{{font-family:'{name}';font-style:normal;"
                f"font-weight:{gewicht};font-display:block;"
                f"src:url(data:font/woff2;base64,{base64.b64encode(roh).decode()}) format('woff2');}}"
            )
            print(f'{name} {gewicht}: {len(roh) / 1024:.0f} kB')

    film = (HIER / 'film.html').read_text(encoding='utf-8')
    stil = '<style>\n' + '\n'.join(teile) + '\n</style>'
    lokal = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>',
                   stil, film, count=1)
    if 'fonts.googleapis.com' in lokal:
        sys.exit('Der Verweis auf Google Fonts wurde nicht ersetzt.')
    (HIER / 'film-lokal.html').write_text(lokal, encoding='utf-8')
    print('film-lokal.html:', round(len(lokal) / 1024, 1), 'kB')


if __name__ == '__main__':
    main()
