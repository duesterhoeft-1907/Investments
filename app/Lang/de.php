<?php
/**
 * Deutsche Texte der öffentlichen Strecke.
 *
 * Grundsprache: was hier steht, ist die Vorlage. Fehlt in en.php ein
 * Schlüssel, greift I18n auf diesen Text zurück – dann steht dort ein
 * deutscher Satz, aber nie eine leere Zeile.
 */
declare(strict_types=1);

return [
    'name'      => 'Deutsch',
    'switch'    => ['label' => 'English', 'title' => 'Switch to English', 'short' => 'EN'],

    'nav' => [
        'home'     => 'Start',
        'problem'  => 'Das Problem',
        'solution' => 'Die Lösung',
        'contact'  => 'Kontaktiere uns',
        'imprint'  => 'Impressum',
        'portal'   => 'Kundenbereich',
        'staff'    => 'Mitarbeiter-Login',
        'back'     => 'Zurück zur Startseite',
    ],

    'validator' => [
        'required' => 'Bitte %s angeben.',
        'choose'   => 'Bitte %s wählen.',
        'invalid'  => 'Ungültige Auswahl für %s.',
        'short'    => 'Zu kurz – bitte %s mit mindestens %s Zeichen angeben.',
        'long'     => 'Zu lang – bitte %s mit höchstens %s Zeichen angeben.',
        'email'    => 'Bitte eine gültige E-Mail-Adresse angeben.',
        'value'    => 'Bitte einen Wert angeben.',
        'range'    => 'Wert muss zwischen %s und %s liegen.',
        'date'     => 'Bitte %s als gültiges Datum angeben.',
        'fields'   => [
            'firstName'     => 'deinen Vornamen',
            'lastName'      => 'deinen Nachnamen',
            'email'         => 'eine gültige E-Mail-Adresse',
            'phone'         => 'deine Telefonnummer',
            'company'       => 'deine Firma',
            'city'          => 'deinen Ort',
            'postalCode'    => 'deine Postleitzahl',
            'country'       => 'dein Land',
            'assetClass'    => 'ein Fachgebiet',
            'volumeBand'    => 'ein Anlagevolumen',
            'horizon'       => 'einen Anlagehorizont',
            'experience'    => 'deine Erfahrung',
            'contactPref'   => 'einen Kontaktweg',
            'contactWindow' => 'eine Uhrzeit',
            'goal'          => 'dein Ziel',
            'message'       => 'deine Nachricht',
        ],
    ],

    /*
     * Notfalltexte, wenn das Skript der Anfrage-Strecke nicht lädt. Sie
     * stehen im HTML, nicht im JS-Wörterbuch – genau dann, wenn sie
     * gebraucht werden, ist von dort nichts angekommen.
     */
    'wizard' => [
        'notfall'      => 'Das Anfrage-Formular konnte nicht geladen werden.',
        'notfallHilfe' => 'Bitte die Seite einmal neu laden (Strg+F5 bzw. Cmd+Shift+R). Bleibt es dabei, ruf uns gern direkt an – wir nehmen die Anfrage am Telefon auf.',
        'notfallGrund' => 'Technischer Hinweis:',
        'ohneJs'       => 'Für das Anfrage-Formular wird JavaScript gebraucht. Ohne geht es telefonisch genauso schnell:',
    ],

    'intake' => [
        'consent'   => 'Ohne Einwilligung dürfen wir dich nicht kontaktieren.',
        'phone'     => 'Für den Rückruf brauchen wir eine Telefonnummer.',
        'ratelimit' => 'Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut oder ruf uns direkt an.',
    ],

    'mail' => [
        'welcome' => [
            'subject'  => 'Deine Anfrage %s ist angekommen – wir melden uns umgehend',
            'heading'  => 'Deine Anfrage ist angekommen, %s',
            'intro'    => 'vielen Dank für dein Interesse an <strong>%s</strong>. Deine Anfrage liegt bereits '
                . 'bei unserem Fachteam – wir melden uns <strong>%s</strong> persönlich bei dir.',
            'portal'   => 'In deinem persönlichen Kundenbereich siehst du jederzeit den Stand deiner Anfrage, '
                . 'die nächsten Schritte und – sobald erstellt – dein individuelles Angebot.',
            'login'    => 'Zugang',
            'password' => 'Passwort',
            'ref'      => 'Referenz',
            'known'    => 'Deinen Zugang kennst du schon: das Passwort aus deiner ersten Bestätigung gilt weiter.',
            'button'   => 'Zum persönlichen Bereich',
            'change'   => 'Bitte ändere das Passwort nach der ersten Anmeldung.',
            'text'     => "Vielen Dank für deine Anfrage (%s).\nWir melden uns %s.",
            'contact'  => 'Dein Ansprechpartner: %s',
        ],
    ],

    'hours' => [
        'within'   => 'innerhalb von %s Minuten',
        'today'    => 'heute ab %s',
        'tomorrow' => 'morgen früh ab %s',
        'weekday'  => 'am %s ab %s',
        'time'     => '%s Uhr',
        'format'   => 'H:i',
        'weekdays' => ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
        'windows'  => [
            'vormittags'  => 'Vormittags (%s – %s Uhr)',
            'nachmittags' => 'Nachmittags (%s – %s Uhr)',
            'abends'      => 'Abends (%s – %s Uhr)',
            'flexibel'    => 'Jederzeit',
            'whenever'    => 'Sobald wir erreichbar sind',
        ],
    ],

    'leads' => [
        'volume' => [
            'under-25k' => 'bis 25.000 €',
            '25k-50k'   => '25.000 – 50.000 €',
            '50k-100k'  => '50.000 – 100.000 €',
            '100k-250k' => '100.000 – 250.000 €',
            '250k-500k' => '250.000 – 500.000 €',
            'over-500k' => 'über 500.000 €',
        ],
        'horizon' => [
            'short'        => 'kurzfristig (bis 2 Jahre)',
            'medium'       => 'mittelfristig (2 – 5 Jahre)',
            'long'         => 'langfristig (5 – 10 Jahre)',
            'generational' => 'Generationen (10+ Jahre)',
        ],
        'experience' => [
            'none'         => 'keine Vorerfahrung',
            'some'         => 'erste Erfahrungen',
            'experienced'  => 'erfahren',
            'professional' => 'professionell / institutionell',
        ],
        'contactPref' => [
            'phone'    => 'Telefon',
            'email'    => 'E-Mail',
            'whatsapp' => 'WhatsApp',
        ],
    ],

    'site' => [
        'title'       => 'Vermögensschutz & globale Investments',
        'description' => 'Bargeldobergrenzen und Inflation fressen dein Geld auf. Erfahre in einem '
            . 'diskreten Erstgespräch, wie du dein Kapital legal außerhalb der EU-Reichweite parkst.',

        'hero' => [
            'kicker'  => 'EU-Geld-Diktat steht bevor',
            'h1'      => 'Vermögensschutz &amp;',
            'h1b'     => 'globale Investments',
            'lead'    => 'Bargeldobergrenzen und Inflation fressen dein Geld auf. Erfahre in einem diskreten '
                . 'Erstgespräch, wie du dein Kapital legal außerhalb der EU-Reichweite parkst.',
            'cta'     => 'Kontaktiere uns',
            'more'    => 'Mehr Informationen',
            'promise' => 'Rückmeldung %s – von einem Menschen, nicht aus einem Postfach.',
        ],

        'problem' => [
            'eyebrow' => 'Das Problem',
            'h2'      => 'Enteignung &amp; Nullzinsfalle',
            'claim'   => 'Sie nehmen dir dein Bargeld – und die Inflation vernichtet den Rest.',
            'intro'   => 'Die Brüsseler Hinterzimmer haben das Urteil über dein Erspartes längst gefällt:',
            'items'   => [
                'Der digitale Euro kommt. Jede Transaktion wird gläsern, dein Geld auf Knopfdruck '
                    . 'programmierbar und im Ernstfall gesperrt.',
                'Traditionelle Banken bieten dir mickrige Zinsen, die nicht einmal die reale Inflation '
                    . 'ausgleichen. Dein Geld auf dem Sparbuch stirbt einen langsamen Tod.',
                'Während der Staat über Vermögensabgaben nachdenkt, wirst du durch die Teuerungsrate '
                    . 'schleichend enteignet.',
            ],
            'thumbs' => [
                'thema-euro.webp'      => 'Der digitale Euro',
                'thema-inflation.webp' => 'Inflation',
                'thema-steuern.webp'   => 'Vermögensabgaben',
            ],
            'result_label' => 'Das Ergebnis:',
            'result'       => 'Wer sein Geld im klassischen EU-Banksystem liegen lässt, verliert doppelt – '
                . 'an Kontrolle und an Kaufkraft.',
        ],

        'band' => [
            'h2'   => 'Hör auf, Opfer der EU-Politik zu sein.',
            'h2b'  => 'Werde zum Gewinner der Krise!',
            'text' => 'Die Uhr tickt. Während die breite Masse blind in die finanzielle Überwachung steuert, '
                . 'sichern sich clevere Anleger jetzt die besten Plätze und die höchsten Renditen. '
                . 'Nutze deine Chance auf ein echtes Insider-Gespräch, solange die Schlupflöcher noch offen sind.',
            'cta'  => 'Erstgespräch anfragen',
        ],

        'solution' => [
            'eyebrow' => 'Die Lösung',
            'h2'      => 'Vermögensschutz',
            'h2b'     => 'plus maximalen Profit',
            'claim'   => 'Die Eliten bringen ihr Geld nicht nur in Sicherheit – sie lassen es im Ausland massiv wachsen!',
            'lead'    => 'Es gibt legale Finanz-Oasen und krisenfeste Sachwerte außerhalb der EU-Regulierungswut, '
                . 'die normalen Sparern völlig unbekannt sind. Diese Strategien bieten dir das Beste aus '
                . 'zwei Welten: absoluten Schutz vor staatlichem Zugriff und überdurchschnittlich hohe, '
                . 'steueroptimierte Renditen.',
            'sub'     => 'In deinem kostenlosen und absolut vertraulichen Erstgespräch zeigen wir dir:',
            'cards'   => [
                'Welche Sachwerte dein Vermögen unsichtbar für die EU machen und gleichzeitig historische '
                    . 'Spitzen-Renditen abwerfen.',
                'Wie du legale Schlupflöcher nutzt, um von den Wachstums-Märkten außerhalb Europas zu '
                    . 'profitieren – weit weg von der Euro-Krise.',
                'Wie du dein Kapital innerhalb von 48 Stunden so umschichtest, dass es geschützt ist und '
                    . 'sofort für dich arbeitet.',
            ],
        ],

        'final' => [
            'h2'        => 'Vier Fragen. Dann meldet sich ein Mensch.',
            'text'      => 'Deine Anfrage geht direkt an das zuständige Fachteam – nicht in ein anonymes '
                . 'Postfach. Rückmeldung %s.',
            'cta'       => 'Jetzt Anfrage stellen',
            'fineprint' => 'Keine Weitergabe an Dritte · Persönlicher Rückruf statt Warteschleife · '
                . 'Eigener Kundenbereich inklusive',
        ],

        'schema' => [
            'service'     => 'Diskretes Erstgespräch zum Vermögensschutz',
            'description' => 'Kostenloses und vertrauliches Erstgespräch. Die Anfrage geht direkt an das '
                . 'zuständige Fachteam; die Reaktionszeit wird gemessen.',
            'knows'       => ['Vermögensschutz', 'Edelmetalle', 'Sachwerte', 'Private Equity',
                              'Diversifikation außerhalb der EU'],
        ],
    ],

    'legal' => [
        'title'       => 'Impressum',
        'description' => 'Impressum und rechtliche Hinweise.',
        'h1'          => 'Impressum',
        'sections'    => [
            ['h' => 'Firmenzentrale',      'p' => "BMA Berlin Management Agency GmbH\nPotsdamer Platz 1\n10117 Berlin\nDeutschland"],
            ['h' => 'Agenturzentrale',     'p' => "BMA Berlin Management Agency GmbH\nMarketing Department\nLutherstraße 22\n27576 Bremerhaven\nDeutschland"],
            ['h' => 'Kontakt',             'p' => 'E-Mail: mail(AT)21capitalinvest.com'],
            ['h' => 'Geschäftsführer',     'p' => 'Toni Bloch (CEO)'],
            ['h' => 'Sitz der Gesellschaft', 'p' => 'Berlin und Bremerhaven, Deutschland'],
            ['h' => 'Registergericht',     'p' => "Amtsgericht Berlin-Charlottenburg, HRB 208268\nSteuernummer 1130/232/51932"],
        ],
        'risk_h'  => 'Risikohinweis',
        'risk'    => [
            'Investitionen in Kryptowährungen, digitale Vermögenswerte und dezentrale Finanzsysteme (DeFi) '
                . 'sind mit erheblichen Risiken verbunden und können zum vollständigen Verlust des '
                . 'eingesetzten Kapitals führen. Renditen sind nicht garantiert.',
            'Die auf dieser Website bereitgestellten Informationen dienen ausschließlich allgemeinen '
                . 'Informationszwecken und stellen keine individuelle Anlage-, Rechts- oder Steuerberatung dar.',
        ],
    ],

    'footer' => [
        'risk'      => 'Investitionen in Kryptowährungen, digitale Vermögenswerte und dezentrale '
            . 'Finanzsysteme (DeFi) sind mit erheblichen Risiken verbunden und können zum vollständigen '
            . 'Verlust des eingesetzten Kapitals führen. Renditen sind nicht garantiert. Die auf dieser '
            . 'Website bereitgestellten Informationen dienen ausschließlich allgemeinen Informationszwecken '
            . 'und stellen keine individuelle Anlage-, Rechts- oder Steuerberatung dar.',
        'copyright' => 'Copyright %s &copy; %s',
    ],
];
