// Reads the reference exchange rates published by Banca Națională a României (BNR).
// The XML format is documented by BNR's schema: https://curs.bnr.ro/xsd/nbrfxrates.xsd

export const FIRST_YEAR = 2005;

const HOSTS = ["https://curs.bnr.ro", "https://www.bnr.ro"];

export const SOURCES = {
  today: "/nbrfxrates.xml",
  tenDays: "/nbrfxrates10days.xml",
  year: (year) => `/files/xml/years/nbrfxrates${year}.xml`,
};

const CUBE_RE = /<Cube\s+date="(\d{4}-\d{2}-\d{2})"\s*>([\s\S]*?)<\/Cube>/g;
const RATE_RE = /<Rate\b([^>]*)>([^<]*)<\/Rate>/g;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;
const DECIMAL_RE = /^\d+(\.\d+)?$/;

/**
 * Converts a rate quoted for `multiplier` units (BNR quotes HUF, JPY and a few
 * others per 100 units) into the rate for one unit, without floating-point noise:
 * "1.3071" per 100 HUF becomes 0.013071.
 */
export function perUnit(value, multiplier = 1) {
  if (!DECIMAL_RE.test(value)) throw new Error(`Not a decimal number: ${value}`);
  if (multiplier === 1) return Number(value);
  const shift = Math.log10(multiplier);
  if (!Number.isInteger(shift) || shift < 0) return Number((Number(value) / multiplier).toPrecision(12));
  const [whole, fraction = ""] = value.split(".");
  const digits = whole + fraction;
  const point = whole.length - shift;
  const shifted = point <= 0 ? "0." + "0".repeat(-point) + digits : digits.slice(0, point) + "." + digits.slice(point);
  return Number(shifted);
}

/**
 * Parses a BNR XML document (daily, ten-day or yearly) into a list of days,
 * sorted by date: [{ date: "2026-10-27", rates: { EUR: 5.0812, HUF: 0.013071 } }].
 */
export function parseRates(xml) {
  const days = [];
  for (const [, date, body] of xml.matchAll(CUBE_RE)) {
    const rates = {};
    for (const [, attrs, raw] of body.matchAll(RATE_RE)) {
      const a = Object.fromEntries([...attrs.matchAll(ATTR_RE)].map(([, k, v]) => [k, v]));
      const value = raw.trim();
      if (!a.currency || !DECIMAL_RE.test(value)) continue;
      const multiplier = a.multiplier ? Number(a.multiplier) : 1;
      rates[a.currency] = perUnit(value, multiplier);
    }
    if (Object.keys(rates).length) days.push({ date, rates: sortKeys(rates) });
  }
  return days.sort((x, y) => x.date.localeCompare(y.date));
}

export function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

/** Downloads a BNR document, trying each host and retrying transient failures. */
export async function fetchBnr(path, { fetchImpl = fetch, attempts = 3 } = {}) {
  let lastError;
  for (const host of HOSTS) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await fetchImpl(host + path, {
          headers: { "User-Agent": "CursRO (+https://github.com/Robert-GeorgeDev/CursRO)" },
          signal: AbortSignal.timeout(30_000),
        });
        if (res.status === 404) {
          lastError = Object.assign(new Error(`404 for ${host}${path}`), { notFound: true });
          break;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${host}${path}`);
        return await res.text();
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastError;
}
