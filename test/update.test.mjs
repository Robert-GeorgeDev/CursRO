import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plan, todayInRomania, update } from "../scripts/update.mjs";
import { checkData } from "../scripts/check-data.mjs";

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cursro-"));
const quiet = () => {};

/** Fake BNR: serves fixtures for 2025, 2026 and the ten-day file; older years are empty archives. */
function fakeBnr(requested = []) {
  return async (p) => {
    requested.push(p);
    if (p.endsWith("nbrfxrates10days.xml")) return fixture("ten-days.xml");
    if (p.endsWith("nbrfxrates2025.xml")) return fixture("year-2025.xml");
    if (p.endsWith("nbrfxrates2026.xml")) return fixture("year-2026.xml");
    const year = p.match(/(\d{4})\.xml$/)?.[1];
    return `<DataSet><Body><Cube date="${year}-06-01"><Rate currency="EUR">4.5</Rate><Rate currency="USD">3.9</Rate></Cube></Body></DataSet>`;
  };
}

test("plan downloads the full archive on the first run", () => {
  const p = plan([], "2026-10-27");
  assert.equal(p.years[0], 2005);
  assert.equal(p.years.at(-1), 2026);
});

test("plan uses only the ten-day file when data is recent", () => {
  assert.deepEqual(plan(["2026-10-20"], "2026-10-27").years, []);
});

test("plan downloads yearly archives after a long gap", () => {
  assert.deepEqual(plan(["2025-11-03"], "2026-10-27").years, [2025, 2026]);
});

test("todayInRomania uses Romanian time", () => {
  // 23:30 UTC on 31 Dec is already 1 Jan in Bucharest.
  assert.equal(todayInRomania(new Date("2025-12-31T23:30:00Z")), "2026-01-01");
});

test("first run backfills everything and writes all aggregate files", async () => {
  const dir = tmp();
  const summary = await update({ dataDir: dir, today: "2026-10-27", fetchText: fakeBnr(), log: quiet });

  assert.equal(summary.first, "2005-06-01");
  assert.equal(summary.last, "2026-10-27");
  assert.equal(summary.added, summary.total);

  const latest = JSON.parse(fs.readFileSync(path.join(dir, "latest.json"), "utf8"));
  assert.equal(latest.date, "2026-10-27");
  assert.equal(latest.rates.HUF, 0.013071);
  assert.equal(latest.previous.date, "2026-10-26");

  const eur = JSON.parse(fs.readFileSync(path.join(dir, "currencies", "EUR.json"), "utf8"));
  assert.deepEqual(eur.rates.at(-1), ["2026-10-27", 5.0812]);

  const csv = fs.readFileSync(path.join(dir, "rates.csv"), "utf8").trim().split("\n");
  assert.equal(csv[0], "date,currency,rate");
  assert.ok(csv.includes("2026-10-27,HUF,0.013071"));

  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  assert.equal(index.days, summary.total);
  assert.deepEqual(index.currencies.find((c) => c.code === "BGN"), { code: "BGN", first: "2025-12-30", last: "2025-12-31", current: false });

  assert.deepEqual(checkData(dir), []);
});

test("a second run changes nothing", async () => {
  const dir = tmp();
  await update({ dataDir: dir, today: "2026-10-27", fetchText: fakeBnr(), log: quiet });
  const snapshot = () => fs.readdirSync(dir, { recursive: true }).sort().map((f) => {
    const full = path.join(dir, f);
    return fs.statSync(full).isFile() ? f + ":" + fs.readFileSync(full, "utf8") : f;
  });
  const before = snapshot();

  const requested = [];
  const summary = await update({ dataDir: dir, today: "2026-10-27", fetchText: fakeBnr(requested), log: quiet });
  assert.equal(summary.added, 0);
  assert.equal(summary.changed, 0);
  assert.deepEqual(requested, ["/nbrfxrates10days.xml"]);
  assert.deepEqual(snapshot(), before);
});

test("a corrected rate replaces the stored one", async () => {
  const dir = tmp();
  await update({ dataDir: dir, today: "2026-10-27", fetchText: fakeBnr(), log: quiet });
  const corrected = async (p) => fixture("ten-days.xml").replace("5.0812", "5.0813");
  const summary = await update({ dataDir: dir, today: "2026-10-27", fetchText: corrected, log: quiet });
  assert.equal(summary.changed, 1);
  const latest = JSON.parse(fs.readFileSync(path.join(dir, "latest.json"), "utf8"));
  assert.equal(latest.rates.EUR, 5.0813);
});

test("a missing archive for the current year is tolerated", async () => {
  const dir = tmp();
  const fetchText = async (p) => {
    if (p.endsWith("nbrfxrates2026.xml")) throw Object.assign(new Error("404"), { notFound: true });
    return fakeBnr()(p);
  };
  const summary = await update({ dataDir: dir, today: "2026-10-27", fetchText, log: quiet });
  assert.equal(summary.last, "2026-10-27");
});

test("an empty ten-day file stops the update instead of writing bad data", async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "daily", "2026"), { recursive: true });
  fs.writeFileSync(path.join(dir, "daily", "2026", "2026-10-26.json"), JSON.stringify({ date: "2026-10-26", base: "RON", rates: { EUR: 5, USD: 4 } }));
  await assert.rejects(
    update({ dataDir: dir, today: "2026-10-27", fetchText: async () => "<html>maintenance</html>", log: quiet }),
    /format change/,
  );
});

test("checkData reports inconsistent files", async () => {
  const dir = tmp();
  await update({ dataDir: dir, today: "2026-10-27", fetchText: fakeBnr(), log: quiet });
  fs.writeFileSync(path.join(dir, "daily", "2026", "2026-10-27.json"), JSON.stringify({ date: "2026-10-27", base: "RON", rates: { EUR: -1, USD: 4 } }));
  assert.match(checkData(dir).join("\n"), /EUR rate -1/);
});
