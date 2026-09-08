<?php
/**
 * Englische Texte der öffentlichen Strecke.
 *
 * Die Sätze stammen aus der englischen Fassung des bisherigen Auftritts;
 * offensichtliche Tippfehler der Vorlage sind stillschweigend berichtigt.
 * Aufbau und Schlüssel sind dieselben wie in de.php – wer dort etwas
 * ergänzt, ergänzt es hier.
 */
declare(strict_types=1);

return [
    'name'      => 'English',
    'switch'    => ['label' => 'Deutsch', 'title' => 'Auf Deutsch ansehen', 'short' => 'DE'],

    'nav' => [
        'home'     => 'Home',
        'problem'  => 'The Problem',
        'solution' => 'The Solution',
        'contact'  => 'Get in touch',
        'imprint'  => 'Imprint',
        'portal'   => 'Client area',
        'staff'    => 'Staff login',
        'back'     => 'Back to the home page',
    ],

    'validator' => [
        'required' => 'Please enter %s.',
        'choose'   => 'Please choose %s.',
        'invalid'  => 'Invalid choice for %s.',
        'short'    => 'Too short – please enter %s with at least %s characters.',
        'long'     => 'Too long – please enter %s with at most %s characters.',
        'email'    => 'Please enter a valid e-mail address.',
        'value'    => 'Please enter a value.',
        'range'    => 'The value must be between %s and %s.',
        'date'     => 'Please enter %s as a valid date.',
        'fields'   => [
            'firstName'     => 'your first name',
            'lastName'      => 'your surname',
            'email'         => 'a valid e-mail address',
            'phone'         => 'your phone number',
            'company'       => 'your company',
            'city'          => 'your town',
            'postalCode'    => 'your postcode',
            'country'       => 'your country',
            'assetClass'    => 'a subject area',
            'volumeBand'    => 'an investment volume',
            'horizon'       => 'an investment horizon',
            'experience'    => 'your experience',
            'contactPref'   => 'how we may reach you',
            'contactWindow' => 'a time of day',
            'goal'          => 'your goal',
            'message'       => 'your message',
        ],
    ],

    'intake' => [
        'consent'   => 'Without your consent we are not allowed to contact you.',
        'phone'     => 'We need a phone number in order to call you back.',
        'ratelimit' => 'Too many enquiries in a short time. Please try again later or call us directly.',
    ],

    'mail' => [
        'welcome' => [
            'subject'  => 'Your enquiry %s has arrived – we will be in touch shortly',
            'heading'  => 'Your enquiry has arrived, %s',
            'intro'    => 'thank you for your interest in <strong>%s</strong>. Your enquiry is already with '
                . 'our specialist team – we will get back to you personally <strong>%s</strong>.',
            'portal'   => 'In your personal client area you can see the status of your enquiry at any time, '
                . 'the next steps and – as soon as it exists – your individual offer.',
            'login'    => 'Login',
            'password' => 'Password',
            'ref'      => 'Reference',
            'known'    => 'You already have access: the password from your first confirmation still applies.',
            'button'   => 'Go to your client area',
            'change'   => 'Please change the password after your first login.',
            'text'     => "Thank you for your enquiry (%s).\nWe will be in touch %s.",
            'contact'  => 'Your contact: %s',
        ],
    ],

    'hours' => [
        'within'   => 'within %s minutes',
        'today'    => 'today from %s',
        'tomorrow' => 'tomorrow morning from %s',
        'weekday'  => 'on %s from %s',
        'time'     => '%s',
        'format'   => 'g:i a',
        'weekdays' => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        'windows'  => [
            'vormittags'  => 'Mornings (%s – %s)',
            'nachmittags' => 'Afternoons (%s – %s)',
            'abends'      => 'Evenings (%s – %s)',
            'flexibel'    => 'Any time',
            'whenever'    => 'As soon as we are available',
        ],
    ],

    'leads' => [
        'volume' => [
            'under-25k' => 'up to €25,000',
            '25k-50k'   => '€25,000 – €50,000',
            '50k-100k'  => '€50,000 – €100,000',
            '100k-250k' => '€100,000 – €250,000',
            '250k-500k' => '€250,000 – €500,000',
            'over-500k' => 'more than €500,000',
        ],
        'horizon' => [
            'short'        => 'short term (up to 2 years)',
            'medium'       => 'medium term (2 – 5 years)',
            'long'         => 'long term (5 – 10 years)',
            'generational' => 'generational (10+ years)',
        ],
        'experience' => [
            'none'         => 'no previous experience',
            'some'         => 'some experience',
            'experienced'  => 'experienced',
            'professional' => 'professional / institutional',
        ],
        'contactPref' => [
            'phone'    => 'Phone',
            'email'    => 'E-mail',
            'whatsapp' => 'WhatsApp',
        ],
    ],

    'site' => [
        'title'       => 'Asset Protection & Global Investments',
        'description' => 'Cash limits and inflation are eating away at your money. Find out in a discreet '
            . 'initial consultation how you can legally park your capital beyond the reach of the EU.',

        'hero' => [
            'kicker'  => 'EU financial dictates are coming',
            'h1'      => 'Asset protection &amp;',
            'h1b'     => 'global investments',
            'lead'    => 'Cash limits and inflation are eating away at your money. Find out in a discreet '
                . 'initial consultation how you can legally park your capital beyond the reach of the EU '
                . 'and grow your wealth with crisis-proof investments.',
            'cta'     => 'Get in touch',
            'more'    => 'More information',
            'promise' => 'A reply %s – from a person, not from a mailbox.',
        ],

        'problem' => [
            'eyebrow' => 'The Problem',
            'h2'      => 'Expropriation &amp; the zero-interest trap',
            'claim'   => 'They are taking your cash – and inflation is destroying the rest.',
            'intro'   => 'The back rooms in Brussels sealed the fate of your savings long ago:',
            'items'   => [
                'The digital euro is coming. Every transaction becomes transparent, your money programmable '
                    . 'at the push of a button and frozen in an emergency.',
                'Traditional banks offer you paltry interest rates that do not even keep pace with real '
                    . 'inflation. Your money in a savings account is dying a slow death.',
                'While the state mulls over wealth levies, inflation is expropriating you bit by bit.',
            ],
            'thumbs' => [
                'thema-euro.webp'      => 'The digital euro',
                'thema-inflation.webp' => 'Inflation',
                'thema-steuern.webp'   => 'Wealth levies',
            ],
            'result_label' => 'The result:',
            'result'       => 'Anyone who leaves their money in the traditional EU banking system loses '
                . 'twice – control and purchasing power.',
        ],

        'band' => [
            'h2'   => 'Stop being a victim of EU policy.',
            'h2b'  => 'Become a winner in this crisis!',
            'text' => 'The clock is ticking. While the masses head blindly towards financial oversight, '
                . 'savvy investors are securing the best positions and the highest returns right now. '
                . 'Seize your chance for a genuine insider conversation while the loopholes are still open.',
            'cta'  => 'Request an initial consultation',
        ],

        'solution' => [
            'eyebrow' => 'The Solution',
            'h2'      => 'Protection',
            'h2b'     => 'plus maximum profit',
            'claim'   => 'The elites are not just putting their money in a safe place – they are making it '
                . 'grow massively abroad!',
            'lead'    => 'There are legal financial havens and crisis-proof tangible assets outside the '
                . 'EU’s regulatory frenzy that are completely unknown to ordinary savers. These strategies '
                . 'offer you the best of both worlds: absolute protection from state access and '
                . 'above-average, tax-optimised returns.',
            'sub'     => 'In your free and completely confidential initial consultation we will show you:',
            'cards'   => [
                'Which tangible assets make your wealth invisible to the EU while generating historically '
                    . 'high returns at the same time.',
                'How to use legal loopholes to profit from growth markets outside Europe – far away from '
                    . 'the euro crisis.',
                'How to reallocate your capital within 48 hours so that it is protected and starts working '
                    . 'for you immediately.',
            ],
        ],

        'final' => [
            'h2'        => 'Four questions. Then a person gets in touch.',
            'text'      => 'Your enquiry goes straight to the specialist team in charge – not into an '
                . 'anonymous mailbox. A reply %s.',
            'cta'       => 'Send your enquiry now',
            'fineprint' => 'Never passed on to third parties · A personal call back instead of a queue · '
                . 'Your own client area included',
        ],

        'schema' => [
            'service'     => 'Discreet initial consultation on asset protection',
            'description' => 'A free and confidential initial consultation. The enquiry goes straight to the '
                . 'specialist team in charge; the response time is measured.',
            'knows'       => ['Asset protection', 'Precious metals', 'Tangible assets', 'Private equity',
                              'Diversification outside the EU'],
        ],
    ],

    'legal' => [
        'title'       => 'Imprint',
        'description' => 'Imprint and legal information.',
        'h1'          => 'Imprint & legal information',
        'sections'    => [
            ['h' => 'Company headquarters', 'p' => "BMA Berlin Management Agency GmbH\nPotsdamer Platz 1\n10117 Berlin\nGermany"],
            ['h' => 'Agency headquarters',  'p' => "BMA Berlin Management Agency GmbH\nMarketing Department\nLutherstraße 22\n27576 Bremerhaven\nGermany"],
            ['h' => 'Contact',              'p' => 'E-mail: mail(AT)21capitalinvest.com'],
            ['h' => 'Managing director',    'p' => 'Toni Bloch (CEO)'],
            ['h' => 'Registered office',    'p' => 'Berlin and Bremerhaven, Germany'],
            ['h' => 'Commercial register',  'p' => "Berlin-Charlottenburg Local Court, HRB 208268\nTax number 1130/232/51932"],
        ],
        'risk_h'  => 'Risk notice',
        'risk'    => [
            'Investments in cryptocurrencies, digital assets and decentralised finance (DeFi) involve '
                . 'significant risks and may result in the complete loss of the invested capital. Returns '
                . 'are not guaranteed.',
            'The information provided on this website is for general informational purposes only and does '
                . 'not constitute individual investment, legal or tax advice.',
        ],
    ],

    'footer' => [
        'risk'      => 'Investments in cryptocurrencies, digital assets and decentralised finance (DeFi) '
            . 'involve significant risks and may result in the complete loss of the invested capital. '
            . 'Returns are not guaranteed. The information provided on this website is for general '
            . 'informational purposes only and does not constitute individual investment, legal or tax advice.',
        'copyright' => 'Copyright %s &copy; %s',
    ],
];
