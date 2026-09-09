# Erklärfilm

Ein Film von 3:42, der die Strecke vom ausgefüllten Formular bis zum Anruf zeigt:
zuerst der Überblick, dann sechs Bereiche im Detail, jeder mit einem Countdown 4-3-2-1
davor.

| Datei | Was |
| --- | --- |
| `film.html` | Der Film selbst. Eine Seite, 1920 × 1080, die sich nach Zeitplan selbst abspielt. |
| `sprecher.json` | Die Sprechertexte je Abschnitt, mit Stimme, Sekundenbudget und dem gemessenen Sprechtempo. |
| `schriften.py` | Bettet die Schriften ein und schreibt `film-lokal.html` – die Fassung, die aufgenommen wird. |
| `aufnehmen.mjs` | Nimmt den Film mit einem Browser in Echtzeit auf. |
| `schneiden.py` | Schneidet die Aufnahme an der Klappe und kodiert nach mp4. |
| `vorspann.py` | Setzt den executex-Vorspann (6 s) vor den Film. |
| `vertonen.py` | Spricht die Texte bei ElevenLabs, passt sie in ihr Budget und legt sie auf den Film. |
| `erklaerfilm.mp4` | Das aufgenommene Bild ohne Ton. Nicht im Git – entsteht beim Aufnehmen. |

## Neu aufnehmen

```bash
python3 video/schriften.py     # Schriften einbetten
node    video/aufnehmen.mjs    # 3:42 in Echtzeit
python3 video/schneiden.py     # zuschneiden und kodieren
```

Gebraucht werden Playwright mit Chromium und ffmpeg.

## Vorspann

Der executex-Vorspann stammt aus einem anderen Projekt und liegt nicht im Git –
er ist Markenmaterial, kein Quelltext. Leg ihn als `video/intro.mp4` ab, oder
gib die Datei an, aus der die ersten Sekunden geschnitten werden:

```bash
python3 video/vorspann.py                                  # video/intro.mp4
python3 video/vorspann.py --intro ~/Vertriebspartner_v3.mp4 --sekunden 6
```

Beide Teile werden auf 1920 × 1080, 25 Bilder und 48 kHz Stereo gebracht; der
Ton des Vorspanns bleibt, für den Film kommt Stille dazu, solange er keine
Tonspur hat. Ergebnis: `erklaerfilm-mit-vorspann.mp4`.

Reihenfolge, wenn beides zusammenkommt: **erst vertonen, dann den Vorspann
davorsetzen** – sonst müsste die Sprecherspur um die sechs Sekunden versetzt
werden, und jede Änderung am Vorspann verschöbe sie erneut.

## Ton drauflegen

`api.elevenlabs.io` ist aus der Bauumgebung nicht erreichbar, und welche Stimmen die
richtigen sind, weiß nur ihr. Deshalb läuft dieser Schritt auf eurem Rechner:

Der Schlüssel wird einmal hinterlegt, danach findet ihn das Skript selbst:

```bash
umask 077; printf '%s' 'sk_…' > ~/.elevenlabs_key
```

Gesucht wird in dieser Reihenfolge: Umgebung (`ELEVENLABS_API_KEY`),
`~/.elevenlabs_key`, und `--kit <Ordner des Video-Kits>`.

```bash
python3 video/vertonen.py
python3 video/vorspann.py --film video/erklaerfilm-vertont.mp4
```

Das gehört auf den eigenen Rechner, nicht auf den Webserver: dort gibt es
kein ffmpeg, und zu tun hat er damit auch nichts.

## Zwei Stimmen im Wechsel

Bill und Corinna teilen sich den Film – wer welchen Abschnitt spricht, steht
als `stimme` an jedem Abschnitt in `sprecher.json`. Den Countdown spricht
immer die Stimme, die den nächsten Bereich übernimmt: so kündigt der Wechsel
sich an, statt ihn zu überfallen.

Ein Versuch mit Schwäbisch und Platt ist verworfen worden. ElevenLabs macht
aus geschriebenem Niederdeutsch etwas, das nach Niederländisch klingt, und
aus Schwäbisch etwas, das nirgends gesprochen wird. Zwei ordentliche Stimmen
auf Hochdeutsch tragen den Film besser als ein Dialekt, der danebengreift.

Andere Stimmen gehen mit `--stimme-m` und `--stimme-w` und einer Voice-ID.

## Wie lang ein Text sein muss

Jeder Abschnitt hat ein festes Sekundenbudget, und der Text muss es **füllen**.
Die Länge ergibt sich aus dem gemessenen Sprechtempo:

    Zeichen = (Budget − 1,2 s Atem) × Tempo

Das Tempo steht in `sprecher.json` unter `tempo` und ist an der fertigen
Vertonung gemessen, nicht geschätzt: Bill spricht 13,2 Zeichen je Sekunde,
Corinna 15,8. Für einen Abschnitt von 26 Sekunden sind das also rund
330 Zeichen bei Bill und 390 bei Corinna – deutlich mehr, als ein Absatz
auf den ersten Blick vermuten lässt.

Das Skript meldet beide Richtungen:

* **zu lang** – es strafft bis Faktor 1,25, darüber schneidet es hinten ab
  und zählt die betroffenen Abschnitte am Ende noch einmal auf.
* **zu kurz** – füllt der Text weniger als 85 % des Budgets, steht Stille im
  Bild. Auch das wird am Ende aufgezählt, mit den Sekunden ohne Ton.

Die zweite Warnung gibt es, seit die erste Vertonung 118 von 222 Sekunden
schweigend im Bild stand: zu langer Text fällt beim Anschauen sofort auf,
zu kurzer nicht.

## Film ändern

Der Ablauf steht am Ende von `film.html` in `ABLAUF` – Szene und Dauer in Sekunden.
Wer dort Sekunden ändert, ändert sie in `sprecher.json` mit; die Startzeiten dort
sind die Summe der vorherigen Dauern.

Aufgenommen wird mit einem Browser in Echtzeit; die weiße Blende zu Beginn
(400 ms) ist nur die Klappe für den Zuschnitt und im fertigen Film nicht zu sehen.
