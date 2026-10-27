import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseRates, perUnit } from "../scripts/lib/bnr.mjs";

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("perUnit converts rates quoted per 100 units without floating-point noise", () => {
  assert.equal(perUnit("1.3071", 100), 0.013071);
  assert.equal(perUnit("2.8910", 100), 0.02891);
  assert.equal(perUnit("0.0123", 1000), 0.0000123);
  assert.equal(perUnit("5.0812"), 5.0812);
  assert.equal(perUnit("123", 10), 12.3);
});

test("perUnit rejects values that are not decimal numbers", () => {
  assert.throws(() => perUnit("-"), /Not a decimal number/);
  assert.throws(() => perUnit("1,23"), /Not a decimal number/);
});

test("parseRates reads every day of a multi-day file, sorted by date", () => {
  const days = parseRates(fixture("ten-days.xml"));
  assert.deepEqual(days.map((d) => d.date), ["2026-10-26", "2026-10-27"]);
  assert.deepEqual(days[1].rates, { EUR: 5.0812, HUF: 0.013071, JPY: 0.02891, USD: 4.3701, XAU: 581 });
});

test("parseRates skips rates that are not numbers", () => {
  const [, last] = parseRates(fixture("year-2025.xml"));
  assert.equal(last.date, "2025-12-31");
  assert.equal("RUB" in last.rates, false);
  assert.equal(last.rates.BGN, 2.603);
});

test("parseRates returns an empty list for documents without rates", () => {
  assert.deepEqual(parseRates("<html>maintenance</html>"), []);
});
