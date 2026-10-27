// Downloads BNR rates that are missing from the data folder and rebuilds the
// aggregate files. On the first run it downloads the full archive since 2005.
//
// Usage: node scripts/update.mjs [--data data]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FIRST_YEAR, SOURCES, fetchBnr, parseRates } from "./lib/bnr.mjs";
import { listDates, rebuildAggregates, writeDay } from "./lib/store.mjs";

/** Today's date in Romania, as YYYY-MM-DD. */
export function todayInRomania(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(now);
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Decides which BNR documents to download, given the dates already stored. */
export function plan(dates, today) {
  const year = Number(today.slice(0, 4));
  const last = dates.at(-1);
  // The ten-day file covers short gaps; longer gaps need the yearly archives.
  const fromYear = !last ? FIRST_YEAR : daysBetween(last, today) > 12 ? Number(last.slice(0, 4)) : null;
  const years = fromYear === null ? [] : Array.from({ length: year - fromYear + 1 }, (_, i) => fromYear + i);
  return { years, tenDays: true, currentYear: year };
}

export async function update({ dataDir, today = todayInRomania(), fetchText = (p) => fetchBnr(p), log = console.log }) {
  const before = listDates(dataDir);
  const { years, currentYear } = plan(before, today);
  const days = new Map();

  for (const year of years) {
    let xml;
    try {
      xml = await fetchText(SOURCES.year(year));
    } catch (error) {
      // The current year's archive may not exist yet in early January.
      if (error.notFound && year === currentYear) continue;
      throw error;
    }
    const parsed = parseRates(xml);
    if (!parsed.length && year !== currentYear) throw new Error(`No rates found in the ${year} archive; did the format change?`);
    for (const day of parsed) days.set(day.date, day);
    log(`archive ${year}: ${parsed.length} days`);
  }

  const recent = parseRates(await fetchText(SOURCES.tenDays));
  if (!recent.length) throw new Error("No rates found in the ten-day file; did the format change?");
  for (const day of recent) days.set(day.date, day);
  log(`ten-day file: ${recent.length} days`);

  let added = 0;
  let changed = 0;
  for (const day of [...days.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.date > today) continue;
    const result = writeDay(dataDir, day);
    if (result === "added") added++;
    if (result === "changed") changed++;
  }
  rebuildAggregates(dataDir);

  const dates = listDates(dataDir);
  const summary = { added, changed, first: dates[0] ?? null, last: dates.at(-1) ?? null, total: dates.length };
  log(`added ${added}, changed ${changed}, ${summary.total} days from ${summary.first} to ${summary.last}`);
  return summary;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--data");
  const dataDir = path.resolve(i > -1 ? process.argv[i + 1] : "data");
  const summary = await update({ dataDir });
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(summary).map(([k, v]) => `${k}=${v}`).join("\n") + "\n",
    );
  }
}
