/**
 * lib/week/utils.ts
 *
 * Utility funkce pro práci s týdny a daty.
 * Všechna data jsou v lokálním čase (CZ) bez timezone konverze – systém běží v rámci ČR.
 * week_start je vždy pondělí daného týdne (ISO weekday 1).
 *
 * Viz architecture_iter-003.md sekce 3.1–3.4 (datový model, baking_day).
 */

// Výchozí den pečení: pátek = 5 (ISO weekday: Po=1, Út=2, St=3, Čt=4, Pá=5, So=6, Ne=7)
const DEFAULT_BAKING_DAY = 5;

/**
 * Vrátí datum pondělí pro týden, do kterého patří zadané datum.
 * Pokud datum není zadáno, použije aktuální datum.
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  // getDay(): 0 = Ne, 1 = Po, ..., 6 = So
  const dayOfWeek = d.getDay();
  // Offset na pondělí: dayOfWeek 0 (Ne) → -6, 1 (Po) → 0, 2 (Út) → -1, ...
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + offsetToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Vrátí datum dne pečení pro zadaný týden.
 * bakingDay: ISO weekday číslo (1=Po, 2=Út, ..., 5=Pá, 6=So, 7=Ne)
 * Pokud bakingDay není zadán, použije DEFAULT_BAKING_DAY (pátek = 5).
 *
 * @throws {RangeError} pokud bakingDay není v rozsahu 1–7
 */
export function getBakingDate(weekStart: Date, bakingDay: number = DEFAULT_BAKING_DAY): Date {
  if (bakingDay < 1 || bakingDay > 7) {
    throw new RangeError(`bakingDay musí být v rozsahu 1–7, obdrženo: ${bakingDay}`);
  }
  const d = new Date(weekStart);
  // weekStart je pondělí (offset 0), pátek = offset 4
  d.setDate(d.getDate() + (bakingDay - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Vrátí true pokud je aktuální čas PŘED uzávěrkou objednávek.
 * Uzávěrka = den pečení v 17:00 (pevně daná hodina).
 *
 * @param weekStart  - pondělí daného týdne
 * @param bakingDay  - ISO weekday dne pečení (výchozí pátek = 5)
 * @param cutoffHour - hodina uzávěrky (výchozí 17)
 * @param now        - aktuální čas (výchozí Date.now(), lze přepsat v testech)
 */
export function isBeforeCutoff(
  weekStart: Date,
  bakingDay: number = DEFAULT_BAKING_DAY,
  cutoffHour: number = 17,
  now: Date = new Date(),
): boolean {
  const bakingDate = getBakingDate(weekStart, bakingDay);
  const cutoff = new Date(bakingDate);
  cutoff.setHours(cutoffHour, 0, 0, 0);
  return now < cutoff;
}

/**
 * Formátuje datum do českého formátu: "pondělí 22. 3. 2026"
 */
export function formatDateCZ(date: Date): string {
  return date.toLocaleDateString('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formátuje datum do ISO 8601 formátu pro DB: "YYYY-MM-DD"
 * Nepoužívá toISOString() (vrací UTC), místo toho ručně sestaví string
 * z lokálního data, aby nedocházelo k off-by-one chybám okolo půlnoci.
 */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Vrátí datum pondělí o `offsetWeeks` týdnů od zadaného weekStart.
 * Předpokládá, že `base` je pondělí (výsledek getWeekStart nebo getNextWeekStart).
 *
 * @param base        - výchozí pondělí (Date objekt)
 * @param offsetWeeks - počet týdnů dopředu (default 1)
 * @returns Date objekt pondělí o `offsetWeeks` týdnů dále
 *
 * Edge case EC-007: pokud je skip_until nastaven adminem na 3+ týdny,
 * tento util není dotčen – UI zobrazí "2 týdny" jako cap, viz SkipWeekButton.
 */
export function getNextWeekStart(base: Date, offsetWeeks: number = 1): Date {
  return new Date(base.getTime() + offsetWeeks * 7 * 24 * 60 * 60 * 1000);
}

/**
 * Parsuje ISO datum string "YYYY-MM-DD" na Date objekt (lokální čas, 00:00:00).
 *
 * @throws {Error} pokud formát není validní YYYY-MM-DD
 */
export function parseISO(dateString: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) {
    throw new Error(`Neplatný formát data: "${dateString}", očekáváno YYYY-MM-DD`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // Date months are 0-indexed
  const day = parseInt(dayStr, 10);
  const d = new Date(year, month, day, 0, 0, 0, 0);
  // Ověření: konstruktor Date akceptuje neplatné hodnoty (např. měsíc 13)
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
    throw new Error(`Datum "${dateString}" není validní kalendářní datum`);
  }
  return d;
}
