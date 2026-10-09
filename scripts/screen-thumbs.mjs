#!/usr/bin/env node
/**
 * screen-thumbs.mjs — regenerate the small WebP screenshots the landing page
 * and product site render.
 *
 * The source screenshots in docs/screenshots/share are full-resolution PNGs
 * (1170×2532, 1–2 MB each) kept for the presentation deck. The landing page
 * shows them at 156–300 CSS px wide, so it loads these WebP renditions
 * instead (a few tens of KB each). They are committed under web/public/screens,
 * which Next serves in dev and scripts/build.mjs copies into dist.
 *
 * Re-run after replacing a screenshot:  node scripts/screen-thumbs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
// sharp is a direct dependency of the web app; load it from there.
const sharp = createRequire(path.join(root, "web", "package.json"))("sharp");

const SOURCE_DIR = path.join(root, "docs", "screenshots", "share");
const OUT_DIR = path.join(root, "web", "public", "screens");
// 320w covers the 156px landing strip at 2x; 640w covers the 300px hero phone.
const WIDTHS = [320, 640];
// The screens the landing page and product site show (a subset of the deck).
const SCREENS = [
  "03-sexboard-home",
  "05-ask-detail",
  "07-new-ask",
  "08-inspiration",
  "10-shelf",
  "13-pile-revealed",
  "15-limits",
  "17-health",
  "18-private-vault",
  "21-privacy-data",
];

fs.mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const name of SCREENS) {
  const source = path.join(SOURCE_DIR, `${name}.png`);
  for (const width of WIDTHS) {
    const target = path.join(OUT_DIR, `${name}-${width}.webp`);
    const info = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 74, effort: 6, smartSubsample: true })
      .toFile(target);
    total += info.size;
    console.log(`${path.relative(root, target)}  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(1)} KB`);
  }
}
console.log(`total ${(total / 1024).toFixed(1)} KB`);
