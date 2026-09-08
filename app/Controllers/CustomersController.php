<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Http;
use App\Core\Validator;
use App\Domain\Customers;

/**
 * Der Mensch hinter den Anfragen – für das CRM.
 *
 * Die Anfrage selbst hat ihren eigenen Endpunkt; hier geht es um das,
 * was ueber eine einzelne Anfrage hinausgeht: alle Vorgaenge eines
 * Kunden, sein Verlauf ueber alle hinweg, und eine Notiz, die am
 * Menschen haengt statt an einem Vorgang.
 */
final class CustomersController
{
    public static function show(string $id): void
    {
        Auth::requireStaff();
        $customerId = (int) $id;

        $customer = Customers::find($customerId);
        if ($customer === null) {
            Http::error('Kunde nicht gefunden.', 404);
        }

        $customer['summary'] = Customers::summary($customerId);
        $customer['leads'] = Customers::leads($customerId);
        $customer['emails'] = Customers::emails($customerId);

        Http::json(['customer' => $customer]);
    }

    /**
     * Der Verlauf ueber alle Anfragen dieses Kunden.
     *
     * Genau das meint "zusammenfassen": wer schon zweimal angerufen hat,
     * soll das nicht in zwei getrennten Listen suchen muessen. Jeder
     * Eintrag traegt mit, zu welcher Anfrage er gehoert.
     */
    public static function activities(string $id): void
    {
        Auth::requireStaff();
        $customerId = (int) $id;

        if (Customers::find($customerId) === null) {
            Http::error('Kunde nicht gefunden.', 404);
        }

        $rows = Customers::activities($customerId, Http::queryInt('limit', 200));

        Http::json([
            'activities' => array_map(static function (array $a): array {
                $eintrag = LeadsController::presentActivity($a);
                // Woher der Eintrag stammt – ohne das ist die
                // zusammengefasste Liste nicht zu lesen.
                $eintrag['lead'] = [
                    'id'         => (int) $a['lead_ref_id'],
                    'ref'        => $a['lead_ref'],
                    'assetClass' => $a['lead_asset_class'],
                ];
                return $eintrag;
            }, $rows),
        ]);
    }

    /**
     * Wer könnte derselbe Mensch sein?
     *
     * Vorgeschlagen wird über Telefonnummer und Namen; dazu eine freie
     * Suche, falls der Vorschlag danebenliegt. Entschieden wird von Hand –
     * eine Maschine, die zwei Menschen von sich aus zusammenlegt, richtet
     * mehr Schaden an, als sie Arbeit spart.
     */
    public static function duplicates(string $id): void
    {
        Auth::requireStaff();
        $customerId = (int) $id;

        if (Customers::find($customerId) === null) {
            Http::error('Kunde nicht gefunden.', 404);
        }

        $suche = trim((string) (Http::query('q') ?? ''));

        Http::json([
            'suggestions' => Customers::duplicates($customerId),
            'results'     => $suche === '' ? [] : Customers::search($suche, $customerId),
        ]);
    }

    /**
     * Zwei Datensätze, ein Mensch.
     *
     * Der aufgerufene Kunde wird in den angegebenen hineingeführt und
     * verschwindet. Seine Adressen wandern mit, damit die nächste Anfrage
     * von dort nicht wieder einen neuen Kunden anlegt.
     *
     * Rückgängig machen lässt sich das nicht – deshalb nur für
     * Geschäftsführung und Leitung.
     */
    public static function merge(string $id): void
    {
        Auth::requireRole('admin', 'manager');
        $quelle = (int) $id;

        $v = new Validator(Http::body());
        $v->int('into', 1, PHP_INT_MAX, 0, true);
        $ziel = (int) $v->orFail()['into'];

        try {
            $ergebnis = Customers::merge($quelle, $ziel);
        } catch (\InvalidArgumentException $e) {
            Http::error($e->getMessage(), 400);
        } catch (\RuntimeException $e) {
            Http::error($e->getMessage(), 404);
        }

        $customer = Customers::find($ziel);
        $customer['summary'] = Customers::summary($ziel);
        $customer['leads'] = Customers::leads($ziel);
        $customer['emails'] = Customers::emails($ziel);

        Http::json(['customer' => $customer, 'moved' => $ergebnis]);
    }

    /** Eine Notiz am Menschen, nicht am Vorgang. */
    public static function update(string $id): void
    {
        Auth::requireStaff();
        $customerId = (int) $id;

        if (Customers::find($customerId) === null) {
            Http::error('Kunde nicht gefunden.', 404);
        }

        $v = new Validator(Http::body());
        $v->text('note', 'die Notiz', 0, 1000, false);
        $clean = $v->orFail();

        Db::run('UPDATE customers SET note = :n WHERE id = :id', ['n' => $clean['note'], 'id' => $customerId]);

        Http::json(['customer' => Customers::find($customerId)]);
    }
}
