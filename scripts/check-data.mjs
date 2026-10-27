// Checks that the data folder is consistent. Exits with an error if not.
// Usage: node scripts/check-data.mjs [--data data]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { listDates, readDay } from "./lib/store.mjs";

export function checkData(dataDir) {
  const problems = [];
  const dates = listDates(dataDir);
  if (!dates.length) return problems;

  for (const date of dates) {
    const day = readDay(dataDir, date);
    if (day.date !== date) problems.push(`${date}: file says ${day.date}`);
    if (day.base !== "RON") problems.push(`${date}: base is ${day.base}`);
    for (const [code, rate] of Object.entries(day.rates)) {
      if (!/^[A-Z]{3}$/.test(code)) problems.push(`${date}: odd currency code ${code}`);
      if (typeof rate !== "number" || !(rate > 0)) problems.push(`${date}: ${code} rate ${rate}`);
    }
    if (!("EUR" in day.rates) || !("USD" in day.rates)) problems.push(`${date}: EUR or USD missing`);
  }

  const latest = JSON.parse(fs.readFileSync(path.join(dataDir, "latest.json"), "utf8"));
  if (latest.date !== dates.at(-1)) problems.push(`latest.json is ${latest.date}, newest day is ${dates.at(-1)}`);
  const index = JSON.parse(fs.readFileSync(path.join(dataDir, "index.json"), "utf8"));
  if (index.days !== dates.length) problems.push(`index.json counts ${index.days} days, found ${dates.length}`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--data");
  const dataDir = path.resolve(i > -1 ? process.argv[i + 1] : "data");
  const problems = checkData(dataDir);
  if (problems.length) {
    console.error(problems.slice(0, 50).join("\n"));
    process.exit(1);
  }
  console.log(`data ok: ${listDates(dataDir).length} days`);
}
