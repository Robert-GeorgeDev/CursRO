// Assembles the GitHub Pages site: the page from site/ plus the data folder.
// Usage: node scripts/build-site.mjs [--out _site]
import fs from "node:fs";
import path from "node:path";

const i = process.argv.indexOf("--out");
const out = path.resolve(i > -1 ? process.argv[i + 1] : "_site");

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync("site", out, { recursive: true });
if (fs.existsSync("data")) fs.cpSync("data", path.join(out, "data"), { recursive: true });
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log(`site built in ${out}`);
