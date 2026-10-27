// Reads and writes the data folder. Every aggregate file is rebuilt from the
// daily files, so running the update twice gives byte-identical output.
import fs from "node:fs";
import path from "node:path";
import { sortKeys } from "./bnr.mjs";

export const BASE = "RON";
export const SOURCE = "Banca Națională a României (https://www.bnr.ro)";

const dailyPath = (dir, date) => path.join(dir, "daily", date.slice(0, 4), `${date}.json`);

export function listDates(dir) {
  const daily = path.join(dir, "daily");
  if (!fs.existsSync(daily)) return [];
  return fs
    .readdirSync(daily)
    .filter((y) => /^\d{4}$/.test(y))
    .flatMap((y) => fs.readdirSync(path.join(daily, y)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)))
    .sort();
}

export function readDay(dir, date) {
  return JSON.parse(fs.readFileSync(dailyPath(dir, date), "utf8"));
}

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

const json = (value) => JSON.stringify(value, null, 2) + "\n";

/** Writes one day. Returns "added", "changed" or null when nothing changed. */
export function writeDay(dir, { date, rates }) {
  const file = dailyPath(dir, date);
  const existed = fs.existsSync(file);
  const changed = writeIfChanged(file, json({ date, base: BASE, rates: sortKeys(rates) }));
  return changed ? (existed ? "changed" : "added") : null;
}

/** Rebuilds latest.json, index.json, rates.csv and currencies/<CODE>.json from the daily files. */
export function rebuildAggregates(dir) {
  const dates = listDates(dir);
  if (!dates.length) return;
  const days = dates.map((d) => readDay(dir, d));

  const last = days.at(-1);
  const previous = days.at(-2);
  writeIfChanged(
    path.join(dir, "latest.json"),
    json({
      date: last.date,
      base: BASE,
      source: SOURCE,
      rates: last.rates,
      previous: previous ? { date: previous.date, rates: previous.rates } : null,
    }),
  );

  const series = {};
  const csv = ["date,currency,rate"];
  for (const day of days) {
    for (const [code, rate] of Object.entries(day.rates)) {
      (series[code] ??= []).push([day.date, rate]);
      csv.push(`${day.date},${code},${rate}`);
    }
  }
  writeIfChanged(path.join(dir, "rates.csv"), csv.join("\n") + "\n");

  const currencies = Object.keys(series).sort();
  for (const code of currencies) {
    const rows = series[code].map((row) => "    " + JSON.stringify(row)).join(",\n");
    writeIfChanged(
      path.join(dir, "currencies", `${code}.json`),
      `{\n  "currency": "${code}",\n  "base": "${BASE}",\n  "rates": [\n${rows}\n  ]\n}\n`,
    );
  }

  writeIfChanged(
    path.join(dir, "index.json"),
    json({
      source: SOURCE,
      base: BASE,
      first: dates[0],
      last: last.date,
      days: dates.length,
      currencies: currencies.map((code) => ({
        code,
        first: series[code][0][0],
        last: series[code].at(-1)[0],
        current: code in last.rates,
      })),
    }),
  );
}
