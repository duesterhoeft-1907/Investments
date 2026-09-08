<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Kleiner Prüfer. Sammelt alle Fehler, damit das Formular sie auf einmal
 * anzeigen kann, statt einen nach dem anderen.
 *
 * Die Meldungen kommen aus dem Wörterbuch: die öffentliche Anfragestrecke
 * gibt es auch auf Englisch, und eine deutsche Fehlermeldung unter einem
 * englischen Feld wäre genau an der Stelle unhöflich, an der jemand gerade
 * einen Fehler gemacht hat.
 */
final class Validator
{
    private array $errors = [];
    private array $clean = [];

    public function __construct(private readonly array $input)
    {
    }

    private function raw(string $field): mixed
    {
        return $this->input[$field] ?? null;
    }

    public function text(string $field, string $label, int $min = 0, int $max = 255, bool $required = true): self
    {
        $value = trim((string) ($this->raw($field) ?? ''));
        if ($value === '') {
            if ($required) {
                $this->errors[$field] = I18n::t('validator.required', $label);
            }
            $this->clean[$field] = '';
            return $this;
        }
        if (mb_strlen($value) < $min) {
            $this->errors[$field] = I18n::t('validator.short', $label, $min);
        } elseif (mb_strlen($value) > $max) {
            $this->errors[$field] = I18n::t('validator.long', $label, $max);
        }
        $this->clean[$field] = $value;
        return $this;
    }

    public function email(string $field, ?string $label = null, bool $required = true): self
    {
        $label ??= I18n::t('validator.fields.email');
        $value = trim((string) ($this->raw($field) ?? ''));
        if ($value === '') {
            if ($required) {
                $this->errors[$field] = I18n::t('validator.required', $label);
            }
            $this->clean[$field] = '';
            return $this;
        }
        if (filter_var($value, FILTER_VALIDATE_EMAIL) === false || mb_strlen($value) > 190) {
            $this->errors[$field] = I18n::t('validator.email');
        }
        $this->clean[$field] = $value;
        return $this;
    }

    /** @param list<string> $allowed */
    public function choice(string $field, array $allowed, string $label, bool $required = true, string $fallback = ''): self
    {
        $value = trim((string) ($this->raw($field) ?? ''));
        if ($value === '') {
            if ($required) {
                $this->errors[$field] = I18n::t('validator.choose', $label);
            }
            $this->clean[$field] = $fallback;
            return $this;
        }
        if (!in_array($value, $allowed, true)) {
            $this->errors[$field] = I18n::t('validator.invalid', $label);
            $this->clean[$field] = $fallback;
            return $this;
        }
        $this->clean[$field] = $value;
        return $this;
    }

    public function int(string $field, int $min, int $max, int $default = 0, bool $required = false): self
    {
        $raw = $this->raw($field);
        if ($raw === null || $raw === '') {
            if ($required) {
                $this->errors[$field] = I18n::t('validator.value');
            }
            $this->clean[$field] = $default;
            return $this;
        }
        $value = (int) $raw;
        if ($value < $min || $value > $max) {
            $this->errors[$field] = I18n::t('validator.range', $min, $max);
        }
        $this->clean[$field] = max($min, min($max, $value));
        return $this;
    }

    public function bool(string $field): self
    {
        $raw = $this->raw($field);
        $this->clean[$field] = in_array($raw, [true, 1, '1', 'true', 'on', 'yes'], true);
        return $this;
    }

    public function accepted(string $field, string $message): self
    {
        $this->bool($field);
        if ($this->clean[$field] !== true) {
            $this->errors[$field] = $message;
        }
        return $this;
    }

    /** Datum im ISO-Format aus dem Browser, gespeichert wird UTC. */
    public function isoDate(string $field, string $label, bool $required = true): self
    {
        $value = trim((string) ($this->raw($field) ?? ''));
        if ($value === '') {
            if ($required) {
                $this->errors[$field] = I18n::t('validator.required', $label);
            }
            $this->clean[$field] = null;
            return $this;
        }
        try {
            $date = new \DateTimeImmutable($value, new \DateTimeZone('UTC'));
            $this->clean[$field] = $date->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            $this->errors[$field] = I18n::t('validator.date', $label);
            $this->clean[$field] = null;
        }
        return $this;
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    public function errors(): array
    {
        return $this->errors;
    }

    /** Bricht mit 400 ab und liefert alle Fehler auf einmal zurück. */
    public function orFail(): array
    {
        if ($this->fails()) {
            Http::error(
                (string) reset($this->errors),
                400,
                ['fields' => $this->errors]
            );
        }
        return $this->clean;
    }

    public function values(): array
    {
        return $this->clean;
    }
}
